create or replace function public.preview_year_rollover_destinations(p_campus_id uuid default null)
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
  if p_campus_id is not null and not exists (
    select 1 from public.campuses campus where campus.id = p_campus_id
  ) then
    raise exception 'Select a valid campus';
  end if;

  select coalesce(jsonb_agg(to_jsonb(destination) order by lower(destination.campus_name), lower(destination.class_level), destination.id), '[]'::jsonb)
  into result
  from (
    select
      class.id,
      class.campus_id,
      campus.name as campus_name,
      class.class_level,
      class.capacity,
      count(learner.id) filter (
        where learner.id is not null
          and (learner.enrollment_status is null or learner.enrollment_status = 'active')
      )::integer as current_count,
      count(learner.id) filter (
        where learner.id is not null
          and (learner.enrollment_status is null or learner.enrollment_status = 'active')
          and exists (
            select 1 from public.school_class_streams active_stream
            where active_stream.class_id = class.id and active_stream.is_active
          )
          and not exists (
            select 1 from public.school_class_streams matching_stream
            where matching_stream.class_id = class.id and matching_stream.is_active
              and nullif(trim(learner.class_stream), '') is not null
              and lower(trim(matching_stream.stream_name)) = lower(trim(learner.class_stream))
          )
      )::integer as unmatched_stream_count,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', stream.id,
          'stream_name', stream.stream_name,
          'capacity', stream.capacity,
          'current_count', (
            select count(*)::integer
            from public.profiles stream_learner
            where stream_learner.role = 'student'
              and stream_learner.campus_id = class.campus_id
              and lower(trim(stream_learner.class_level)) = lower(trim(class.class_level))
              and lower(trim(stream_learner.class_stream)) = lower(trim(stream.stream_name))
              and (stream_learner.enrollment_status is null or stream_learner.enrollment_status = 'active')
          )
        ) order by lower(stream.stream_name), stream.id)
        from public.school_class_streams stream
        where stream.class_id = class.id and stream.is_active
      ), '[]'::jsonb) as streams
    from public.school_classes class
    join public.campuses campus on campus.id = class.campus_id
    left join public.profiles learner
      on learner.role = 'student'
      and learner.campus_id = class.campus_id
      and lower(trim(learner.class_level)) = lower(trim(class.class_level))
    where class.is_active
      and (p_campus_id is null or class.campus_id = p_campus_id)
    group by class.id, class.campus_id, campus.name, class.class_level, class.capacity
  ) destination;

  return result;
end;
$$;

comment on function public.preview_year_rollover_destinations(uuid) is
  'Main Admin-only, read-only preview of active configured rollover destinations and current active roster counts. Does not allocate or change learners.';

revoke all on function public.preview_year_rollover_destinations(uuid) from public, anon;
grant execute on function public.preview_year_rollover_destinations(uuid) to authenticated;
