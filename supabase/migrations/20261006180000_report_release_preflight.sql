create or replace function public.validate_report_publication() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    if not exists(
      select 1 from public.learner_records r join public.profiles p on p.id=r.student_id
      where r.kind='academic' and r.academic_year=new.academic_year and r.academic_term=new.academic_term and p.campus_id=new.campus_id
    ) then raise exception 'Enter academic marks before publishing reports'; end if;
    if not exists(select 1 from public.report_grade_bands b where b.campus_id=new.campus_id) then raise exception 'Configure grade bands before publishing reports'; end if;
    if not exists(
      select 1 from public.report_term_settings s
      where s.campus_id=new.campus_id and s.academic_year=new.academic_year and s.academic_term=new.academic_term
        and nullif(trim(s.class_teacher_name),'') is not null and nullif(trim(s.head_of_school_name),'') is not null
    ) then raise exception 'Set class teacher and head of school approval names before publishing reports'; end if;
  end if;
  return new;
end $$;
create trigger report_publication_preflight before insert or update on public.report_publications for each row execute function public.validate_report_publication();
