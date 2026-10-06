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
    or (public.my_role()='teacher' and exists(select 1 from public.teacher_class_assignments a where a.teacher_id=auth.uid() and a.campus_id=learner.campus_id and a.class_level=learner.class_level and a.class_stream is not distinct from learner.class_stream))
  ) then raise exception 'Not allowed'; end if;
  return query
    select a.subject,
      coalesce(nullif(array_to_string(array(select upper(left(part, 1)) from unnest(regexp_split_to_array(trim(p.full_name), '\\s+')) part), ''), '—')
    from public.teacher_class_assignments a
    join public.profiles p on p.id=a.teacher_id
    where a.campus_id=learner.campus_id
      and a.class_level=learner.class_level
      and a.class_stream is not distinct from learner.class_stream
      and a.subject is not null
      and length(trim(a.subject)) > 0;
end $$;
revoke all on function public.report_subject_signatories(uuid) from public;
grant execute on function public.report_subject_signatories(uuid) to authenticated;
