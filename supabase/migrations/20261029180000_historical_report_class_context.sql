alter table public.report_release_snapshots
  add column captured_learner_name text,
  add column captured_admission_number text,
  add column captured_class_level text,
  add column captured_class_stream text,
  add column captured_campus_name text,
  add column identity_context_recorded boolean not null default false,
  add column integrity_version integer not null default 1 check (integrity_version in (1, 2));

create or replace function public.report_snapshot_integrity_fingerprint(
  p_snapshot public.report_release_snapshots
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when (p_snapshot).integrity_version >= 2 then md5(concat_ws('|',
      (p_snapshot).publication_id::text,
      (p_snapshot).student_id::text,
      (p_snapshot).assessments::text,
      coalesce((p_snapshot).average_percent::text, ''),
      coalesce((p_snapshot).overall_grade, ''),
      coalesce((p_snapshot).class_rank::text, ''),
      coalesce((p_snapshot).class_teacher_name, ''),
      coalesce((p_snapshot).head_of_school_name, ''),
      (p_snapshot).released_at::text,
      'identity-v2',
      (p_snapshot).campus_id::text,
      (p_snapshot).academic_year::text,
      (p_snapshot).academic_term,
      coalesce((p_snapshot).captured_learner_name, ''),
      coalesce((p_snapshot).captured_admission_number, ''),
      coalesce((p_snapshot).captured_class_level, ''),
      coalesce((p_snapshot).captured_class_stream, ''),
      coalesce((p_snapshot).captured_campus_name, ''),
      (p_snapshot).identity_context_recorded::text
    ))
    else md5(concat_ws('|',
      (p_snapshot).publication_id::text,
      (p_snapshot).student_id::text,
      (p_snapshot).assessments::text,
      coalesce((p_snapshot).average_percent::text, ''),
      coalesce((p_snapshot).overall_grade, ''),
      coalesce((p_snapshot).class_rank::text, ''),
      coalesce((p_snapshot).class_teacher_name, ''),
      coalesce((p_snapshot).head_of_school_name, ''),
      (p_snapshot).released_at::text
    ))
  end;
$$;

revoke all on function public.report_snapshot_integrity_fingerprint(public.report_release_snapshots) from public, anon, authenticated;

create or replace function public.hash_report_release_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    update public.report_release_snapshots snapshot
    set integrity_hash = public.report_snapshot_integrity_fingerprint(snapshot)
    where snapshot.publication_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_published_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    insert into public.report_release_snapshots(
      publication_id, campus_id, student_id, academic_year, academic_term,
      assessments, average_percent, released_at,
      captured_learner_name, captured_admission_number, captured_class_level,
      captured_class_stream, captured_campus_name, identity_context_recorded,
      integrity_version
    )
    select
      new.id, new.campus_id, r.student_id, new.academic_year, new.academic_term,
      jsonb_agg(jsonb_build_object(
        'title', r.title, 'subject', r.subject, 'assessment_type', r.assessment_type,
        'score', r.score, 'max_score', r.max_score, 'event_date', r.event_date
      ) order by r.event_date, r.title),
      round(avg(r.score / nullif(r.max_score, 0) * 100)
        filter (where r.assessment_type = 'markbook'), 2),
      new.published_at,
      p.full_name, p.admission_number, p.class_level, p.class_stream,
      campus.name, true, 2
    from public.learner_records r
    join public.profiles p on p.id = r.student_id
    join public.campuses campus on campus.id = p.campus_id
    where r.kind = 'academic' and r.academic_year = new.academic_year
      and r.academic_term = new.academic_term and p.campus_id = new.campus_id
    group by r.student_id, p.full_name, p.admission_number, p.class_level,
      p.class_stream, campus.name
    on conflict (publication_id, student_id) do update
      set assessments = excluded.assessments,
          average_percent = excluded.average_percent,
          released_at = excluded.released_at,
          captured_learner_name = excluded.captured_learner_name,
          captured_admission_number = excluded.captured_admission_number,
          captured_class_level = excluded.captured_class_level,
          captured_class_stream = excluded.captured_class_stream,
          captured_campus_name = excluded.captured_campus_name,
          identity_context_recorded = excluded.identity_context_recorded,
          integrity_version = excluded.integrity_version;
  end if;
  return new;
end;
$$;

create or replace function public.verify_report_snapshot_integrity(p_integrity_hash text)
returns table (
  integrity_valid boolean,
  academic_year integer,
  academic_term text,
  campus_name text,
  released_at timestamptz,
  calculated_hash text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_row public.report_release_snapshots;
  current_hash text;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Administrator access required';
  end if;
  if p_integrity_hash is null or p_integrity_hash !~* '^[a-f0-9]{32}$' then
    raise exception 'Enter a valid 32-character report fingerprint';
  end if;

  select snapshot.*
  into snapshot_row
  from public.report_release_snapshots snapshot
  where snapshot.integrity_hash = lower(trim(p_integrity_hash))
    or public.report_snapshot_integrity_fingerprint(snapshot) = lower(trim(p_integrity_hash))
  limit 1;
  if not found then return; end if;

  current_hash := public.report_snapshot_integrity_fingerprint(snapshot_row);
  integrity_valid := current_hash = snapshot_row.integrity_hash;
  academic_year := snapshot_row.academic_year;
  academic_term := snapshot_row.academic_term;
  campus_name := case when snapshot_row.identity_context_recorded
    then snapshot_row.captured_campus_name else null end;
  released_at := snapshot_row.released_at;
  calculated_hash := current_hash;

  if not integrity_valid then
    insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
    values (
      snapshot_row.campus_id,
      auth.uid(),
      'report_snapshot',
      snapshot_row.id,
      'integrity_mismatch',
      jsonb_build_object(
        'publication_id', snapshot_row.publication_id,
        'academic_year', snapshot_row.academic_year,
        'academic_term', snapshot_row.academic_term,
        'stored_hash', snapshot_row.integrity_hash,
        'calculated_hash', current_hash
      )
    );
  end if;

  return next;
end;
$$;

revoke all on function public.verify_report_snapshot_integrity(text) from public, anon;
grant execute on function public.verify_report_snapshot_integrity(text) to authenticated;
