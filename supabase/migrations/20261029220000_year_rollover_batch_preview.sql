alter table public.year_rollover_decisions
  add column destination_class_id uuid references public.school_classes(id) on delete restrict,
  add column destination_stream_id uuid references public.school_class_streams(id) on delete restrict;

create or replace function public.clear_nonplacement_rollover_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.decision in ('transfer', 'complete') then
    new.destination_class_id := null;
    new.destination_stream_id := null;
  end if;
  return new;
end;
$$;

create trigger clear_nonplacement_rollover_target_before_update
before update of decision on public.year_rollover_decisions
for each row execute function public.clear_nonplacement_rollover_target();

revoke all on function public.clear_nonplacement_rollover_target() from public, anon, authenticated;

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
declare result jsonb;
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
    'learner_id', decision.learner_id, 'decision', decision.decision, 'reason', decision.reason,
    'reviewed_at', decision.reviewed_at, 'reviewer_name', reviewer.full_name,
    'current_campus_id', decision.current_campus_id, 'current_class_level', decision.current_class_level,
    'current_class_stream', decision.current_class_stream, 'current_enrollment_status', decision.current_enrollment_status,
    'destination_class_id', decision.destination_class_id, 'destination_stream_id', decision.destination_stream_id
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

create or replace function public.save_year_rollover_placement(
  p_learner_id uuid,
  p_source_academic_year integer,
  p_destination_academic_year integer,
  p_destination_class_id uuid,
  p_destination_stream_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  decision_row public.year_rollover_decisions;
  learner public.profiles;
  target_class public.school_classes;
  target_stream public.school_class_streams;
  has_active_streams boolean;
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_source_academic_year is null or p_destination_academic_year is null
     or p_source_academic_year < 2000 or p_destination_academic_year <= p_source_academic_year then
    raise exception 'Choose a valid source and later destination academic year';
  end if;

  select * into learner from public.profiles where id = p_learner_id and role = 'student' for update;
  if not found then raise exception 'Learner profile not found'; end if;
  select * into decision_row from public.year_rollover_decisions
  where learner_id = p_learner_id and source_academic_year = p_source_academic_year
    and destination_academic_year = p_destination_academic_year for update;
  if not found then raise exception 'Record a reviewed learner decision before planning a placement'; end if;
  if decision_row.decision not in ('promote', 'retain') then
    raise exception 'Transfer and Complete decisions do not take an internal class placement';
  end if;
  if learner.enrollment_status is distinct from 'active'
     or learner.campus_id is distinct from decision_row.current_campus_id
     or learner.class_level is distinct from decision_row.current_class_level
     or learner.class_stream is distinct from decision_row.current_class_stream
     or learner.enrollment_status is distinct from decision_row.current_enrollment_status then
    raise exception 'Learner roster changed since review; refresh decisions before planning placement';
  end if;

  if p_destination_class_id is null then
    if p_destination_stream_id is not null then raise exception 'Choose a destination class before a stream'; end if;
  else
    select * into target_class from public.school_classes
    where id = p_destination_class_id and is_active for share;
    if not found then raise exception 'Choose an active configured destination class'; end if;
    select exists(select 1 from public.school_class_streams
      where class_id = target_class.id and is_active) into has_active_streams;
    if has_active_streams and p_destination_stream_id is null then
      raise exception 'Choose a configured destination stream';
    end if;
    if not has_active_streams and p_destination_stream_id is not null then
      raise exception 'This destination class has no active streams';
    end if;
    if p_destination_stream_id is not null then
      select * into target_stream from public.school_class_streams
      where id = p_destination_stream_id and class_id = target_class.id and is_active for share;
      if not found then raise exception 'Choose an active stream belonging to the destination class'; end if;
    end if;
  end if;

  update public.year_rollover_decisions
  set destination_class_id = p_destination_class_id,
      destination_stream_id = p_destination_stream_id,
      reviewed_at = now(), reviewed_by = auth.uid()
  where id = decision_row.id;
  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (learner.campus_id, auth.uid(), 'year_rollover_decision', learner.id, 'placement_proposed',
    jsonb_build_object('source_academic_year', p_source_academic_year,
      'destination_academic_year', p_destination_academic_year,
      'destination_class_id', p_destination_class_id, 'destination_stream_id', p_destination_stream_id));
end;
$$;

create or replace function public.preview_year_rollover_batch(
  p_source_academic_year integer,
  p_destination_academic_year integer,
  p_campus_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_source_academic_year is null or p_destination_academic_year is null
     or p_source_academic_year < 2000 or p_destination_academic_year <= p_source_academic_year then
    raise exception 'Choose a valid source and later destination academic year';
  end if;
  if p_campus_id is not null and not exists(select 1 from public.campuses where id = p_campus_id) then
    raise exception 'Select a valid campus';
  end if;

  with active_learners as (
    select p.id, p.full_name, p.admission_number, p.campus_id, campus.name as campus_name,
      p.class_level, p.class_stream, p.enrollment_status
    from public.profiles p left join public.campuses campus on campus.id = p.campus_id
    where p.role = 'student' and p.enrollment_status = 'active'
      and (p_campus_id is null or p.campus_id = p_campus_id)
  ), reviewed as (
    select learner.*, decision.id as decision_id, decision.decision, decision.reason,
      decision.reviewed_at, reviewer.full_name as reviewer_name,
      decision.current_campus_id, decision.current_class_level, decision.current_class_stream,
      decision.current_enrollment_status, decision.destination_class_id, decision.destination_stream_id,
      target_campus.name as destination_campus_name, target.class_level as destination_class_level,
      target.capacity as class_capacity, target.is_active as destination_class_active,
      target_stream.stream_name as destination_stream_name, target_stream.capacity as stream_capacity,
      target_stream.is_active as destination_stream_active,
      exists(select 1 from public.school_class_streams active_stream
        where active_stream.class_id = target.id and active_stream.is_active) as destination_has_streams,
      (learner.campus_id is not distinct from decision.current_campus_id
        and learner.class_level is not distinct from decision.current_class_level
        and learner.class_stream is not distinct from decision.current_class_stream
        and learner.enrollment_status is not distinct from decision.current_enrollment_status) as roster_unchanged,
      (decision.decision in ('transfer','complete') or
        (decision.decision in ('promote','retain') and target.id is not null and target.is_active
          and ((not exists(select 1 from public.school_class_streams active_stream
                where active_stream.class_id = target.id and active_stream.is_active)
               and decision.destination_stream_id is null)
            or (target_stream.id is not null and target_stream.is_active and target_stream.class_id = target.id)))) as placement_valid
    from active_learners learner
    left join public.year_rollover_decisions decision on decision.learner_id = learner.id
      and decision.source_academic_year = p_source_academic_year
      and decision.destination_academic_year = p_destination_academic_year
    left join public.profiles reviewer on reviewer.id = decision.reviewed_by
    left join public.school_classes target on target.id = decision.destination_class_id
    left join public.campuses target_campus on target_campus.id = target.campus_id
    left join public.school_class_streams target_stream on target_stream.id = decision.destination_stream_id
  ), assessed as (
    select reviewed.*,
      case when decision_id is null then 'needs_decision'
        when not roster_unchanged then 'stale_roster'
        when decision in ('promote','retain') and destination_class_id is null then 'placement_missing'
        when not placement_valid then 'destination_unavailable'
        else 'ready_for_review' end as review_status,
      case when destination_class_id is null then false
        when destination_has_streams then stream_capacity is null
        else class_capacity is null end as capacity_unknown,
      case
        when decision in ('transfer','complete') then 'not_applicable'
        when decision_id is null or not placement_valid then 'not_checked'
        when destination_has_streams and stream_capacity is null then 'unknown'
        when not destination_has_streams and class_capacity is null then 'unknown'
        when destination_has_streams and (
          (select count(*) from public.profiles current_learner
            where current_learner.role='student' and current_learner.enrollment_status='active'
              and current_learner.campus_id=(select campus_id from public.school_classes where id=destination_class_id)
              and lower(trim(current_learner.class_level))=lower(trim(destination_class_level))
              and lower(trim(current_learner.class_stream))=lower(trim(destination_stream_name))
              and not exists(select 1 from public.year_rollover_decisions outgoing
                where outgoing.learner_id=current_learner.id
                  and outgoing.source_academic_year=p_source_academic_year
                  and outgoing.destination_academic_year=p_destination_academic_year
                  and (outgoing.decision in ('transfer','complete')
                    or (outgoing.decision in ('promote','retain') and outgoing.destination_class_id is not null)))
          ) + (select count(*) from public.year_rollover_decisions incoming
            join public.profiles incoming_learner on incoming_learner.id=incoming.learner_id
            where incoming.source_academic_year=p_source_academic_year
              and incoming.destination_academic_year=p_destination_academic_year
              and incoming.decision in ('promote','retain')
              and incoming.destination_class_id=destination_class_id
              and incoming.destination_stream_id=destination_stream_id
              and incoming_learner.role='student' and incoming_learner.enrollment_status='active'
              and incoming_learner.campus_id is not distinct from incoming.current_campus_id
              and incoming_learner.class_level is not distinct from incoming.current_class_level
              and incoming_learner.class_stream is not distinct from incoming.current_class_stream)
        ) > stream_capacity then 'over_capacity'
        when not destination_has_streams and (
          (select count(*) from public.profiles current_learner
            where current_learner.role='student' and current_learner.enrollment_status='active'
              and current_learner.campus_id=(select campus_id from public.school_classes where id=destination_class_id)
              and lower(trim(current_learner.class_level))=lower(trim(destination_class_level))
              and not exists(select 1 from public.year_rollover_decisions outgoing
                where outgoing.learner_id=current_learner.id
                  and outgoing.source_academic_year=p_source_academic_year
                  and outgoing.destination_academic_year=p_destination_academic_year
                  and (outgoing.decision in ('transfer','complete')
                    or (outgoing.decision in ('promote','retain') and outgoing.destination_class_id is not null)))
          ) + (select count(*) from public.year_rollover_decisions incoming
            join public.profiles incoming_learner on incoming_learner.id=incoming.learner_id
            where incoming.source_academic_year=p_source_academic_year
              and incoming.destination_academic_year=p_destination_academic_year
              and incoming.decision in ('promote','retain')
              and incoming.destination_class_id=destination_class_id
              and incoming.destination_stream_id is null
              and incoming_learner.role='student' and incoming_learner.enrollment_status='active'
              and incoming_learner.campus_id is not distinct from incoming.current_campus_id
              and incoming_learner.class_level is not distinct from incoming.current_class_level
              and incoming_learner.class_stream is not distinct from incoming.current_class_stream)
        ) > class_capacity then 'over_capacity'
        else 'within_capacity'
      end as capacity_status
    from reviewed
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page_rows.id, 'full_name', page_rows.full_name, 'admission_number', page_rows.admission_number,
      'campus_id', page_rows.campus_id, 'campus_name', page_rows.campus_name,
      'class_level', page_rows.class_level, 'class_stream', page_rows.class_stream,
      'decision', page_rows.decision, 'reason', page_rows.reason, 'reviewed_at', page_rows.reviewed_at,
      'reviewer_name', page_rows.reviewer_name, 'destination_class_id', page_rows.destination_class_id,
      'destination_stream_id', page_rows.destination_stream_id,
      'destination_campus_name', page_rows.destination_campus_name,
      'destination_class_level', page_rows.destination_class_level,
      'destination_stream_name', page_rows.destination_stream_name,
      'review_status', page_rows.review_status, 'capacity_unknown', page_rows.capacity_unknown,
      'capacity_status', page_rows.capacity_status
    ) order by lower(coalesce(page_rows.full_name,'')), page_rows.id)
      from (select * from assessed order by lower(coalesce(full_name,'')), id
        offset (safe_page-1)*safe_page_size limit safe_page_size) page_rows), '[]'::jsonb),
    'total_count', (select count(*) from assessed),
    'page', safe_page, 'page_size', safe_page_size,
    'total_pages', greatest(1, ceil((select count(*)::numeric from assessed)/safe_page_size)::integer),
    'summary', (select jsonb_build_object(
      'active_learners', count(*),
      'decisions_recorded', count(*) filter(where decision_id is not null),
      'needs_decision', count(*) filter(where review_status='needs_decision'),
      'placements_missing', count(*) filter(where review_status='placement_missing'),
      'stale_roster', count(*) filter(where review_status='stale_roster'),
      'destinations_unavailable', count(*) filter(where review_status='destination_unavailable'),
      'ready_for_review', count(*) filter(where review_status='ready_for_review'),
      'capacity_exceeded', count(*) filter(where capacity_status='over_capacity'),
      'capacity_unknown', count(*) filter(where capacity_status='unknown')
    ) from assessed)
  ) into result;
  return result;
end;
$$;

revoke all on function public.save_year_rollover_placement(uuid,integer,integer,uuid,uuid) from public, anon;
grant execute on function public.save_year_rollover_placement(uuid,integer,integer,uuid,uuid) to authenticated;
revoke all on function public.preview_year_rollover_batch(integer,integer,uuid,integer,integer) from public, anon;
grant execute on function public.preview_year_rollover_batch(integer,integer,uuid,integer,integer) to authenticated;
