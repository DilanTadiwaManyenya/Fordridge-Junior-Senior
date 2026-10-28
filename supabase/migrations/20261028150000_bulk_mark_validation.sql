create or replace function public.record_bulk_marks(
  p_title text,
  p_subject text,
  p_event_date date,
  p_academic_year integer,
  p_academic_term text,
  p_max_score numeric,
  p_entries jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  count_saved integer := 0;
  learner public.profiles;
  score_value numeric;
begin
  if public.my_role() not in ('admin', 'teacher') then
    raise exception 'Staff access required';
  end if;

  if nullif(trim(p_title), '') is null
    or nullif(trim(p_subject), '') is null
    or p_max_score is null
    or p_max_score <= 0 then
    raise exception 'Assessment title, subject and a positive maximum score are required';
  end if;

  if p_event_date is null
    or p_event_date > (now() at time zone 'Africa/Harare')::date
    or p_academic_year is null
    or p_academic_year < 2000
    or p_academic_year <> extract(year from p_event_date)::integer then
    raise exception 'Assessment date must be today or earlier and match the academic year';
  end if;

  if p_academic_term is null or p_academic_term not in ('Term 1', 'Term 2', 'Term 3') then
    raise exception 'Choose a valid academic term';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Learner marks must be supplied as a list';
  end if;
  if jsonb_array_length(p_entries) = 0 then
    raise exception 'At least one learner is required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_entries) as entries(value)
    where jsonb_typeof(value) is distinct from 'object'
      or coalesce(value->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(value->'score') is distinct from 'number'
  ) then
    raise exception 'Each learner needs a valid learner ID and a numeric mark';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) as entries(value)
    group by (value->>'student_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'A learner appears more than once in this mark list';
  end if;

  -- Serialize writes for the same learners so a rapid retry cannot pass the
  -- duplicate check concurrently with the first request.
  perform p.id
  from public.profiles p
  join jsonb_array_elements(p_entries) as entries(value)
    on p.id = (value->>'student_id')::uuid
  order by p.id
  for update of p;

  for entry in select value from jsonb_array_elements(p_entries) loop
    select * into learner
    from public.profiles p
    where p.id = (entry->>'student_id')::uuid and p.role = 'student';
    if not found then
      raise exception 'Learner not found';
    end if;
    if public.my_role() = 'teacher' and not public.teacher_has_subject_assignment(
      learner.campus_id, learner.class_level, learner.class_stream, p_subject
    ) then
      raise exception 'Subject is not allocated to you for this learner';
    end if;

    score_value := (entry->>'score')::numeric;
    if score_value < 0 or score_value > p_max_score then
      raise exception 'A mark is outside the allowed range';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) as entries(value)
    join public.learner_records r
      on r.student_id = (value->>'student_id')::uuid
    where r.kind = 'academic'
      and r.event_date = p_event_date
      and r.academic_year = p_academic_year
      and r.academic_term = p_academic_term
      and lower(trim(r.title)) = lower(trim(p_title))
      and lower(trim(coalesce(r.subject, ''))) = lower(trim(p_subject))
  ) then
    raise exception 'These marks already exist for this assessment; check the register before retrying';
  end if;

  for entry in select value from jsonb_array_elements(p_entries) loop
    score_value := (entry->>'score')::numeric;
    insert into public.learner_records(
      student_id, kind, event_date, title, subject, score, max_score,
      academic_year, academic_term, created_by
    ) values (
      (entry->>'student_id')::uuid, 'academic', p_event_date, trim(p_title),
      trim(p_subject), score_value, p_max_score, p_academic_year,
      p_academic_term, auth.uid()
    );
    count_saved := count_saved + 1;
  end loop;

  return count_saved;
end;
$$;

revoke all on function public.record_bulk_marks(text, text, date, integer, text, numeric, jsonb) from public;
grant execute on function public.record_bulk_marks(text, text, date, integer, text, numeric, jsonb) to authenticated;
