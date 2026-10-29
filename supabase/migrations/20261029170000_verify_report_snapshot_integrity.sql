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
  snapshot_campus_name text;
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
    or md5(concat_ws('|',
      snapshot.publication_id::text,
      snapshot.student_id::text,
      snapshot.assessments::text,
      coalesce(snapshot.average_percent::text, ''),
      coalesce(snapshot.overall_grade, ''),
      coalesce(snapshot.class_rank::text, ''),
      coalesce(snapshot.class_teacher_name, ''),
      coalesce(snapshot.head_of_school_name, ''),
      snapshot.released_at::text
    )) = lower(trim(p_integrity_hash))
  limit 1;
  if not found then return; end if;

  select campus.name
  into snapshot_campus_name
  from public.campuses campus
  where campus.id = snapshot_row.campus_id;

  current_hash := md5(concat_ws('|',
    snapshot_row.publication_id::text,
    snapshot_row.student_id::text,
    snapshot_row.assessments::text,
    coalesce(snapshot_row.average_percent::text, ''),
    coalesce(snapshot_row.overall_grade, ''),
    coalesce(snapshot_row.class_rank::text, ''),
    coalesce(snapshot_row.class_teacher_name, ''),
    coalesce(snapshot_row.head_of_school_name, ''),
    snapshot_row.released_at::text
  ));

  integrity_valid := current_hash = snapshot_row.integrity_hash;
  academic_year := snapshot_row.academic_year;
  academic_term := snapshot_row.academic_term;
  campus_name := snapshot_campus_name;
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
