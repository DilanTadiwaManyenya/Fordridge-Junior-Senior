alter table public.learner_records
  add column assessment_type text not null default 'markbook'
    check (assessment_type in ('markbook', 'coursework'));

create index learner_academic_type_period_idx
  on public.learner_records(student_id, academic_year, academic_term, assessment_type)
  where kind = 'academic';

create or replace function public.record_bulk_marks(
  p_title text,
  p_subject text,
  p_event_date date,
  p_academic_year integer,
  p_academic_term text,
  p_max_score numeric,
  p_entries jsonb,
  p_assessment_type text
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
  if p_assessment_type is null or p_assessment_type not in ('markbook', 'coursework') then
    raise exception 'Choose a supported assessment type';
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
    select 1 from jsonb_array_elements(p_entries) as entries(value)
    where jsonb_typeof(value) is distinct from 'object'
      or coalesce(value->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(value->'score') is distinct from 'number'
  ) then
    raise exception 'Each learner needs a valid learner ID and a numeric mark';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) as entries(value)
    group by (value->>'student_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'A learner appears more than once in this mark list';
  end if;

  -- Lock submitted learners in stable order so concurrent retries serialize.
  perform p.id
  from public.profiles p
  join jsonb_array_elements(p_entries) as entries(value)
    on p.id = (value->>'student_id')::uuid
  order by p.id
  for update of p;

  for entry in select value from jsonb_array_elements(p_entries) loop
    select * into learner from public.profiles p
      where p.id = (entry->>'student_id')::uuid and p.role = 'student';
    if not found then raise exception 'Learner not found'; end if;
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
    join public.profiles p on p.id = (value->>'student_id')::uuid
    join public.report_publications publication
      on publication.campus_id = p.campus_id
      and publication.academic_year = p_academic_year
      and publication.academic_term = p_academic_term
      and publication.published_at is not null
  ) then
    raise exception 'This academic period has been published; contact an administrator before changing marks';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) as entries(value)
    join public.learner_records r on r.student_id = (value->>'student_id')::uuid
    where r.kind = 'academic'
      and r.event_date = p_event_date
      and r.academic_year = p_academic_year
      and r.academic_term = p_academic_term
      and r.assessment_type = p_assessment_type
      and lower(trim(r.title)) = lower(trim(p_title))
      and lower(trim(coalesce(r.subject, ''))) = lower(trim(p_subject))
  ) then
    raise exception 'These marks already exist for this assessment; check the register before retrying';
  end if;

  for entry in select value from jsonb_array_elements(p_entries) loop
    insert into public.learner_records(
      student_id, kind, event_date, title, subject, score, max_score,
      academic_year, academic_term, created_by, assessment_type
    ) values (
      (entry->>'student_id')::uuid, 'academic', p_event_date, trim(p_title),
      trim(p_subject), (entry->>'score')::numeric, p_max_score,
      p_academic_year, p_academic_term, auth.uid(), p_assessment_type
    );
    count_saved := count_saved + 1;
  end loop;
  return count_saved;
end;
$$;

create or replace function public.record_bulk_marks(
  p_title text,
  p_subject text,
  p_event_date date,
  p_academic_year integer,
  p_academic_term text,
  p_max_score numeric,
  p_entries jsonb
) returns integer
language sql
security definer
set search_path = public
as $$
  select public.record_bulk_marks(
    p_title, p_subject, p_event_date, p_academic_year, p_academic_term,
    p_max_score, p_entries, 'markbook'
  );
$$;

create or replace function public.record_bulk_coursework_marks(
  p_title text,
  p_subject text,
  p_event_date date,
  p_academic_year integer,
  p_academic_term text,
  p_max_score numeric,
  p_entries jsonb
) returns integer
language sql
security definer
set search_path = public
as $$
  select public.record_bulk_marks(
    p_title, p_subject, p_event_date, p_academic_year, p_academic_term,
    p_max_score, p_entries, 'coursework'
  );
$$;

revoke all on function public.record_bulk_marks(text, text, date, integer, text, numeric, jsonb, text) from public, anon, authenticated;
revoke all on function public.record_bulk_marks(text, text, date, integer, text, numeric, jsonb) from public, anon;
grant execute on function public.record_bulk_marks(text, text, date, integer, text, numeric, jsonb) to authenticated;
revoke all on function public.record_bulk_coursework_marks(text, text, date, integer, text, numeric, jsonb) from public, anon;
grant execute on function public.record_bulk_coursework_marks(text, text, date, integer, text, numeric, jsonb) to authenticated;

create or replace function public.guard_published_learner_record_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' and old.kind = 'academic' and exists (
    select 1 from public.profiles p
    join public.report_publications publication on publication.campus_id = p.campus_id
    where p.id = old.student_id and publication.academic_year = old.academic_year
      and publication.academic_term = old.academic_term and publication.published_at is not null
  ) then
    raise exception 'This academic period has been published; contact an administrator before changing marks';
  end if;
  if tg_op <> 'DELETE' and new.kind = 'academic' and exists (
    select 1 from public.profiles p
    join public.report_publications publication on publication.campus_id = p.campus_id
    where p.id = new.student_id and publication.academic_year = new.academic_year
      and publication.academic_term = new.academic_term and publication.published_at is not null
  ) then
    raise exception 'This academic period has been published; contact an administrator before changing marks';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.guard_published_learner_record_period() from public, anon, authenticated;
create trigger learner_records_published_period_guard
  before insert or update or delete on public.learner_records
  for each row execute function public.guard_published_learner_record_period();

create or replace function public.snapshot_published_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    insert into public.report_release_snapshots(
      publication_id, campus_id, student_id, academic_year, academic_term,
      assessments, average_percent, released_at
    )
    select new.id, new.campus_id, r.student_id, new.academic_year, new.academic_term,
      jsonb_agg(jsonb_build_object(
        'title', r.title, 'subject', r.subject, 'assessment_type', r.assessment_type,
        'score', r.score, 'max_score', r.max_score, 'event_date', r.event_date
      ) order by r.event_date, r.title),
      round(avg(r.score / nullif(r.max_score, 0) * 100)
        filter (where r.assessment_type = 'markbook'), 2),
      new.published_at
    from public.learner_records r
    join public.profiles p on p.id = r.student_id
    where r.kind = 'academic' and r.academic_year = new.academic_year
      and r.academic_term = new.academic_term and p.campus_id = new.campus_id
    group by r.student_id
    on conflict (publication_id, student_id) do update
      set assessments = excluded.assessments,
          average_percent = excluded.average_percent,
          released_at = excluded.released_at;
  end if;
  return new;
end;
$$;

create or replace function public.enrich_report_release_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    with averages as (
      select r.student_id,
        avg(r.score / nullif(r.max_score, 0) * 100) filter (where r.assessment_type = 'markbook') as average_percent
      from public.learner_records r
      join public.profiles p on p.id = r.student_id
      where r.kind = 'academic' and r.academic_year = new.academic_year
        and r.academic_term = new.academic_term and p.campus_id = new.campus_id
      group by r.student_id
      having count(*) filter (where r.assessment_type = 'markbook') > 0
    ), ranked as (
      select a.student_id, rank() over(order by a.average_percent desc)::integer as class_rank,
        count(*) over()::integer as class_size
      from averages a
    )
    update public.report_release_snapshots s
    set class_rank = ranked.class_rank,
        class_size = ranked.class_size,
        overall_grade = (
          select b.grade from public.report_grade_bands b
          where b.campus_id = s.campus_id
            and s.average_percent between b.minimum_percent and b.maximum_percent
          order by b.minimum_percent desc limit 1
        )
    from ranked where s.publication_id = new.id and s.student_id = ranked.student_id;
  end if;
  return new;
end;
$$;

create or replace function public.report_class_ranking(
  p_student_id uuid,
  p_academic_year integer,
  p_academic_term text
)
returns table(class_rank bigint, class_size bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare learner public.profiles;
begin
  select * into learner from public.profiles where id = p_student_id and role = 'student';
  if not found then raise exception 'Learner not found'; end if;
  if not (
    public.my_role() = 'admin'
    or (auth.uid() = p_student_id and public.learner_can_access_own_portal(auth.uid()))
    or public.parent_can_view_learner(p_student_id)
    or (public.my_role() = 'teacher' and public.teacher_can_view_assigned_learner(learner.campus_id, learner.class_level, learner.class_stream))
  ) then raise exception 'Not allowed'; end if;
  return query
    with averages as (
      select r.student_id, avg(r.score / r.max_score * 100) as average_mark
      from public.learner_records r join public.profiles p on p.id = r.student_id
      where r.kind = 'academic' and r.assessment_type = 'markbook'
        and r.academic_year = p_academic_year and r.academic_term = p_academic_term
        and p.campus_id = learner.campus_id and p.class_level = learner.class_level
        and p.class_stream is not distinct from learner.class_stream
      group by r.student_id
    ), ranked as (
      select student_id, rank() over(order by average_mark desc) as rank_value,
        count(*) over() as size_value from averages
    )
    select rank_value, size_value from ranked where student_id = p_student_id;
end;
$$;

revoke all on function public.report_class_ranking(uuid, integer, text) from public;
grant execute on function public.report_class_ranking(uuid, integer, text) to authenticated;
