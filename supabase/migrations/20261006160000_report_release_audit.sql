create or replace function public.log_report_publication() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
    values(new.campus_id,coalesce(new.published_by,auth.uid()),'report_publication',new.id,case when new.published_at is null then 'drafted' else 'published' end,jsonb_build_object('academic_year',new.academic_year,'academic_term',new.academic_term));
  elsif old.published_at is distinct from new.published_at then
    insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
    values(new.campus_id,coalesce(new.published_by,auth.uid()),'report_publication',new.id,case when new.published_at is null then 'returned_to_draft' else 'published' end,jsonb_build_object('academic_year',new.academic_year,'academic_term',new.academic_term));
  end if;
  return new;
end $$;
create trigger report_publication_audit after insert or update on public.report_publications for each row execute function public.log_report_publication();
