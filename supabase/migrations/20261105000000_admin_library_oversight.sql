begin;

create or replace function public.admin_learning_library_oversight(
  p_campus_id uuid default null,
  p_state text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  total_count bigint,
  resource_id uuid,
  title text,
  state text,
  campus_id uuid,
  campus_name text,
  teacher_name text,
  class_level text,
  class_stream text,
  subject text,
  academic_year integer,
  academic_term text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  audience_label text,
  file_readiness text,
  active_file_name text,
  active_file_size_bytes bigint,
  pending_upload_count integer,
  finalized_file_count integer,
  file_history jsonb,
  activity_history jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' then
    raise exception 'Main Admin access required' using errcode = '42501';
  end if;
  if p_campus_id is not null and public.my_campus_id() is not null
     and p_campus_id is distinct from public.my_campus_id() then
    raise exception 'The selected campus is outside your administrator scope' using errcode = '42501';
  end if;
  if p_state is not null and p_state not in ('all','draft','published','archived') then
    raise exception 'Choose a valid library state' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Choose a page size from 1 to 100 and a non-negative offset' using errcode = '22023';
  end if;
  if length(coalesce(p_search,'')) > 120 then
    raise exception 'Search must be 120 characters or fewer' using errcode = '22023';
  end if;

  return query
  select
    count(*) over () as total_count,
    r.id,
    r.title,
    r.state,
    r.campus_id,
    c.name,
    teacher.full_name,
    r.class_level,
    r.class_stream,
    r.subject,
    r.academic_year,
    r.academic_term,
    r.published_at,
    r.created_at,
    r.updated_at,
    c.name || ' · ' || r.class_level || ' · ' || coalesce(r.class_stream, 'All streams'),
    case
      when files.active_count > 0 then 'ready'
      when files.pending_count > 0 then 'pending'
      else 'missing'
    end,
    files.active_name,
    files.active_size,
    files.pending_count,
    files.finalized_count,
    files.history,
    coalesce(activity.history, '[]'::jsonb)
  from public.learning_resources r
  join public.campuses c on c.id = r.campus_id
  left join public.profiles teacher on teacher.id = r.teacher_id
  left join lateral (
    select
      count(*) filter (where not f.ready)::integer as pending_count,
      count(*) filter (where f.ready)::integer as finalized_count,
      count(*) filter (where f.ready and f.active)::integer as active_count,
      max(f.original_name) filter (where f.ready and f.active) as active_name,
      max(f.size_bytes) filter (where f.ready and f.active) as active_size,
      coalesce(jsonb_agg(jsonb_build_object(
        'name', f.original_name,
        'extension', f.extension,
        'size_bytes', f.size_bytes,
        'ready', f.ready,
        'active', f.active,
        'created_at', f.created_at
      ) order by f.created_at desc) filter (where f.id is not null), '[]'::jsonb) as history
    from public.learning_resource_files f
    where f.resource_id = r.id
  ) files on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'action', event.action,
      'actor_name', actor.full_name,
      'created_at', event.created_at,
      'summary', coalesce(event.detail->>'state', event.detail->>'title', '')
    ) order by event.created_at desc) as history
    from (
      select a.action, a.actor_id, a.created_at, a.detail
      from public.audit_trail a
      where a.entity_type = 'learning_resource' and a.entity_id = r.id
      order by a.created_at desc
      limit 10
    ) event
    left join public.profiles actor on actor.id = event.actor_id
  ) activity on true
  where (public.my_campus_id() is null or r.campus_id = public.my_campus_id())
    and (p_campus_id is null or r.campus_id = p_campus_id)
    and (p_state is null or p_state = 'all' or r.state = p_state)
    and (nullif(btrim(p_search),'') is null or concat_ws(' ', r.title, r.class_level, r.class_stream, r.subject, teacher.full_name) ilike '%' || btrim(p_search) || '%')
  order by r.created_at desc, r.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.admin_learning_library_oversight(uuid,text,text,integer,integer) from public, anon;
grant execute on function public.admin_learning_library_oversight(uuid,text,text,integer,integer) to authenticated;

commit;
