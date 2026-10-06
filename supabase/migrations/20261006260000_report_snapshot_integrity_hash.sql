alter table public.report_release_snapshots add column integrity_hash text;

create or replace function public.hash_report_release_snapshots() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    update public.report_release_snapshots snapshot
    set integrity_hash=md5(concat_ws('|',snapshot.publication_id::text,snapshot.student_id::text,snapshot.assessments::text,coalesce(snapshot.average_percent::text,''),coalesce(snapshot.overall_grade,''),coalesce(snapshot.class_rank::text,''),coalesce(snapshot.class_teacher_name,''),coalesce(snapshot.head_of_school_name,''),snapshot.released_at::text))
    where snapshot.publication_id=new.id;
  end if;
  return new;
end $$;
create trigger zzzzz_report_snapshot_integrity after insert or update on public.report_publications for each row execute function public.hash_report_release_snapshots();
create index if not exists report_release_snapshots_integrity_hash_idx on public.report_release_snapshots(integrity_hash);
