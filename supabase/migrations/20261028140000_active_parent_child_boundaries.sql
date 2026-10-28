-- Parent-linked reads follow the verified active Parent role, as well as the
-- existing parent-to-learner relationship.
create or replace function public.parent_can_view_learner(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.my_role() = 'parent'::public.app_role
    and exists (
      select 1 from public.student_guardians g
      join public.profiles learner on learner.id = g.student_id
      where g.student_id = p_student_id and learner.role = 'student'
        and g.parent_id = auth.uid()
    );
$$;

revoke all on function public.parent_can_view_learner(uuid) from public, anon;
grant execute on function public.parent_can_view_learner(uuid) to authenticated;

drop policy if exists "guardian links scoped read" on public.student_guardians;
create policy "guardian links scoped read" on public.student_guardians
for select to authenticated using (
  (public.my_role() = 'parent' and parent_id = auth.uid())
  or (student_id = auth.uid() and public.learner_can_access_own_portal(auth.uid()))
  or public.my_role() = 'admin'
);

drop policy if exists "fees scoped read" on public.fee_records;
create policy "fees scoped read" on public.fee_records
for select to authenticated using (
  public.my_role() = 'admin'
  or (public.my_role() = 'student' and student_id = auth.uid() and public.learner_can_access_own_portal(auth.uid()))
  or public.parent_can_view_learner(student_id)
);

drop policy if exists "fee transactions scoped read" on public.fee_transactions;
create policy "fee transactions scoped read" on public.fee_transactions
for select to authenticated using (
  public.my_role() = 'admin'
  or exists (
    select 1 from public.fee_records r
    where r.id = fee_record_id and (
      (r.student_id = auth.uid() and public.learner_can_access_own_portal(auth.uid()))
      or public.parent_can_view_learner(r.student_id)
    )
  )
);

drop policy if exists "learners and guardians read nonconfidential records" on public.learner_records;
create policy "learners and guardians read nonconfidential records"
on public.learner_records for select to authenticated using (
  kind <> 'wellbeing'
  and (
    (student_id = auth.uid() and public.learner_can_access_own_portal(auth.uid()))
    or public.parent_can_view_learner(student_id)
  )
);

drop policy if exists "guardians read linked learner profiles" on public.profiles;
create policy "guardians read linked learner profiles" on public.profiles
for select to authenticated using (public.parent_can_view_learner(id));

drop policy if exists "published targeted announcements read" on public.announcements;
create policy "published targeted announcements read" on public.announcements
for select to authenticated using (
  published_at <= now()
  and (
    (campus_id = public.my_campus_id()
      and (public.my_role() <> 'student' or public.learner_can_access_own_portal(auth.uid())))
    or (public.my_role() = 'parent' and exists (
      select 1 from public.student_guardians g join public.profiles p on p.id = g.student_id
      where g.parent_id = auth.uid() and p.campus_id = announcements.campus_id
    ))
  )
  and (
    cardinality(audience_roles) = 0
    or public.my_role()::text = any(audience_roles)
    or (public.my_role() = 'parent' and 'student' = any(audience_roles))
  )
);

drop policy if exists "timetable relevant audience" on public.timetable;
create policy "timetable relevant audience" on public.timetable
for select to authenticated using (
  (audience_role is null or audience_role = public.my_role()
    or (public.my_role() = 'parent' and audience_role = 'student'))
  and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.campus_id = timetable.campus_id
        and (public.my_role() <> 'student' or public.learner_can_access_own_portal(auth.uid()))
        and (p.role <> 'teacher' or timetable.class_level is null)
        and (timetable.class_level is null or timetable.class_level = p.class_level)
        and (timetable.class_stream is null or timetable.class_stream = p.class_stream)
    )
    or (public.my_role() = 'parent' and exists (
      select 1 from public.student_guardians g join public.profiles p on p.id = g.student_id
      where g.parent_id = auth.uid() and p.campus_id = timetable.campus_id
        and (timetable.class_level is null or timetable.class_level = p.class_level)
        and (timetable.class_stream is null or timetable.class_stream = p.class_stream)
    ))
    or (public.my_role() = 'teacher' and timetable.class_level is not null
      and public.teacher_can_view_assigned_learner(timetable.campus_id, timetable.class_level, timetable.class_stream))
    or public.my_role() = 'admin'
  )
);

drop policy if exists "school community read report publications" on public.report_publications;
create policy "school community read report publications" on public.report_publications
for select to authenticated using (
  public.my_role() = 'admin'
  or (campus_id = public.my_campus_id()
    and (public.my_role() <> 'student' or public.learner_can_access_own_portal(auth.uid())))
  or (public.my_role() = 'parent' and exists (
    select 1 from public.student_guardians g join public.profiles p on p.id = g.student_id
    where g.parent_id = auth.uid() and p.campus_id = report_publications.campus_id
  ))
);

drop policy if exists "authorised users read released report snapshots" on public.report_release_snapshots;
create policy "authorised users read released report snapshots"
on public.report_release_snapshots for select to authenticated using (
  public.my_role() = 'admin'
  or (student_id = auth.uid() and public.learner_can_access_own_portal(auth.uid()))
  or public.parent_can_view_learner(student_id)
  or exists (
    select 1 from public.profiles p where p.id = report_release_snapshots.student_id
      and public.teacher_can_view_assigned_learner(p.campus_id, p.class_level, p.class_stream)
  )
);

create or replace function public.report_class_ranking(
  p_student_id uuid,
  p_academic_year integer,
  p_academic_term text
)
returns table(class_rank bigint, class_size bigint)
language plpgsql stable security definer set search_path = public as $$
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
      where r.kind = 'academic' and r.academic_year = p_academic_year and r.academic_term = p_academic_term
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

create or replace function public.report_subject_signatories(p_student_id uuid)
returns table(subject text, teacher_initials text)
language plpgsql stable security definer set search_path = public as $$
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
    select a.subject,
      coalesce(nullif(array_to_string(array(
        select upper(left(part, 1)) from unnest(regexp_split_to_array(trim(p.full_name), '\s+')) part
      ), ''), ''), '—')
    from public.teacher_class_assignments a join public.profiles p on p.id = a.teacher_id
    where a.campus_id = learner.campus_id
      and a.class_level = learner.class_level
      and a.class_stream is not distinct from learner.class_stream
      and a.subject is not null and length(trim(a.subject)) > 0;
end;
$$;

revoke all on function public.report_class_ranking(uuid, integer, text) from public;
grant execute on function public.report_class_ranking(uuid, integer, text) to authenticated;
revoke all on function public.report_subject_signatories(uuid) from public;
grant execute on function public.report_subject_signatories(uuid) to authenticated;
