begin;

alter table public.announcements
  add column if not exists expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.announcements'::regclass
      and conname = 'announcements_expiry_after_publication'
  ) then
    alter table public.announcements
      add constraint announcements_expiry_after_publication
      check (expires_at is null or published_at is null or expires_at > published_at);
  end if;
end;
$$;

create index if not exists announcements_campus_publication_expiry_idx
  on public.announcements(campus_id, published_at, expires_at);

drop policy if exists "published targeted announcements read" on public.announcements;
create policy "published targeted announcements read" on public.announcements
  for select to authenticated using (
    published_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      (campus_id = public.my_campus_id()
        and (public.my_role() <> 'student' or public.learner_can_access_own_portal(auth.uid())))
      or (public.my_role() = 'parent' and exists (
        select 1 from public.student_guardians g
        join public.profiles p on p.id = g.student_id
        where g.parent_id = auth.uid() and p.campus_id = announcements.campus_id
      ))
    )
    and (
      cardinality(audience_roles) = 0
      or public.my_role()::text = any(audience_roles)
      or (public.my_role() = 'parent' and 'student' = any(audience_roles))
    )
  );

notify pgrst, 'reload schema';
commit;
