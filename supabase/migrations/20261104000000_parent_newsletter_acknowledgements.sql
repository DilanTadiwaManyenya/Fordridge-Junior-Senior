begin;

create or replace function public.set_announcement_read_time()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.read_at := now();
  return new;
end;
$$;

drop trigger if exists announcement_reads_server_time on public.announcement_reads;
create trigger announcement_reads_server_time
  before insert on public.announcement_reads
  for each row execute function public.set_announcement_read_time();

drop policy if exists "users manage own announcement reads" on public.announcement_reads;
create policy "users read own visible newsletter acknowledgements"
  on public.announcement_reads for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_reads.announcement_id
    )
  );

create policy "users acknowledge visible newsletters"
  on public.announcement_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_reads.announcement_id
    )
  );

notify pgrst, 'reload schema';
commit;
