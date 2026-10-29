alter table public.year_rollover_batch_runs
  add column reversed_by uuid references public.profiles(id) on delete restrict,
  add column reversed_at timestamptz,
  add column reversal_reason text;

alter table public.year_rollover_batch_runs
  add constraint year_rollover_batch_reversal_fields_together
  check ((reversed_at is null and reversed_by is null and reversal_reason is null)
      or (reversed_at is not null and reversed_by is not null and length(trim(reversal_reason)) >= 10));

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
    'applied_by_name', applied_by.full_name,
    'applied_at', run.applied_at,
    'learner_count', run.learner_count,
    'decision_counts', run.decision_counts,
    'capacity_unknown_count', run.capacity_unknown_count,
    'reversed_by', run.reversed_by,
    'reversed_by_name', reversed_by.full_name,
    'reversed_at', run.reversed_at,
    'reversal_reason', run.reversal_reason,
    'status', case when run.reversed_at is null then 'applied' else 'reversed' end
  ) into result
  from public.year_rollover_batch_runs run
  join public.profiles applied_by on applied_by.id = run.applied_by
  left join public.profiles reversed_by on reversed_by.id = run.reversed_by
  where run.campus_id = p_campus_id
    and run.source_academic_year = p_source_academic_year
    and run.destination_academic_year = p_destination_academic_year;
  return result;
end;
$$;

create or replace function public.preview_year_rollover_batch_reversal(
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

  with run as (
    select * from public.year_rollover_batch_runs
    where campus_id = p_campus_id and source_academic_year = p_source_academic_year
      and destination_academic_year = p_destination_academic_year
  ), learners as (
    select decision.learner_id, learner.full_name, learner.admission_number,
      decision.applied_campus_id, decision.applied_class_level, decision.applied_class_stream,
      decision.applied_enrollment_status,
      decision.current_campus_id as restore_campus_id,
      decision.current_class_level as restore_class_level,
      decision.current_class_stream as restore_class_stream,
      decision.current_enrollment_status as restore_enrollment_status,
      learner.campus_id is not distinct from decision.applied_campus_id
        and learner.class_level is not distinct from decision.applied_class_level
        and learner.class_stream is not distinct from decision.applied_class_stream
        and learner.enrollment_status is not distinct from decision.applied_enrollment_status as unchanged
    from run
    join public.year_rollover_decisions decision on decision.batch_run_id = run.id
    join public.profiles learner on learner.id = decision.learner_id
  )
  select jsonb_build_object(
    'status', case when run.reversed_at is not null then 'reversed'
      when run.id is null then 'not_applied' else 'applied' end,
    'batch_run_id', run.id,
    'learner_count', run.learner_count,
    'eligible_count', count(learners.learner_id) filter (where learners.unchanged),
    'blocked_count', count(learners.learner_id) filter (where not learners.unchanged),
    'can_reverse', run.id is not null and run.reversed_at is null
      and count(learners.learner_id) = run.learner_count
      and count(learners.learner_id) filter (where learners.unchanged) = run.learner_count,
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'learner_id', learners.learner_id,
      'full_name', learners.full_name,
      'admission_number', learners.admission_number,
      'applied_campus_id', learners.applied_campus_id,
      'applied_class_level', learners.applied_class_level,
      'applied_class_stream', learners.applied_class_stream,
      'applied_enrollment_status', learners.applied_enrollment_status,
      'restore_campus_id', learners.restore_campus_id,
      'restore_class_level', learners.restore_class_level,
      'restore_class_stream', learners.restore_class_stream,
      'restore_enrollment_status', learners.restore_enrollment_status,
      'unchanged', learners.unchanged
    ) order by learners.full_name), '[]'::jsonb)
  ) into result
  from run left join learners on true
  group by run.id, run.learner_count, run.reversed_at;
  return result;
end;
$$;

create or replace function public.reverse_year_rollover_batch(
  p_source_academic_year integer,
  p_destination_academic_year integer,
  p_campus_id uuid,
  p_expected_learner_count integer,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run public.year_rollover_batch_runs;
  expected_confirmation text;
  applied_count integer;
  unchanged_count integer;
  item record;
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_campus_id is null or p_source_academic_year is null or p_destination_academic_year is null
     or p_source_academic_year < 2000 or p_destination_academic_year <= p_source_academic_year
     or p_expected_learner_count is null or p_expected_learner_count < 1 then
    raise exception 'Select a campus, valid years, and the expected applied learner count';
  end if;
  if length(trim(coalesce(p_reason,''))) < 10 or length(trim(p_reason)) > 500 then
    raise exception 'Enter a reversal reason between 10 and 500 characters';
  end if;
  expected_confirmation := format('REVERSE YEAR ROLLOVER %s TO %s', p_source_academic_year, p_destination_academic_year);
  if trim(coalesce(p_confirmation,'')) <> expected_confirmation then
    raise exception 'Type the exact reversal confirmation before reversing this batch';
  end if;

  perform 1 from public.campuses where id = p_campus_id for update;
  if not found then raise exception 'Select a valid campus'; end if;
  select * into run from public.year_rollover_batch_runs
  where campus_id = p_campus_id and source_academic_year = p_source_academic_year
    and destination_academic_year = p_destination_academic_year for update;
  if not found then raise exception 'No applied rollover batch exists for this campus and year pair'; end if;
  if run.reversed_at is not null then
    return jsonb_build_object('already_reversed', true, 'batch_run_id', run.id,
      'learner_count', run.learner_count, 'reversed_at', run.reversed_at,
      'reversed_by', run.reversed_by, 'reversal_reason', run.reversal_reason);
  end if;
  if p_expected_learner_count <> run.learner_count then
    raise exception 'Applied learner count changed; refresh the reversal preview';
  end if;

  lock table public.profiles in share row exclusive mode;
  lock table public.year_rollover_decisions in share row exclusive mode;
  lock table public.school_classes in share row exclusive mode;
  lock table public.school_class_streams in share row exclusive mode;

  select count(*)::integer,
    count(*) filter (where learner.campus_id is not distinct from decision.applied_campus_id
      and learner.class_level is not distinct from decision.applied_class_level
      and learner.class_stream is not distinct from decision.applied_class_stream
      and learner.enrollment_status is not distinct from decision.applied_enrollment_status)::integer
  into applied_count, unchanged_count
  from public.year_rollover_decisions decision
  join public.profiles learner on learner.id = decision.learner_id
  where decision.batch_run_id = run.id;
  if applied_count <> run.learner_count then
    raise exception 'The applied learner history is incomplete; reversal is blocked';
  end if;
  if unchanged_count <> run.learner_count then
    raise exception 'Learner records changed after rollover; reversal is blocked to protect later work';
  end if;

  update public.year_rollover_batch_runs set reversed_by = auth.uid(), reversed_at = now(),
    reversal_reason = trim(p_reason)
  where id = run.id;

  for item in
    select decision.learner_id, decision.decision, decision.reason,
      decision.applied_campus_id, decision.applied_class_level, decision.applied_class_stream,
      decision.applied_enrollment_status, decision.current_campus_id as restore_campus_id,
      decision.current_class_level as restore_class_level,
      decision.current_class_stream as restore_class_stream,
      decision.current_enrollment_status as restore_enrollment_status
    from public.year_rollover_decisions decision
    where decision.batch_run_id = run.id
    order by decision.learner_id
    for update
  loop
    update public.profiles set campus_id = item.restore_campus_id,
      class_level = item.restore_class_level, class_stream = item.restore_class_stream,
      enrollment_status = item.restore_enrollment_status
    where id = item.learner_id;
    insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
    values (item.applied_campus_id,auth.uid(),'year_rollover',item.learner_id,'reversed',jsonb_build_object(
      'batch_run_id',run.id,
      'source_academic_year',p_source_academic_year,
      'destination_academic_year',p_destination_academic_year,
      'decision',item.decision,
      'original_decision_reason',item.reason,
      'reversal_reason',trim(p_reason),
      'from',jsonb_build_object('campus_id',item.applied_campus_id,'class_level',item.applied_class_level,
        'class_stream',item.applied_class_stream,'enrollment_status',item.applied_enrollment_status),
      'to',jsonb_build_object('campus_id',item.restore_campus_id,'class_level',item.restore_class_level,
        'class_stream',item.restore_class_stream,'enrollment_status',item.restore_enrollment_status)
    ));
  end loop;

  insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
  values (p_campus_id,auth.uid(),'year_rollover_batch',run.id,'reversed',jsonb_build_object(
    'source_academic_year',p_source_academic_year,
    'destination_academic_year',p_destination_academic_year,
    'learner_count',run.learner_count,
    'reversal_reason',trim(p_reason),
    'applied_by',run.applied_by,
    'applied_at',run.applied_at
  ));

  return jsonb_build_object('already_reversed',false,'batch_run_id',run.id,
    'learner_count',run.learner_count,'reversed_by',auth.uid(),'reversed_at',now(),
    'reversal_reason',trim(p_reason));
end;
$$;

revoke all on function public.preview_year_rollover_batch_reversal(integer,integer,uuid) from public, anon;
grant execute on function public.preview_year_rollover_batch_reversal(integer,integer,uuid) to authenticated;
revoke all on function public.reverse_year_rollover_batch(integer,integer,uuid,integer,text,text) from public, anon;
grant execute on function public.reverse_year_rollover_batch(integer,integer,uuid,integer,text,text) to authenticated;

comment on function public.reverse_year_rollover_batch(integer,integer,uuid,integer,text,text) is
  'Main Admin-only atomic reversal for an applied campus/year rollover; requires a reason and exact confirmation and is blocked if any learner placement changed afterward. Preserves linked learner history and appends audit events.';
