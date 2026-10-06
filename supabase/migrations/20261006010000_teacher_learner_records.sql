-- Reliance-style staff workflows, adapted to Fordridge's existing campus model.
-- Teachers may access only students at their own campus and only their own
-- attendance or academic records; wellbeing records remain administrator-only.
create policy "teachers read campus learner profiles"
on public.profiles
for select
to authenticated
using (
  public.my_role() = 'teacher'
  and role = 'student'
  and campus_id = public.my_campus_id()
);

create policy "teachers manage own campus academic records"
on public.learner_records
for all
to authenticated
using (
  public.my_role() = 'teacher'
  and created_by = auth.uid()
  and kind in ('attendance', 'academic')
)
with check (
  public.my_role() = 'teacher'
  and created_by = auth.uid()
  and kind in ('attendance', 'academic')
  and exists (
    select 1 from public.profiles learner
    where learner.id = student_id
      and learner.role = 'student'
      and learner.campus_id = public.my_campus_id()
  )
);
