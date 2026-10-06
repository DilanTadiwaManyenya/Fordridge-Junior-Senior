create table public.report_release_snapshots (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.report_publications(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  academic_year integer not null,
  academic_term text not null,
  assessments jsonb not null default '[]'::jsonb,
  average_percent numeric(5,2),
  released_at timestamptz not null default now(),
  unique (publication_id, student_id)
);
alter table public.report_release_snapshots enable row level security;
create policy "authorised users read released report snapshots" on public.report_release_snapshots for select to authenticated using (
  public.my_role()='admin'
  or student_id=auth.uid()
  or exists(select 1 from public.student_guardians g where g.student_id=report_release_snapshots.student_id and g.parent_id=auth.uid())
  or (public.my_role()='teacher' and exists(select 1 from public.teacher_class_assignments a join public.profiles p on p.id=report_release_snapshots.student_id where a.teacher_id=auth.uid() and a.campus_id=p.campus_id and a.class_level=p.class_level and a.class_stream is not distinct from p.class_stream))
);
create or replace function public.snapshot_published_reports() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
    insert into public.report_release_snapshots(publication_id,campus_id,student_id,academic_year,academic_term,assessments,average_percent,released_at)
    select new.id,new.campus_id,r.student_id,new.academic_year,new.academic_term,
      jsonb_agg(jsonb_build_object('title',r.title,'score',r.score,'max_score',r.max_score,'event_date',r.event_date) order by r.event_date,r.title),
      round(avg(r.score / nullif(r.max_score,0) * 100),2),new.published_at
    from public.learner_records r join public.profiles p on p.id=r.student_id
    where r.kind='academic' and r.academic_year=new.academic_year and r.academic_term=new.academic_term and p.campus_id=new.campus_id
    group by r.student_id
    on conflict (publication_id,student_id) do update set assessments=excluded.assessments,average_percent=excluded.average_percent,released_at=excluded.released_at;
  end if;
  return new;
end $$;
create trigger report_publication_snapshot after insert or update on public.report_publications for each row execute function public.snapshot_published_reports();
create index if not exists report_release_snapshots_student_idx on public.report_release_snapshots(student_id,academic_year,academic_term);
