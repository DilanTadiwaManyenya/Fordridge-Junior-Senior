drop policy "timetable relevant audience" on public.timetable;

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
      and exists (
        select 1 from public.teacher_class_assignments a
        where a.teacher_id = auth.uid()
          and a.campus_id = timetable.campus_id
          and (timetable.class_level is null or timetable.class_level = a.class_level)
          and (timetable.class_stream is null or timetable.class_stream is not distinct from a.class_stream)
      )
    )
    or public.my_role() = 'admin'
  )
);
