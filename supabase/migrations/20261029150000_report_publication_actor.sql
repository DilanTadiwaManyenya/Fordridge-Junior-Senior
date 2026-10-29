create or replace function public.enforce_report_publication_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is not null
    and (new.campus_id is distinct from old.campus_id
      or new.academic_year is distinct from old.academic_year
      or new.academic_term is distinct from old.academic_term) then
    raise exception 'The period cannot be changed on a published report; return it to draft first';
  end if;

  if tg_op = 'UPDATE' and old.published_at is distinct from new.published_at
    and auth.uid() is null then
    raise exception 'A signed-in administrator must change report release state';
  end if;

  if new.published_at is null then
    new.published_by := null;
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'A signed-in administrator must publish reports';
  end if;

  if tg_op = 'INSERT' or old.published_at is null
    or old.published_at is distinct from new.published_at then
    new.published_by := auth.uid();
  elsif new.published_by is distinct from old.published_by then
    raise exception 'The publisher cannot be changed while a report is published';
  end if;

  return new;
end;
$$;

create trigger report_publication_actor_attribution
  before insert or update on public.report_publications
  for each row execute function public.enforce_report_publication_actor();

create or replace function public.announce_report_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is not null and new.published_at is null then
    update public.announcements
    set published_at = null
    where campus_id = old.campus_id
      and title = format('Academic reports published · %s · %s', old.academic_year, old.academic_term)
      and published_at = old.published_at
      and author_id = old.published_by;
  elsif new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
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
end;
$$;
