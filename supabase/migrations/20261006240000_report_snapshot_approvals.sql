alter table public.report_release_snapshots add column class_teacher_name text;
alter table public.report_release_snapshots add column head_of_school_name text;

create or replace function public.snapshot_report_approvals() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    update public.report_release_snapshots snapshot
    set class_teacher_name=settings.class_teacher_name,
        head_of_school_name=settings.head_of_school_name
    from public.report_term_settings settings
    where snapshot.publication_id=new.id
      and settings.campus_id=new.campus_id
      and settings.academic_year=new.academic_year
      and settings.academic_term=new.academic_term;
  end if;
  return new;
end $$;
create trigger zzzz_report_snapshot_approvals after insert or update on public.report_publications for each row execute function public.snapshot_report_approvals();
