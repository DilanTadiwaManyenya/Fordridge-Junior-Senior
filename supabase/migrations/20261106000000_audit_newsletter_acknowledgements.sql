begin;

create or replace function public.audit_newsletter_acknowledgement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notice_campus uuid;
begin
  select campus_id into notice_campus
  from public.announcements
  where id = new.announcement_id;

  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (
    notice_campus,
    new.user_id,
    'newsletter_acknowledgement',
    new.announcement_id,
    'acknowledged',
    jsonb_build_object('acknowledged_at', new.read_at)
  );

  return new;
end;
$$;

revoke all on function public.audit_newsletter_acknowledgement() from public, anon, authenticated;

drop trigger if exists announcement_acknowledgement_audit on public.announcement_reads;
create trigger announcement_acknowledgement_audit
  after insert on public.announcement_reads
  for each row execute function public.audit_newsletter_acknowledgement();

commit;
