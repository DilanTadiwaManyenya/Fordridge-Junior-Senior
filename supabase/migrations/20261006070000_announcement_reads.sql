create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcement_reads enable row level security;
create policy "users manage own announcement reads" on public.announcement_reads for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
