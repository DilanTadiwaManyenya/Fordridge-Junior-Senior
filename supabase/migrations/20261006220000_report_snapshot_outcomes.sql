alter table public.report_release_snapshots add column overall_grade text;
alter table public.report_release_snapshots add column class_rank integer;
alter table public.report_release_snapshots add column class_size integer;

create or replace function public.enrich_report_release_snapshots() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    with averages as (
      select r.student_id, avg(r.score / nullif(r.max_score,0) * 100) as average_percent
      from public.learner_records r join public.profiles p on p.id=r.student_id
      where r.kind='academic' and r.academic_year=new.academic_year and r.academic_term=new.academic_term and p.campus_id=new.campus_id
      group by r.student_id
    ), ranked as (
      select a.student_id, rank() over(order by a.average_percent desc)::integer as class_rank, count(*) over()::integer as class_size
      from averages a
    )
    update public.report_release_snapshots s
    set class_rank=ranked.class_rank,
        class_size=ranked.class_size,
        overall_grade=(select b.grade from public.report_grade_bands b where b.campus_id=s.campus_id and s.average_percent between b.minimum_percent and b.maximum_percent order by b.minimum_percent desc limit 1)
    from ranked where s.publication_id=new.id and s.student_id=ranked.student_id;
  end if;
  return new;
end $$;
create trigger zz_report_snapshot_outcomes after insert or update on public.report_publications for each row execute function public.enrich_report_release_snapshots();
