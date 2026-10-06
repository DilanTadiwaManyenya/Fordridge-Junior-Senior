drop policy "authenticated read report publications" on public.report_publications;
create policy "school community read report publications" on public.report_publications for select to authenticated using (
  public.my_role()='admin'
  or campus_id=public.my_campus_id()
  or exists(
    select 1 from public.student_guardians g join public.profiles p on p.id=g.student_id
    where g.parent_id=auth.uid() and p.campus_id=report_publications.campus_id
  )
);
