alter table public.announcements add column if not exists audience_roles text[] not null default '{}';

drop policy "published announcements campus read" on public.announcements;
create policy "published targeted announcements read" on public.announcements for select to authenticated using (
  published_at <= now()
  and (
    campus_id = public.my_campus_id()
    or exists (
      select 1 from public.student_guardians g join public.profiles p on p.id = g.student_id
      where g.parent_id = auth.uid() and p.campus_id = announcements.campus_id
    )
  )
  and (
    cardinality(audience_roles) = 0
    or public.my_role()::text = any(audience_roles)
    or (public.my_role() = 'parent' and 'student' = any(audience_roles))
  )
);
