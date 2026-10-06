alter table public.report_release_snapshots add column subject_signatories jsonb not null default '{}'::jsonb;

create or replace function public.snapshot_report_signatories() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    update public.report_release_snapshots s
    set subject_signatories=coalesce((
      select jsonb_object_agg(a.subject, coalesce(nullif(array_to_string(array(select upper(left(part,1)) from unnest(regexp_split_to_array(trim(t.full_name), '\\s+')) part),''),'—'))
      from public.teacher_class_assignments a
      join public.profiles t on t.id=a.teacher_id
      join public.profiles learner on learner.id=s.student_id
      where a.campus_id=learner.campus_id and a.class_level=learner.class_level and a.class_stream is not distinct from learner.class_stream and a.subject is not null and length(trim(a.subject))>0
    ), '{}'::jsonb)
    where s.publication_id=new.id;
  end if;
  return new;
end $$;
create trigger zzz_report_snapshot_signatories after insert or update on public.report_publications for each row execute function public.snapshot_report_signatories();
