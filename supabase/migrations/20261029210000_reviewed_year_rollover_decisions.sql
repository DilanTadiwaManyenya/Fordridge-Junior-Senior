create table public.year_rollover_decisions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete restrict,
  source_academic_year integer not null check (source_academic_year >= 2000),
  destination_academic_year integer not null check (destination_academic_year > source_academic_year),
  decision text not null check (decision in ('promote', 'retain', 'transfer', 'complete')),
  reason text not null check (length(trim(reason)) between 10 and 500),
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  current_campus_id uuid references public.campuses(id) on delete restrict,
  current_class_level text not null,
  current_class_stream text,
  current_enrollment_status text not null,
  unique (learner_id, source_academic_year, destination_academic_year)
);

create index year_rollover_decisions_cycle_campus_idx
  on public.year_rollover_decisions(source_academic_year, destination_academic_year, current_campus_id, learner_id);

alter table public.year_rollover_decisions enable row level security;

create policy "main admins read rollover decisions"
  on public.year_rollover_decisions for select to authenticated
  using (public.my_role() = 'admin' and public.is_current_main_admin());

revoke all on public.year_rollover_decisions from public, anon, authenticated;
grant select on public.year_rollover_decisions to authenticated;

create or replace function public.preview_year_rollover_decisions(
  p_learner_ids uuid[],
  p_source_academic_year integer,
  p_destination_academic_year integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_source_academic_year is null or p_destination_academic_year is null
     or p_source_academic_year < 2000 or p_destination_academic_year <= p_source_academic_year then
    raise exception 'Choose a valid source and later destination academic year';
  end if;
  if coalesce(cardinality(p_learner_ids), 0) > 100 then
    raise exception 'Request at most 100 learner decisions at a time';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'learner_id', decision.learner_id,
    'decision', decision.decision,
    'reason', decision.reason,
    'reviewed_at', decision.reviewed_at,
    'reviewer_name', reviewer.full_name,
    'current_campus_id', decision.current_campus_id,
    'current_class_level', decision.current_class_level,
    'current_class_stream', decision.current_class_stream,
    'current_enrollment_status', decision.current_enrollment_status
  ) order by decision.learner_id), '[]'::jsonb)
  into result
  from public.year_rollover_decisions decision
  join public.profiles reviewer on reviewer.id = decision.reviewed_by
  where decision.learner_id = any(coalesce(p_learner_ids, '{}'::uuid[]))
    and decision.source_academic_year = p_source_academic_year
    and decision.destination_academic_year = p_destination_academic_year;

  return result;
end;
$$;

create or replace function public.save_year_rollover_decision(
  p_learner_id uuid,
  p_source_academic_year integer,
  p_destination_academic_year integer,
  p_decision text,
  p_reason text,
  p_expected_campus_id uuid,
  p_expected_class_level text,
  p_expected_class_stream text,
  p_expected_enrollment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  learner public.profiles;
  prior_decision public.year_rollover_decisions;
  reason text := trim(coalesce(p_reason, ''));
  next_decision text := lower(trim(coalesce(p_decision, '')));
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_source_academic_year is null or p_destination_academic_year is null
     or p_source_academic_year < 2000 or p_destination_academic_year <= p_source_academic_year then
    raise exception 'Choose a valid source and later destination academic year';
  end if;
  if next_decision not in ('promote', 'retain', 'transfer', 'complete') then
    raise exception 'Choose Promote, Retain, Transfer, or Complete';
  end if;
  if length(reason) < 10 or length(reason) > 500 then
    raise exception 'Decision reason must be between 10 and 500 characters';
  end if;

  select * into learner
  from public.profiles
  where id = p_learner_id and role = 'student'
  for update;
  if not found then
    raise exception 'Learner profile not found';
  end if;
  if learner.enrollment_status is distinct from 'active'
     or learner.campus_id is null or nullif(trim(learner.class_level), '') is null then
    raise exception 'Only an active learner with recorded campus and class can receive a rollover decision';
  end if;
  if learner.campus_id is distinct from p_expected_campus_id
     or learner.class_level is distinct from p_expected_class_level
     or learner.class_stream is distinct from p_expected_class_stream
     or learner.enrollment_status is distinct from p_expected_enrollment_status then
    raise exception 'Learner roster changed since review; refresh the preview before saving';
  end if;

  select * into prior_decision
  from public.year_rollover_decisions
  where learner_id = p_learner_id
    and source_academic_year = p_source_academic_year
    and destination_academic_year = p_destination_academic_year
  for update;

  insert into public.year_rollover_decisions(
    learner_id, source_academic_year, destination_academic_year, decision, reason,
    reviewed_by, reviewed_at, current_campus_id, current_class_level,
    current_class_stream, current_enrollment_status
  ) values (
    p_learner_id, p_source_academic_year, p_destination_academic_year, next_decision, reason,
    auth.uid(), now(), learner.campus_id, learner.class_level,
    learner.class_stream, learner.enrollment_status
  )
  on conflict (learner_id, source_academic_year, destination_academic_year)
  do update set decision = excluded.decision,
                reason = excluded.reason,
                reviewed_by = excluded.reviewed_by,
                reviewed_at = excluded.reviewed_at,
                current_campus_id = excluded.current_campus_id,
                current_class_level = excluded.current_class_level,
                current_class_stream = excluded.current_class_stream,
                current_enrollment_status = excluded.current_enrollment_status;

  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (
    learner.campus_id, auth.uid(), 'year_rollover_decision', p_learner_id,
    case when prior_decision.id is null then 'recorded' else 'amended' end,
    jsonb_build_object(
      'source_academic_year', p_source_academic_year,
      'destination_academic_year', p_destination_academic_year,
      'decision', jsonb_build_object('from', prior_decision.decision, 'to', next_decision),
      'reason', reason,
      'current_class_level', learner.class_level,
      'current_class_stream', learner.class_stream
    )
  );

  return jsonb_build_object('learner_id', p_learner_id, 'decision', next_decision, 'reviewed_at', now());
end;
$$;

revoke all on function public.preview_year_rollover_decisions(uuid[], integer, integer) from public, anon;
grant execute on function public.preview_year_rollover_decisions(uuid[], integer, integer) to authenticated;
revoke all on function public.save_year_rollover_decision(uuid, integer, integer, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.save_year_rollover_decision(uuid, integer, integer, text, text, uuid, text, text, text) to authenticated;

comment on table public.year_rollover_decisions is
  'Main Admin reviewed intent only. Decisions never change a learner profile or assign a destination class or stream.';
