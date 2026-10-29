revoke all on table public.report_release_snapshots from public, anon, authenticated;
grant select on table public.report_release_snapshots to authenticated;

create or replace function public.prevent_report_snapshot_reissue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is null and new.published_at is not null
    and exists (
      select 1 from public.report_release_snapshots snapshot
      where snapshot.publication_id = old.id
    ) then
    raise exception 'This period already has issued report snapshots; a new release cannot replace them';
  end if;
  return new;
end;
$$;

create trigger report_publication_snapshot_freeze
  before update on public.report_publications
  for each row execute function public.prevent_report_snapshot_reissue();

create or replace function public.prevent_published_snapshot_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.report_release_snapshots snapshot
    where snapshot.publication_id = old.id
  ) then
    raise exception 'A report publication with issued learner snapshots cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger report_publication_snapshot_delete_guard
  before delete on public.report_publications
  for each row execute function public.prevent_published_snapshot_delete();
