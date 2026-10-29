alter table public.report_grade_bands
  add column band_group text check (band_group in ('primary', 'olevel', 'alevel')),
  add column points integer check (points is null or points between 0 and 9),
  add column updated_at timestamptz not null default now();

create unique index report_grade_bands_global_group_min_uidx
  on public.report_grade_bands(band_group, minimum_percent)
  where campus_id is null and band_group is not null;
create unique index report_grade_bands_campus_group_min_uidx
  on public.report_grade_bands(campus_id, band_group, minimum_percent)
  where campus_id is not null and band_group is not null;

insert into public.report_grade_bands(campus_id, band_group, minimum_percent, maximum_percent, grade, points, descriptor)
values
  (null,'primary',85,100,'Unit 1',1,'Excellent'),
  (null,'primary',77,84,'Unit 2',2,'Very Good'),
  (null,'primary',70,76,'Unit 3',3,'Good'),
  (null,'primary',60,69,'Unit 4',4,'Satisfactory'),
  (null,'primary',50,59,'Unit 5',5,'Fair'),
  (null,'primary',40,49,'Unit 6',6,'Pass - Lower'),
  (null,'primary',30,39,'Unit 7',7,'Pass - Low'),
  (null,'primary',20,29,'Unit 8',8,'Fail'),
  (null,'primary',0,19,'Unit 9',9,'Fail - Very Low'),
  (null,'olevel',75,100,'A',5,'Distinction'),
  (null,'olevel',65,74,'B',4,'Merit'),
  (null,'olevel',50,64,'C',3,'Credit - Pass'),
  (null,'olevel',40,49,'D',2,'Pass'),
  (null,'olevel',0,39,'E',1,'Fair'),
  (null,'alevel',80,100,'A',5,'Outstanding'),
  (null,'alevel',70,79,'B',4,'Very Good'),
  (null,'alevel',60,69,'C',3,'Good'),
  (null,'alevel',50,59,'D',2,'Satisfactory'),
  (null,'alevel',40,49,'E',1,'Minimum Pass'),
  (null,'alevel',30,39,'O',0,'Subsidiary Pass'),
  (null,'alevel',0,29,'F',0,'Fail')
on conflict (band_group, minimum_percent)
  where campus_id is null and band_group is not null do nothing;

create or replace function public.report_grade_band_group(p_class_level text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(trim(p_class_level), '') ~* '^ECD([[:space:]]|$)'
      or coalesce(trim(p_class_level), '') ~* '^Grade[[:space:]]+' then 'primary'
    when coalesce(trim(p_class_level), '') ~* '^Form[[:space:]]+[1-4]$' then 'olevel'
    when coalesce(trim(p_class_level), '') ~* '^(Lower|Upper)[[:space:]]+(Six|Sixth)$'
      or coalesce(trim(p_class_level), '') ~* '^Sixth[[:space:]]+Form$'
      or coalesce(trim(p_class_level), '') ~* '^A[[:space:]]+Level([[:space:]]+[12])?$' then 'alevel'
    else null
  end
$$;

create or replace function public.report_grade_for_class_percent(
  p_campus_id uuid,
  p_class_level text,
  p_percent numeric
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select band.grade
  from public.report_grade_bands band
  where p_percent between 0 and 100
    and (
      (public.report_grade_band_group(p_class_level) is not null
        and band.band_group = public.report_grade_band_group(p_class_level)
        and (band.campus_id = p_campus_id or band.campus_id is null))
      or (band.band_group is null and band.campus_id = p_campus_id)
    )
    and (case when public.report_grade_band_group(p_class_level) is null
      then p_percent else floor(p_percent) end)
      between band.minimum_percent and band.maximum_percent
  order by
    case
      when band.band_group = public.report_grade_band_group(p_class_level)
        and band.campus_id = p_campus_id then 0
      when band.band_group = public.report_grade_band_group(p_class_level)
        and band.campus_id is null then 1
      else 2
    end,
    band.minimum_percent desc
  limit 1
$$;

revoke all on function public.report_grade_for_class_percent(uuid, text, numeric) from public, anon;
grant execute on function public.report_grade_for_class_percent(uuid, text, numeric) to authenticated;

create or replace function public.save_report_grade_scale(
  p_campus_id uuid,
  p_band_group text,
  p_bands jsonb,
  p_reason text,
  p_expected_updated_at timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  band_row record;
  previous_max numeric;
  band_count integer;
  current_updated_at timestamptz;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Administrator access required';
  end if;
  if p_campus_id is null and public.my_campus_id() is not null then
    raise exception 'Only the Main Admin can change the global reference scale';
  end if;
  if p_campus_id is not null and public.my_campus_id() is not null
    and p_campus_id is distinct from public.my_campus_id() then
    raise exception 'You can change grade scales only for your active campus';
  end if;
  if p_band_group is null or p_band_group not in ('primary', 'olevel', 'alevel') then
    raise exception 'Choose a supported school level';
  end if;
  if jsonb_typeof(p_bands) is distinct from 'array' then
    raise exception 'Provide the complete grade scale as a list of bands';
  end if;
  if jsonb_array_length(p_bands) not between 1 and 12 then
    raise exception 'Provide the complete grade scale';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) < 8 then
    raise exception 'Enter a reason of at least 8 characters for this scale change';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'The scale-change reason must be 500 characters or fewer';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(p_campus_id::text, 'global') || ':' || p_band_group, 0
  ));
  select max(updated_at) into current_updated_at
  from public.report_grade_bands
  where campus_id is not distinct from p_campus_id and band_group = p_band_group;
  if current_updated_at is distinct from p_expected_updated_at then
    raise exception 'This grade scale changed; refresh it and review the latest values';
  end if;

  select count(*) into band_count
  from jsonb_to_recordset(p_bands) as bands(
    minimum_percent numeric, maximum_percent numeric, grade text, points numeric, descriptor text
  );
  if band_count is null or band_count < 1 or exists (
    select 1 from jsonb_to_recordset(p_bands) as bands(
      minimum_percent numeric, maximum_percent numeric, grade text, points numeric, descriptor text
    )
    where minimum_percent is null or maximum_percent is null
      or minimum_percent < 0 or maximum_percent > 100
      or minimum_percent <> trunc(minimum_percent) or maximum_percent <> trunc(maximum_percent)
      or maximum_percent < minimum_percent
      or nullif(trim(grade), '') is null
      or points is null or points <> trunc(points) or points not between 0 and 9
      or nullif(trim(descriptor), '') is null
  ) then
    raise exception 'Every band needs whole-number limits, a grade, a 0–9 point value and a descriptor';
  end if;

  previous_max := null;
  for band_row in
    select minimum_percent, maximum_percent
    from jsonb_to_recordset(p_bands) as bands(
      minimum_percent numeric, maximum_percent numeric, grade text, points numeric, descriptor text
    )
    order by minimum_percent
  loop
    if previous_max is null and band_row.minimum_percent <> 0 then
      raise exception 'The scale must begin at 0';
    end if;
    if previous_max is not null and band_row.minimum_percent <> previous_max + 1 then
      raise exception 'The scale has a gap or overlap between score bands';
    end if;
    previous_max := band_row.maximum_percent;
  end loop;
  if previous_max <> 100 then raise exception 'The scale must end at 100'; end if;

  delete from public.report_grade_bands
  where campus_id is not distinct from p_campus_id and band_group = p_band_group;
  insert into public.report_grade_bands(
    campus_id, band_group, minimum_percent, maximum_percent, grade, points, descriptor, updated_at
  )
  select p_campus_id, p_band_group, bands.minimum_percent, bands.maximum_percent,
    trim(bands.grade), bands.points, trim(bands.descriptor), now()
  from jsonb_to_recordset(p_bands) as bands(
    minimum_percent numeric, maximum_percent numeric, grade text, points numeric, descriptor text
  );

  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (
    p_campus_id, auth.uid(), 'report_grade_scale', coalesce(p_campus_id, auth.uid()), 'replaced',
    jsonb_build_object('band_group', p_band_group, 'band_count', band_count, 'reason', trim(p_reason))
  );
  return band_count;
end;
$$;

revoke all on function public.save_report_grade_scale(uuid, text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.save_report_grade_scale(uuid, text, jsonb, text, timestamptz) to authenticated;

revoke insert, update, delete on public.report_grade_bands from public, anon, authenticated;
grant select on public.report_grade_bands to authenticated;

create or replace function public.enrich_report_release_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    with averages as (
      select r.student_id,
        avg(r.score / nullif(r.max_score, 0) * 100) filter (where r.assessment_type = 'markbook') as average_percent
      from public.learner_records r
      join public.profiles p on p.id = r.student_id
      where r.kind = 'academic' and r.academic_year = new.academic_year
        and r.academic_term = new.academic_term and p.campus_id = new.campus_id
      group by r.student_id
      having count(*) filter (where r.assessment_type = 'markbook') > 0
    ), ranked as (
      select a.student_id, rank() over(order by a.average_percent desc)::integer as class_rank,
        count(*) over()::integer as class_size
      from averages a
    )
    update public.report_release_snapshots s
    set class_rank = ranked.class_rank,
        class_size = ranked.class_size,
        overall_grade = (
          select public.report_grade_for_class_percent(s.campus_id, p.class_level, s.average_percent)
          from public.profiles p where p.id = s.student_id
        )
    from ranked where s.publication_id = new.id and s.student_id = ranked.student_id;
  end if;
  return new;
end;
$$;

create or replace function public.validate_report_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    if not exists(
      select 1 from public.learner_records r join public.profiles p on p.id = r.student_id
      where r.kind = 'academic' and r.academic_year = new.academic_year
        and r.academic_term = new.academic_term and p.campus_id = new.campus_id
    ) then raise exception 'Enter academic marks before publishing reports'; end if;
    if exists (
      select 1
      from public.profiles p
      where p.role = 'student' and p.campus_id = new.campus_id
        and exists (
          select 1 from public.learner_records r
          where r.student_id = p.id and r.kind = 'academic'
            and r.academic_year = new.academic_year and r.academic_term = new.academic_term
        )
        and not exists (
          select 1 from public.report_grade_bands b
          where (b.band_group = public.report_grade_band_group(p.class_level)
              and (b.campus_id = new.campus_id or b.campus_id is null))
            or (b.band_group is null and b.campus_id = new.campus_id)
        )
    ) then raise exception 'Configure grade bands for every class level before publishing reports'; end if;
    if not exists(
      select 1 from public.report_term_settings s
      where s.campus_id = new.campus_id and s.academic_year = new.academic_year
        and s.academic_term = new.academic_term
        and nullif(trim(s.class_teacher_name), '') is not null
        and nullif(trim(s.head_of_school_name), '') is not null
    ) then raise exception 'Set class teacher and head of school approval names before publishing reports'; end if;
  end if;
  return new;
end;
$$;
