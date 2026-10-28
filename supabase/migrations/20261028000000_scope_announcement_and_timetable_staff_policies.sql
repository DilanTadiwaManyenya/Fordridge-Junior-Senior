-- Keep the audience and assignment-scoped SELECT policies effective for staff.
-- Teachers may manage only their own campus announcements and assigned lessons.

drop policy if exists "announcements staff manage" on public.announcements;

create policy "admins manage all announcements"
  on public.announcements for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

create policy "teachers read owned announcements"
  on public.announcements for select to authenticated
  using (
    public.my_role() = 'teacher'
    and campus_id = public.my_campus_id()
    and author_id = auth.uid()
  );

create policy "teachers create campus announcements"
  on public.announcements for insert to authenticated
  with check (
    public.my_role() = 'teacher'
    and campus_id = public.my_campus_id()
    and author_id = auth.uid()
  );

create policy "teachers update owned campus announcements"
  on public.announcements for update to authenticated
  using (
    public.my_role() = 'teacher'
    and campus_id = public.my_campus_id()
    and author_id = auth.uid()
  )
  with check (
    public.my_role() = 'teacher'
    and campus_id = public.my_campus_id()
    and author_id = auth.uid()
  );

-- Remove the campus-wide teacher write/read policy. The existing
-- "timetable relevant audience" SELECT policy already enforces assignment
-- scope for teachers; these policies preserve admin management and allow
-- teachers to maintain only their own assigned lessons.
drop policy if exists "timetable staff manage" on public.timetable;

create policy "admins manage all timetable"
  on public.timetable for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

create policy "teachers create assigned timetable lessons"
  on public.timetable for insert to authenticated
  with check (
    public.my_role() = 'teacher'
    and campus_id = public.my_campus_id()
    and teacher_id = auth.uid()
    and (
      public.teacher_has_class_assignment(campus_id, class_level, class_stream)
      or public.teacher_has_subject_assignment(campus_id, class_level, class_stream, subject)
    )
  );

create policy "teachers update assigned timetable lessons"
  on public.timetable for update to authenticated
  using (
    public.my_role() = 'teacher'
    and campus_id = public.my_campus_id()
    and teacher_id = auth.uid()
    and (
      public.teacher_has_class_assignment(campus_id, class_level, class_stream)
      or public.teacher_has_subject_assignment(campus_id, class_level, class_stream, subject)
    )
  )
  with check (
    public.my_role() = 'teacher'
    and campus_id = public.my_campus_id()
    and teacher_id = auth.uid()
    and (
      public.teacher_has_class_assignment(campus_id, class_level, class_stream)
      or public.teacher_has_subject_assignment(campus_id, class_level, class_stream, subject)
    )
  );
