create or replace function public.preview_year_rollover(
  p_campus_id uuid default null,
  p_search text default null,
  p_readiness text default null,
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
  search_term text := nullif(trim(p_search), '');
begin
  if public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_campus_id is not null and not exists (
    select 1 from public.campuses campus where campus.id = p_campus_id
  ) then
    raise exception 'Select a valid campus';
  end if;
  if p_readiness is not null and p_readiness not in (
    'ready_for_decision', 'needs_review', 'not_currently_active'
  ) then
    raise exception 'Choose a valid rollover review status';
  end if;

  with candidates as (
    select
      learner.id,
      learner.full_name,
      learner.admission_number,
      learner.campus_id,
      campus.name as campus_name,
      learner.class_level,
      learner.class_stream,
      learner.enrollment_status,
      case
        when learner.enrollment_status is null then 'needs_review'
        when learner.enrollment_status <> 'active' then 'not_currently_active'
        when learner.campus_id is null then 'needs_review'
        when nullif(trim(learner.class_level), '') is null then 'needs_review'
        else 'ready_for_decision'
      end as readiness,
      array_remove(array[
        case when learner.enrollment_status is null then 'Enrolment status is not recorded.' end,
        case when learner.enrollment_status is not null and learner.enrollment_status <> 'active'
          then 'Learner is marked ' || learner.enrollment_status || ' and is not in the active roster.' end,
        case when learner.campus_id is null then 'Campus is not recorded.' end,
        case when nullif(trim(learner.class_level), '') is null then 'Class / form is not recorded.' end
      ], null) as review_reasons
    from public.profiles learner
    left join public.campuses campus on campus.id = learner.campus_id
    where learner.role = 'student'
      and (p_campus_id is null or learner.campus_id = p_campus_id)
  ), filtered as (
    select candidate.* from candidates candidate
    where (p_readiness is null or candidate.readiness = p_readiness)
      and (search_term is null or concat_ws(' ', candidate.full_name,
        candidate.admission_number, candidate.campus_name, candidate.class_level,
        candidate.class_stream, candidate.enrollment_status) ilike '%' || search_term || '%')
  ), page_rows as (
    select filtered.* from filtered
    order by lower(coalesce(filtered.full_name, '')), filtered.id
    offset (safe_page - 1) * safe_page_size
    limit safe_page_size
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page_rows) order by lower(coalesce(page_rows.full_name, '')), page_rows.id) from page_rows), '[]'::jsonb),
    'total_count', (select count(*) from filtered),
    'page', safe_page,
    'page_size', safe_page_size,
    'total_pages', greatest(1, ceil((select count(*)::numeric from filtered) / safe_page_size)::integer),
    'summary', (
      select jsonb_build_object(
        'ready_for_decision', count(*) filter (where candidates.readiness = 'ready_for_decision'),
        'needs_review', count(*) filter (where candidates.readiness = 'needs_review'),
        'not_currently_active', count(*) filter (where candidates.readiness = 'not_currently_active')
      ) from candidates
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.preview_year_rollover(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.preview_year_rollover(uuid, text, text, integer, integer) to authenticated;
