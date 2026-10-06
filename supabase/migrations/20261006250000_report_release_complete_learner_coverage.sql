create or replace function public.validate_report_publication_complete_coverage() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    if exists(
      select 1 from public.profiles learner
      where learner.role='student' and learner.campus_id=new.campus_id
        and not exists(
          select 1 from public.learner_records record
          where record.student_id=learner.id and record.kind='academic'
            and record.academic_year=new.academic_year and record.academic_term=new.academic_term
        )
    ) then raise exception 'Every learner must have at least one academic mark before publishing reports'; end if;
  end if;
  return new;
end $$;
create trigger report_publication_complete_coverage before insert or update on public.report_publications for each row execute function public.validate_report_publication_complete_coverage();
