-- Stage 11: keep class register scope and subject teaching scope distinct.
-- Subject allocations reuse Fordridge's existing assignment rows so existing
-- campus/class records remain compatible while their UI becomes a separate workflow.

alter table public.learner_records
  add column subject text check (subject is null or length(trim(subject)) > 0);

alter table public.teacher_class_assignments
  add column assignment_kind text not null default 'class'
    check (assignment_kind in ('class','subject'));
alter table public.teacher_class_assignments
  add constraint teacher_class_assignments_subject_kind_check
  check (assignment_kind <> 'subject' or nullif(trim(subject), '') is not null);

create or replace function public.log_class_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
  values(new.campus_id,auth.uid(),'class_assignment',new.id,
    case when tg_op='UPDATE' then 'updated' else 'created' end,
    jsonb_build_object(
      'teacher_id',new.teacher_id,'assignment_kind',new.assignment_kind,
      'class_id',new.class_id,'class_stream_id',new.class_stream_id,
      'class_level',new.class_level,'class_stream',new.class_stream,'subject',new.subject,
      'previous',case when tg_op='UPDATE' then jsonb_build_object(
        'assignment_kind',old.assignment_kind,'class_id',old.class_id,'class_stream_id',old.class_stream_id,
        'class_level',old.class_level,'class_stream',old.class_stream,'subject',old.subject
      ) else null end
    )
  );
  return new;
end $$;

-- Preserve the Stage 10 helper but ensure a subject-only allocation does not
-- silently grant class-register attendance privileges.
create or replace function public.teacher_has_class_assignment(
  p_campus_id uuid,p_class_level text,p_class_stream text default null
) returns boolean language sql stable security definer set search_path=public as $$
  select public.my_role()='teacher' and p_class_level is not null and exists (
    select 1 from public.teacher_class_assignments a
    left join public.school_classes c on c.id=a.class_id
    left join public.school_class_streams s on s.id=a.class_stream_id
    where a.assignment_kind='class' and a.teacher_id=auth.uid() and a.campus_id=p_campus_id
      and (
        (a.class_id is not null and c.campus_id=a.campus_id and c.is_active
          and lower(trim(c.class_level))=lower(trim(p_class_level))
          and (a.class_stream_id is null or (s.class_id=c.id and s.is_active
            and lower(trim(s.stream_name))=lower(trim(coalesce(p_class_stream,'')))))
        )
        or (a.class_id is null and lower(trim(a.class_level))=lower(trim(p_class_level))
          and (a.class_stream is null or lower(trim(a.class_stream))=lower(trim(coalesce(p_class_stream,''))))
        )
      )
  );
$$;
revoke all on function public.teacher_has_class_assignment(uuid,text,text) from public;
grant execute on function public.teacher_has_class_assignment(uuid,text,text) to authenticated;

create or replace function public.teacher_has_subject_assignment(
  p_campus_id uuid,
  p_class_level text,
  p_class_stream text default null,
  p_subject text default null
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
        and (a.assignment_kind='subject' or (a.assignment_kind='class' and nullif(trim(a.subject), '') is not null))
        and nullif(trim(a.subject), '') is not null
        and (p_subject is null or lower(trim(a.subject)) = lower(trim(p_subject)))
        and (
          (
            a.class_id is not null
            and c.campus_id = a.campus_id
            and c.is_active
            and lower(trim(c.class_level)) = lower(trim(p_class_level))
            and (
              a.class_stream_id is null
              or (
                s.class_id = c.id and s.is_active
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
revoke all on function public.teacher_has_subject_assignment(uuid,text,text,text) from public;
grant execute on function public.teacher_has_subject_assignment(uuid,text,text,text) to authenticated;

create or replace function public.teacher_can_view_assigned_learner(
  p_campus_id uuid,
  p_class_level text,
  p_class_stream text default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.teacher_has_class_assignment(p_campus_id,p_class_level,p_class_stream)
    or public.teacher_has_subject_assignment(p_campus_id,p_class_level,p_class_stream,null);
$$;
revoke all on function public.teacher_can_view_assigned_learner(uuid,text,text) from public;
grant execute on function public.teacher_can_view_assigned_learner(uuid,text,text) to authenticated;

drop policy if exists "teachers read assigned learner profiles" on public.profiles;
create policy "teachers read assigned learner profiles"
  on public.profiles for select to authenticated
  using (
    public.my_role()='teacher'
    and role='student'
    and public.teacher_can_view_assigned_learner(campus_id,class_level,class_stream)
  );

drop policy if exists "teachers read assigned learner records" on public.learner_records;
drop policy if exists "teachers manage own assigned learner records" on public.learner_records;
create policy "teachers read assigned learner records"
  on public.learner_records for select to authenticated
  using (
    public.my_role()='teacher'
    and (
      (kind='attendance' and exists(
        select 1 from public.profiles learner where learner.id=student_id and learner.role='student'
          and public.teacher_has_class_assignment(learner.campus_id,learner.class_level,learner.class_stream)
      ))
      or (kind='academic' and exists(
        select 1 from public.profiles learner where learner.id=student_id and learner.role='student'
          and (
            public.teacher_has_class_assignment(learner.campus_id,learner.class_level,learner.class_stream)
            or (subject is not null and public.teacher_has_subject_assignment(learner.campus_id,learner.class_level,learner.class_stream,subject))
          )
      ))
    )
  );

create policy "teachers manage own assigned learner records"
  on public.learner_records for all to authenticated
  using (
    public.my_role()='teacher'
    and created_by=auth.uid()
    and (
      (kind='attendance' and exists(
        select 1 from public.profiles learner where learner.id=student_id and learner.role='student'
          and public.teacher_has_class_assignment(learner.campus_id,learner.class_level,learner.class_stream)
      ))
      or (kind='academic' and subject is not null and exists(
        select 1 from public.profiles learner where learner.id=student_id and learner.role='student'
          and public.teacher_has_subject_assignment(learner.campus_id,learner.class_level,learner.class_stream,subject)
      ))
    )
  )
  with check (
    public.my_role()='teacher'
    and created_by=auth.uid()
    and (
      (kind='attendance' and exists(
        select 1 from public.profiles learner where learner.id=student_id and learner.role='student'
          and public.teacher_has_class_assignment(learner.campus_id,learner.class_level,learner.class_stream)
      ))
      or (kind='academic' and subject is not null and exists(
        select 1 from public.profiles learner where learner.id=student_id and learner.role='student'
          and public.teacher_has_subject_assignment(learner.campus_id,learner.class_level,learner.class_stream,subject)
      ))
    )
  );

-- An unsubjected legacy call cannot bypass the new allocation check.
create or replace function public.record_bulk_marks(
  p_title text,p_event_date date,p_academic_year integer,p_academic_term text,p_max_score numeric,p_entries jsonb
) returns integer language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Choose an allocated subject before recording marks';
end $$;
revoke all on function public.record_bulk_marks(text,date,integer,text,numeric,jsonb) from public;
grant execute on function public.record_bulk_marks(text,date,integer,text,numeric,jsonb) to authenticated;

create or replace function public.record_bulk_marks(
  p_title text,p_subject text,p_event_date date,p_academic_year integer,p_academic_term text,p_max_score numeric,p_entries jsonb
) returns integer language plpgsql security definer set search_path=public as $$
declare entry jsonb; count_saved integer:=0; learner public.profiles; score_value numeric;
begin
  if public.my_role() not in ('admin','teacher') then raise exception 'Staff access required'; end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_subject),'') is null or p_max_score is null or p_max_score<=0 then
    raise exception 'Assessment title, subject and maximum score are required';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)=0 then
    raise exception 'At least one learner is required';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    select * into learner from public.profiles p where p.id=(entry->>'student_id')::uuid and p.role='student';
    if not found then raise exception 'Learner not found'; end if;
    if public.my_role()='teacher' and not public.teacher_has_subject_assignment(
      learner.campus_id,learner.class_level,learner.class_stream,p_subject
    ) then raise exception 'Subject is not allocated to you for this learner'; end if;
    score_value := (entry->>'score')::numeric;
    if score_value is null or score_value<0 or score_value>p_max_score then raise exception 'A mark is outside the allowed range'; end if;
    insert into public.learner_records(student_id,kind,event_date,title,subject,score,max_score,academic_year,academic_term,created_by)
      values(learner.id,'academic',p_event_date,trim(p_title),trim(p_subject),score_value,p_max_score,p_academic_year,p_academic_term,auth.uid());
    count_saved:=count_saved+1;
  end loop;
  return count_saved;
end $$;
revoke all on function public.record_bulk_marks(text,text,date,integer,text,numeric,jsonb) from public;
grant execute on function public.record_bulk_marks(text,text,date,integer,text,numeric,jsonb) to authenticated;

-- A subject allocation also grants read access to its class schedule and released
-- learner report. Attendance writes remain limited to Class assignments.
drop policy if exists "timetable relevant audience" on public.timetable;
create policy "timetable relevant audience" on public.timetable for select to authenticated using (
  (audience_role is null or audience_role=public.my_role() or (public.my_role()='parent' and audience_role='student'))
  and (
    exists (
      select 1 from public.profiles p where p.id=auth.uid() and p.campus_id=timetable.campus_id
        and (p.role<>'teacher' or timetable.class_level is null)
        and (timetable.class_level is null or timetable.class_level=p.class_level)
        and (timetable.class_stream is null or timetable.class_stream=p.class_stream)
    )
    or exists (
      select 1 from public.student_guardians g join public.profiles p on p.id=g.student_id
      where g.parent_id=auth.uid() and p.campus_id=timetable.campus_id
        and (timetable.class_level is null or timetable.class_level=p.class_level)
        and (timetable.class_stream is null or timetable.class_stream=p.class_stream)
    )
    or (public.my_role()='teacher' and timetable.class_level is not null
      and public.teacher_can_view_assigned_learner(timetable.campus_id,timetable.class_level,timetable.class_stream))
    or public.my_role()='admin'
  )
);

drop policy if exists "authorised users read released report snapshots" on public.report_release_snapshots;
create policy "authorised users read released report snapshots"
  on public.report_release_snapshots for select to authenticated using (
    public.my_role()='admin' or student_id=auth.uid()
    or exists(select 1 from public.student_guardians g where g.student_id=report_release_snapshots.student_id and g.parent_id=auth.uid())
    or exists(select 1 from public.profiles p where p.id=report_release_snapshots.student_id
      and public.teacher_can_view_assigned_learner(p.campus_id,p.class_level,p.class_stream))
  );

create or replace function public.report_class_ranking(p_student_id uuid,p_academic_year integer,p_academic_term text)
returns table(class_rank bigint,class_size bigint) language plpgsql stable security definer set search_path=public as $$
declare learner public.profiles;
begin
  select * into learner from public.profiles where id=p_student_id and role='student';
  if not found then raise exception 'Learner not found'; end if;
  if not (public.my_role()='admin' or auth.uid()=p_student_id
    or exists(select 1 from public.student_guardians g where g.student_id=p_student_id and g.parent_id=auth.uid())
    or public.teacher_can_view_assigned_learner(learner.campus_id,learner.class_level,learner.class_stream)) then
    raise exception 'Not allowed';
  end if;
  return query with averages as (
    select r.student_id,avg(r.score/r.max_score*100) as average_mark
    from public.learner_records r join public.profiles p on p.id=r.student_id
    where r.kind='academic' and r.academic_year=p_academic_year and r.academic_term=p_academic_term
      and p.campus_id=learner.campus_id and p.class_level=learner.class_level
      and p.class_stream is not distinct from learner.class_stream group by r.student_id
  ), ranked as (
    select student_id,rank() over(order by average_mark desc) as rank_value,count(*) over() as size_value from averages
  ) select rank_value,size_value from ranked where student_id=p_student_id;
end $$;

create or replace function public.report_subject_signatories(p_student_id uuid)
returns table(subject text,teacher_initials text)
language plpgsql stable security definer set search_path=public as $$
declare learner public.profiles;
begin
  select * into learner from public.profiles where id=p_student_id and role='student';
  if not found then raise exception 'Learner not found'; end if;
  if not (public.my_role()='admin' or auth.uid()=p_student_id
    or exists(select 1 from public.student_guardians g where g.student_id=p_student_id and g.parent_id=auth.uid())
    or public.teacher_can_view_assigned_learner(learner.campus_id,learner.class_level,learner.class_stream)) then
    raise exception 'Not allowed';
  end if;
  return query select a.subject,
    coalesce(nullif(array_to_string(array(select upper(left(part,1)) from unnest(regexp_split_to_array(trim(p.full_name),'\s+')) part),''),''),'—')
    from public.teacher_class_assignments a join public.profiles p on p.id=a.teacher_id
    where a.campus_id=learner.campus_id
      and lower(trim(a.class_level))=lower(trim(learner.class_level))
      and (a.class_stream is null or lower(trim(a.class_stream))=lower(trim(coalesce(learner.class_stream,''))))
      and nullif(trim(a.subject),'') is not null;
end $$;
revoke all on function public.report_subject_signatories(uuid) from public;
grant execute on function public.report_subject_signatories(uuid) to authenticated;

-- Carry the explicit subject into future immutable report snapshots.
create or replace function public.snapshot_published_reports() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    insert into public.report_release_snapshots(publication_id,campus_id,student_id,academic_year,academic_term,assessments,average_percent,released_at)
    select new.id,new.campus_id,r.student_id,new.academic_year,new.academic_term,
      jsonb_agg(jsonb_build_object('title',r.title,'subject',r.subject,'score',r.score,'max_score',r.max_score,'event_date',r.event_date) order by r.event_date,r.title),
      round(avg(r.score/nullif(r.max_score,0)*100),2),new.published_at
    from public.learner_records r join public.profiles p on p.id=r.student_id
    where r.kind='academic' and r.academic_year=new.academic_year and r.academic_term=new.academic_term and p.campus_id=new.campus_id
    group by r.student_id
    on conflict(publication_id,student_id) do update set assessments=excluded.assessments,average_percent=excluded.average_percent,released_at=excluded.released_at;
  end if;
  return new;
end $$;
