create table public.year_rollover_batch_runs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  source_academic_year integer not null check (source_academic_year >= 2000),
  destination_academic_year integer not null check (destination_academic_year > source_academic_year),
  applied_by uuid not null references public.profiles(id) on delete restrict,
  applied_at timestamptz not null default now(),
  learner_count integer not null check (learner_count > 0),
  decision_counts jsonb not null,
  capacity_unknown_count integer not null default 0 check (capacity_unknown_count >= 0),
  unique (campus_id, source_academic_year, destination_academic_year)
);

alter table public.year_rollover_batch_runs enable row level security;
create policy "main admins read rollover batch runs"
  on public.year_rollover_batch_runs for select to authenticated
  using (public.my_role() = 'admin' and public.is_current_main_admin());
revoke all on public.year_rollover_batch_runs from public, anon, authenticated;
grant select on public.year_rollover_batch_runs to authenticated;

alter table public.year_rollover_decisions
  add column batch_run_id uuid references public.year_rollover_batch_runs(id) on delete restrict,
  add column applied_by uuid references public.profiles(id) on delete restrict,
  add column applied_at timestamptz,
  add column applied_campus_id uuid references public.campuses(id) on delete restrict,
  add column applied_class_level text,
  add column applied_class_stream text,
  add column applied_enrollment_status text;

create or replace function public.prevent_applied_rollover_decision_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.batch_run_id is not null then
    raise exception 'This rollover decision was applied and is locked';
  end if;
  return new;
end;
$$;

create trigger lock_applied_year_rollover_decisions
before update on public.year_rollover_decisions
for each row execute function public.prevent_applied_rollover_decision_changes();

create or replace function public.year_rollover_batch_run_status(
  p_source_academic_year integer,
  p_destination_academic_year integer,
  p_campus_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_campus_id is null or p_source_academic_year is null or p_destination_academic_year is null
     or p_source_academic_year < 2000 or p_destination_academic_year <= p_source_academic_year then
    raise exception 'Select a campus and valid source/destination years';
  end if;
  select jsonb_build_object(
    'id', run.id,
    'campus_id', run.campus_id,
    'source_academic_year', run.source_academic_year,
    'destination_academic_year', run.destination_academic_year,
    'applied_by', run.applied_by,
    'applied_by_name', reviewer.full_name,
    'applied_at', run.applied_at,
    'learner_count', run.learner_count,
    'decision_counts', run.decision_counts,
    'capacity_unknown_count', run.capacity_unknown_count,
    'status', 'applied'
  ) into result
  from public.year_rollover_batch_runs run
  join public.profiles reviewer on reviewer.id = run.applied_by
  where run.campus_id = p_campus_id
    and run.source_academic_year = p_source_academic_year
    and run.destination_academic_year = p_destination_academic_year;
  return result;
end;
$$;

create or replace function public.apply_year_rollover_batch(
  p_source_academic_year integer,
  p_destination_academic_year integer,
  p_campus_id uuid,
  p_expected_learner_count integer,
  p_confirmation text,
  p_accept_unknown_capacity boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  campus_row public.campuses;
  existing_run public.year_rollover_batch_runs;
  run_id uuid;
  preflight jsonb;
  summary jsonb;
  expected_confirmation text;
  active_count integer;
  capacity_unknown_count integer;
  counts_by_decision jsonb := jsonb_build_object('promote',0,'retain',0,'transfer',0,'complete',0);
  item record;
  target_campus uuid;
  target_class text;
  target_stream text;
  next_status text;
  applied_count integer := 0;
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_campus_id is null or p_source_academic_year is null or p_destination_academic_year is null
     or p_source_academic_year < 2000 or p_destination_academic_year <= p_source_academic_year
     or p_expected_learner_count is null or p_expected_learner_count < 1 then
    raise exception 'Select a campus, valid years, and the expected active learner count';
  end if;
  expected_confirmation := format('APPLY YEAR ROLLOVER %s TO %s', p_source_academic_year, p_destination_academic_year);
  if trim(coalesce(p_confirmation,'')) <> expected_confirmation then
    raise exception 'Type the exact rollover confirmation before applying this batch';
  end if;

  select * into campus_row from public.campuses where id = p_campus_id for update;
  if not found then raise exception 'Select a valid campus'; end if;

  select * into existing_run from public.year_rollover_batch_runs
  where campus_id = p_campus_id and source_academic_year = p_source_academic_year
    and destination_academic_year = p_destination_academic_year;
  if found then
    return jsonb_build_object(
      'already_applied', true, 'batch_run_id', existing_run.id,
      'learner_count', existing_run.learner_count,
      'decision_counts', existing_run.decision_counts,
      'capacity_unknown_count', existing_run.capacity_unknown_count,
      'applied_at', existing_run.applied_at
    );
  end if;

  -- The batch is a single short transaction. Block concurrent profile/decision/catalogue writes
  -- so the validated campus roster and destinations cannot change between preflight and commit.
  lock table public.profiles in share row exclusive mode;
  lock table public.year_rollover_decisions in share row exclusive mode;
  lock table public.school_classes in share row exclusive mode;
  lock table public.school_class_streams in share row exclusive mode;

  select count(*)::integer into active_count from public.profiles learner
  where learner.role='student' and learner.enrollment_status='active' and learner.campus_id=p_campus_id;
  if active_count <> p_expected_learner_count then
    raise exception 'Active roster changed since preview; refresh the batch before applying';
  end if;

  preflight := public.preview_year_rollover_batch(
    p_source_academic_year, p_destination_academic_year, p_campus_id, 1, 1
  );
  summary := preflight->'summary';
  if coalesce((summary->>'active_learners')::integer,0) <> active_count
     or coalesce((summary->>'ready_for_review')::integer,0) <> active_count then
    raise exception 'Batch is not ready: review missing decisions, stale profiles, and every required destination';
  end if;
  if coalesce((summary->>'capacity_exceeded')::integer,0) > 0 then
    raise exception 'Batch exceeds configured destination capacity; revise placements before applying';
  end if;
  capacity_unknown_count := coalesce((summary->>'capacity_unknown')::integer,0);
  if capacity_unknown_count > 0 and not coalesce(p_accept_unknown_capacity,false) then
    raise exception 'Destination capacity is unset; explicitly acknowledge the unknown capacity before applying';
  end if;

  insert into public.year_rollover_batch_runs(
    campus_id, source_academic_year, destination_academic_year, applied_by,
    learner_count, decision_counts, capacity_unknown_count
  ) values (
    p_campus_id, p_source_academic_year, p_destination_academic_year, auth.uid(),
    active_count, counts_by_decision, capacity_unknown_count
  ) returning id into run_id;

  for item in
    select learner.id as learner_id, learner.full_name, learner.campus_id as source_campus_id,
      learner.class_level as source_class_level, learner.class_stream as source_class_stream,
      learner.enrollment_status as source_enrollment_status,
      decision.id as decision_id, decision.decision, decision.reason,
      target.campus_id as target_campus_id, target.class_level as target_class_level,
      target_stream.stream_name as target_stream_name
    from public.profiles learner
    join public.year_rollover_decisions decision on decision.learner_id=learner.id
      and decision.source_academic_year=p_source_academic_year
      and decision.destination_academic_year=p_destination_academic_year
    left join public.school_classes target on target.id=decision.destination_class_id
    left join public.school_class_streams target_stream on target_stream.id=decision.destination_stream_id
    where learner.role='student' and learner.enrollment_status='active' and learner.campus_id=p_campus_id
    order by learner.id
    for update of learner, decision
  loop
    if item.decision in ('promote','retain') then
      target_campus := item.target_campus_id;
      target_class := item.target_class_level;
      target_stream := item.target_stream_name;
      next_status := 'active';
    elsif item.decision = 'transfer' then
      target_campus := item.source_campus_id;
      target_class := item.source_class_level;
      target_stream := item.source_class_stream;
      next_status := 'transferred';
    else
      target_campus := item.source_campus_id;
      target_class := item.source_class_level;
      target_stream := item.source_class_stream;
      next_status := 'graduated';
    end if;

    update public.profiles set campus_id=target_campus, class_level=target_class,
      class_stream=target_stream, enrollment_status=next_status
    where id=item.learner_id;

    update public.year_rollover_decisions set
      batch_run_id=run_id, applied_by=auth.uid(), applied_at=now(),
      applied_campus_id=target_campus, applied_class_level=target_class,
      applied_class_stream=target_stream, applied_enrollment_status=next_status
    where id=item.decision_id;

    insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
    values (item.source_campus_id,auth.uid(),'year_rollover',item.learner_id,'applied',jsonb_build_object(
      'batch_run_id',run_id,
      'source_academic_year',p_source_academic_year,
      'destination_academic_year',p_destination_academic_year,
      'decision',item.decision,
      'reason',item.reason,
      'from',jsonb_build_object('campus_id',item.source_campus_id,'class_level',item.source_class_level,
        'class_stream',item.source_class_stream,'enrollment_status',item.source_enrollment_status),
      'to',jsonb_build_object('campus_id',target_campus,'class_level',target_class,
        'class_stream',target_stream,'enrollment_status',next_status)
    ));

    counts_by_decision := jsonb_set(counts_by_decision,array[item.decision],
      to_jsonb(coalesce((counts_by_decision->>item.decision)::integer,0)+1),true);
    applied_count := applied_count + 1;
  end loop;

  if applied_count <> active_count then
    raise exception 'The active roster changed during application; the entire batch was rolled back';
  end if;

  update public.year_rollover_batch_runs set decision_counts=counts_by_decision
  where id=run_id;
  insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
  values (p_campus_id,auth.uid(),'year_rollover_batch',run_id,'applied',jsonb_build_object(
    'source_academic_year',p_source_academic_year,
    'destination_academic_year',p_destination_academic_year,
    'learner_count',applied_count,
    'decision_counts',counts_by_decision,
    'capacity_unknown_count',capacity_unknown_count
  ));

  return jsonb_build_object(
    'already_applied',false,'batch_run_id',run_id,'learner_count',applied_count,
    'decision_counts',counts_by_decision,'capacity_unknown_count',capacity_unknown_count,'applied_at',now()
  );
end;
$$;

revoke all on function public.year_rollover_batch_run_status(integer,integer,uuid) from public, anon;
grant execute on function public.year_rollover_batch_run_status(integer,integer,uuid) to authenticated;
revoke all on function public.apply_year_rollover_batch(integer,integer,uuid,integer,text,boolean) from public, anon;
grant execute on function public.apply_year_rollover_batch(integer,integer,uuid,integer,text,boolean) to authenticated;

comment on function public.apply_year_rollover_batch(integer,integer,uuid,integer,text,boolean) is
  'Main Admin-only atomic campus/year rollover. Requires explicit confirmation, fresh complete review, and an unknown-capacity acknowledgement when needed. Preserves all learner-linked records.';
