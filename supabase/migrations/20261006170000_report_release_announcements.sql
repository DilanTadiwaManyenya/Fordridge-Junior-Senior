create or replace function public.announce_report_publication() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    insert into public.announcements(campus_id,title,body,published_at,author_id,audience_roles)
    values(
      new.campus_id,
      format('Academic reports published · %s · %s', new.academic_year, new.academic_term),
      'Academic progress reports for this term are now available in the Fordridge portal.',
      new.published_at,
      new.published_by,
      array['student','parent']
    );
  end if;
  return new;
end $$;
create trigger report_publication_announcement after insert or update on public.report_publications for each row execute function public.announce_report_publication();
