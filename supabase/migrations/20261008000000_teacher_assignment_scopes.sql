-- Stage 10: resolve teacher access through one campus/class/stream rule.
-- Legacy text assignments remain readable and retain their exact-label scope
-- until school-approved catalogue rows exist and an administrator can link them.

alter table public.teacher_class_assignments
  add column class_id uuid references public.school_classes(id) on delete restrict,
  add column class_stream_id uuid references public.school_class_streams(id) on delete restrict;

create index teacher_class_assignments_scope_idx
  on public.teacher_class_assignments(teacher_id, campus_id, class_id, class_stream_id);

-- Backfill only exact, unambiguous catalogue matches. Fordridge's catalogue is
-- intentionally empty until the school confirms its class and stream names.
with exact_matches as (
  select a.id as assignment_id, c.id as class_id, s.id as class_stream_id
  from public.teacher_class_assignments a
  join public.school_classes c
    on c.campus_id = a.campus_id
   and lower(trim(c.class_level)) = lower(trim(a.class_level))
   and c.is_active
  left join public.school_class_streams s
    on s.class_id = c.id
   and lower(trim(s.stream_name)) = lower(trim(coalesce(a.class_stream, '')))
   and s.is_active
  where a.class_id is null
    and (a.class_stream is null or s.id is not null)
)
update public.teacher_class_assignments a
set class_id = m.class_id, class_stream_id = m.class_stream_id
from exact_matches m where a.id = m.assignment_id;

create or replace function public.teacher_has_class_assignment(
  p_campus_id uuid,
  p_class_level text,
  p_class_stream text default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'teacher'
    and p_class_level is not null
    and exists (
      select 1
      from public.teacher_class_assignments a
      left join public.school_classes c on c.id = a.class_id
      left join public.school_class_streams s on s.id = a.class_stream_id
      where a.teacher_id = auth.uid()
        and a.campus_id = p_campus_id
        and (
          (
            a.class_id is not null
            and c.campus_id = a.campus_id
            and c.is_active
            and lower(trim(c.class_level)) = lower(trim(p_class_level))
            and (
              a.class_stream_id is null
              or (
                s.class_id = c.id
                and s.is_active
                and lower(trim(s.stream_name)) = lower(trim(coalesce(p_class_stream, '')))
              )
            )
          )
          or (
            a.class_id is null
            and lower(trim(a.class_level)) = lower(trim(p_class_level))
            and (
              a.class_stream is null
              or lower(trim(a.class_stream)) = lower(trim(coalesce(p_class_stream, '')))
            )
          )
        )
    );
$$;

revoke all on function public.teacher_has_class_assignment(uuid, text, text) from public;
grant execute on function public.teacher_has_class_assignment(uuid, text, text) to authenticated;

-- A class-wide assignment covers every stream in that class. Stream-specific
-- assignments cover only learners in the matching named stream.
drop policy if exists "teachers read campus learner profiles" on public.profiles;
create policy "teachers read assigned learner profiles"
  on public.profiles for select to authenticated
  using (
    public.my_role() = 'teacher'
    and role = 'student'
    and public.teacher_has_class_assignment(campus_id, class_level, class_stream)
  );

drop policy if exists "teachers manage own campus academic records" on public.learner_records;
create policy "teachers read assigned learner records"
  on public.learner_records for select to authenticated
  using (
    kind in ('attendance', 'academic')
    and exists (
      select 1 from public.profiles learner
      where learner.id = student_id
        and learner.role = 'student'
        and public.teacher_has_class_assignment(learner.campus_id, learner.class_level, learner.class_stream)
    )
  );

create policy "teachers manage own assigned learner records"
  on public.learner_records for all to authenticated
  using (
    public.my_role() = 'teacher'
    and created_by = auth.uid()
    and kind in ('attendance', 'academic')
    and exists (
      select 1 from public.profiles learner
      where learner.id = student_id
        and learner.role = 'student'
        and public.teacher_has_class_assignment(learner.campus_id, learner.class_level, learner.class_stream)
    )
  )
  with check (
    public.my_role() = 'teacher'
    and created_by = auth.uid()
    and kind in ('attendance', 'academic')
    and exists (
      select 1 from public.profiles learner
      where learner.id = student_id
        and learner.role = 'student'
        and public.teacher_has_class_assignment(learner.campus_id, learner.class_level, learner.class_stream)
    )
  );

-- Canonical assignments are required for new rows. Legacy rows are retained as
-- read-only transition data and can be linked after the school fills the catalogue.
create or replace function public.validate_teacher_class_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare class_row public.school_classes; stream_row public.school_class_streams;
begin
  if tg_op = 'UPDATE' and old.class_id is null and new.class_id is null then
    raise exception 'Legacy assignments must be linked to a confirmed class before editing';
  end if;
  if new.class_id is null then
    raise exception 'Choose a confirmed class from the Fordridge class catalogue';
  end if;

  select * into class_row from public.school_classes where id = new.class_id for key share;
  if not found or not class_row.is_active then raise exception 'Choose an active class'; end if;
  if class_row.campus_id <> new.campus_id then raise exception 'The class does not belong to the selected campus'; end if;
  new.class_level := class_row.class_level;

  if new.class_stream_id is not null then
    select * into stream_row from public.school_class_streams
      where id = new.class_stream_id and class_id = class_row.id for key share;
    if not found or not stream_row.is_active then raise exception 'Choose an active stream in the selected class'; end if;
    new.class_stream := stream_row.stream_name;
  else
    new.class_stream := null;
  end if;

  if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.role = 'teacher') then
    raise exception 'Choose an active teacher account';
  end if;

  -- A subject cannot be assigned to overlapping teachers/scopes. A whole-class
  -- scope overlaps every stream; two different streams do not overlap.
  if nullif(trim(new.subject), '') is not null and exists (
    select 1 from public.teacher_class_assignments a
    where a.id is distinct from new.id
      and a.campus_id = new.campus_id
      and lower(trim(a.subject)) = lower(trim(new.subject))
      and (
        a.class_id = new.class_id
        or (a.class_id is null and lower(trim(a.class_level)) = lower(trim(new.class_level)))
      )
      and (
        (
          a.class_id is not null
          and (a.class_stream_id is null or new.class_stream_id is null or a.class_stream_id = new.class_stream_id)
        )
        or (
          a.class_id is null
          and (a.class_stream is null or new.class_stream_id is null
            or lower(trim(a.class_stream)) = lower(trim(new.class_stream)))
        )
      )
  ) then
    raise exception 'This subject already has an overlapping teacher assignment for the class';
  end if;

  return new;
end $$;

revoke all on function public.validate_teacher_class_assignment() from public;
create trigger teacher_class_assignment_scope_check
  before insert or update on public.teacher_class_assignments
  for each row execute function public.validate_teacher_class_assignment();

create or replace function public.log_class_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
  values(
    new.campus_id,
    auth.uid(),
    'class_assignment',
    new.id,
    case when tg_op='UPDATE' then 'updated' else 'created' end,
    jsonb_build_object(
      'teacher_id',new.teacher_id,
      'class_id',new.class_id,
      'class_stream_id',new.class_stream_id,
      'class_level',new.class_level,
      'class_stream',new.class_stream,
      'subject',new.subject,
      'previous',case when tg_op='UPDATE' then jsonb_build_object(
        'class_id',old.class_id,'class_stream_id',old.class_stream_id,
        'class_level',old.class_level,'class_stream',old.class_stream,'subject',old.subject
      ) else null end
    )
  );
  return new;
end $$;

create trigger class_assignment_audit_update
  after update on public.teacher_class_assignments
  for each row execute function public.log_class_assignment();

create or replace function public.record_bulk_attendance(p_event_date date, p_entries jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare entry jsonb; count_saved integer := 0; learner public.profiles;
begin
  if public.my_role() not in ('admin','teacher') then raise exception 'Staff access required'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'At least one learner is required';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    select * into learner from public.profiles p
      where p.id = (entry->>'student_id')::uuid and p.role = 'student';
    if not found or not (
      public.my_role() = 'admin'
      or public.teacher_has_class_assignment(learner.campus_id, learner.class_level, learner.class_stream)
    ) then
      raise exception 'Learner is outside an assigned class';
    end if;
    if entry->>'attendance_status' not in ('present','late','absent','excused') then
      raise exception 'Attendance status is invalid';
    end if;
    insert into public.learner_records(student_id,kind,event_date,title,attendance_status,created_by)
      values(learner.id,'attendance',p_event_date,'Daily attendance',entry->>'attendance_status',auth.uid())
      on conflict (student_id,event_date) where kind='attendance'
      do update set attendance_status=excluded.attendance_status,created_by=auth.uid(),created_at=now();
    count_saved := count_saved + 1;
  end loop;
  return count_saved;
end $$;
revoke all on function public.record_bulk_attendance(date,jsonb) from public;
grant execute on function public.record_bulk_attendance(date,jsonb) to authenticated;

create or replace function public.record_bulk_marks(p_title text,p_event_date date,p_academic_year integer,p_academic_term text,p_max_score numeric,p_entries jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare entry jsonb; count_saved integer:=0; learner public.profiles; score_value numeric;
begin
  if public.my_role() not in ('admin','teacher') then raise exception 'Staff access required'; end if;
  if p_title is null or length(trim(p_title))=0 or p_max_score is null or p_max_score<=0 then raise exception 'Assessment details are invalid'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)=0 then raise exception 'At least one learner is required'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    select * into learner from public.profiles p where p.id=(entry->>'student_id')::uuid and p.role='student';
    score_value := (entry->>'score')::numeric;
    if not found or not (public.my_role()='admin' or public.teacher_has_class_assignment(learner.campus_id,learner.class_level,learner.class_stream)) then
      raise exception 'Learner is outside an assigned class';
    end if;
    if score_value is null or score_value < 0 or score_value > p_max_score then raise exception 'A mark is outside the allowed range'; end if;
    insert into public.learner_records(student_id,kind,event_date,title,score,max_score,academic_year,academic_term,created_by)
      values(learner.id,'academic',p_event_date,trim(p_title),score_value,p_max_score,p_academic_year,p_academic_term,auth.uid());
    count_saved:=count_saved+1;
  end loop;
  return count_saved;
end $$;
revoke all on function public.record_bulk_marks(text,date,integer,text,numeric,jsonb) from public;
grant execute on function public.record_bulk_marks(text,date,integer,text,numeric,jsonb) to authenticated;

-- Existing report helpers use the same assignment scope as the screens/RPCs.
create or replace function public.report_class_ranking(p_student_id uuid,p_academic_year integer,p_academic_term text)
returns table(class_rank bigint,class_size bigint) language plpgsql stable security definer set search_path=public as $$
declare learner public.profiles;
begin
  select * into learner from public.profiles where id=p_student_id and role='student';
  if not found then raise exception 'Learner not found'; end if;
  if not (
    public.my_role()='admin'
    or auth.uid()=p_student_id
    or exists(select 1 from public.student_guardians g where g.student_id=p_student_id and g.parent_id=auth.uid())
    or public.teacher_has_class_assignment(learner.campus_id,learner.class_level,learner.class_stream)
  ) then raise exception 'Not allowed'; end if;
  return query
    with averages as (
      select r.student_id, avg(r.score/r.max_score*100) as average_mark
      from public.learner_records r join public.profiles p on p.id=r.student_id
      where r.kind='academic' and r.academic_year=p_academic_year and r.academic_term=p_academic_term
        and p.campus_id=learner.campus_id and p.class_level=learner.class_level
        and p.class_stream is not distinct from learner.class_stream
      group by r.student_id
    ), ranked as (
      select student_id, rank() over(order by average_mark desc) as rank_value,
        count(*) over() as size_value from averages
    ) select rank_value,size_value from ranked where student_id=p_student_id;
end $$;

create or replace function public.report_subject_signatories(p_student_id uuid)
returns table(subject text, teacher_initials text)
language plpgsql security definer set search_path=public as $$
declare learner public.profiles;
begin
  select * into learner from public.profiles where id=p_student_id and role='student';
  if not found then raise exception 'Learner not found'; end if;
  if not (
    public.my_role()='admin'
    or auth.uid()=p_student_id
    or exists(select 1 from public.student_guardians g where g.student_id=p_student_id and g.parent_id=auth.uid())
    or public.teacher_has_class_assignment(learner.campus_id,learner.class_level,learner.class_stream)
  ) then raise exception 'Not allowed'; end if;
  return query
    select a.subject,
      coalesce(nullif(array_to_string(array(select upper(left(part,1)) from unnest(regexp_split_to_array(trim(p.full_name), '\s+')) part), ''), ''), '—')
    from public.teacher_class_assignments a
    join public.profiles p on p.id=a.teacher_id
    where a.campus_id=learner.campus_id
      and lower(trim(a.class_level))=lower(trim(learner.class_level))
      and (a.class_stream is null or lower(trim(a.class_stream))=lower(trim(coalesce(learner.class_stream,''))))
      and a.subject is not null and length(trim(a.subject))>0;
end $$;
revoke all on function public.report_subject_signatories(uuid) from public;
grant execute on function public.report_subject_signatories(uuid) to authenticated;

create or replace function public.snapshot_report_signatories() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    update public.report_release_snapshots s
    set subject_signatories=coalesce((
      select jsonb_object_agg(a.subject, coalesce(nullif(array_to_string(array(select upper(left(part,1)) from unnest(regexp_split_to_array(trim(t.full_name), '\s+')) part), ''), ''), '—'))
      from public.teacher_class_assignments a
      join public.profiles t on t.id=a.teacher_id
      join public.profiles learner on learner.id=s.student_id
      where a.campus_id=learner.campus_id
        and lower(trim(a.class_level))=lower(trim(learner.class_level))
        and (a.class_stream is null or lower(trim(a.class_stream))=lower(trim(coalesce(learner.class_stream,''))))
        and a.subject is not null and length(trim(a.subject))>0
    ), '{}'::jsonb)
    where s.publication_id=new.id;
  end if;
  return new;
end $$;

drop policy if exists "authorised users read released report snapshots" on public.report_release_snapshots;
create policy "authorised users read released report snapshots"
  on public.report_release_snapshots for select to authenticated using (
    public.my_role()='admin'
    or student_id=auth.uid()
    or exists(select 1 from public.student_guardians g where g.student_id=report_release_snapshots.student_id and g.parent_id=auth.uid())
    or exists(
      select 1 from public.profiles p where p.id=report_release_snapshots.student_id
        and public.teacher_has_class_assignment(p.campus_id,p.class_level,p.class_stream)
    )
  );

drop policy if exists "timetable relevant audience" on public.timetable;
create policy "timetable relevant audience" on public.timetable for select to authenticated using (
  (
    audience_role is null
    or audience_role = public.my_role()
    or (public.my_role() = 'parent' and audience_role = 'student')
  )
  and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.campus_id = timetable.campus_id
        and (p.role <> 'teacher' or timetable.class_level is null)
        and (timetable.class_level is null or timetable.class_level = p.class_level)
        and (timetable.class_stream is null or timetable.class_stream = p.class_stream)
    )
    or exists (
      select 1 from public.student_guardians g join public.profiles p on p.id = g.student_id
      where g.parent_id = auth.uid()
        and p.campus_id = timetable.campus_id
        and (timetable.class_level is null or timetable.class_level = p.class_level)
        and (timetable.class_stream is null or timetable.class_stream = p.class_stream)
    )
    or (
      public.my_role() = 'teacher'
      and timetable.class_level is not null
      and public.teacher_has_class_assignment(timetable.campus_id,timetable.class_level,timetable.class_stream)
    )
    or public.my_role() = 'admin'
  )
);
