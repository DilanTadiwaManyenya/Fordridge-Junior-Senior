drop policy "admins read reporting periods" on public.reporting_periods;
create policy "staff read active campus reporting periods" on public.reporting_periods
  for select to authenticated using (
    (public.my_role() = 'admin'
      and (public.my_campus_id() is null or campus_id = public.my_campus_id()))
    or (public.my_role() = 'teacher' and campus_id = public.my_campus_id())
  );

create or replace function public.close_reporting_period(
  p_period_id uuid,
  p_expected_revision integer,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  period public.reporting_periods;
  next_revision integer;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Administrator access required';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) < 8 then
    raise exception 'Enter a reason of at least 8 characters to close this period';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'The close reason must be 500 characters or fewer';
  end if;

  select * into period from public.reporting_periods
  where id = p_period_id
  for update;
  if not found then raise exception 'Reporting period not found'; end if;
  if public.my_campus_id() is not null and period.campus_id <> public.my_campus_id() then
    raise exception 'You can close periods only for your active campus';
  end if;
  if p_expected_revision is null or p_expected_revision <> period.revision then
    raise exception 'This reporting period changed; refresh the page and review the latest revision';
  end if;
  if period.period_status = 'closed' then
    raise exception 'This reporting period is already closed';
  end if;

  next_revision := period.revision + 1;
  update public.reporting_periods
  set period_status = 'closed', revision = next_revision,
      updated_at = now(), updated_by = auth.uid()
  where id = period.id;

  insert into public.reporting_period_events(
    period_id, campus_id, revision, action, reason, actor_id, details
  ) values (
    period.id, period.campus_id, next_revision, 'closed', trim(p_reason), auth.uid(),
    jsonb_build_object('previous_status', period.period_status, 'is_current', period.is_current)
  );
  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (
    period.campus_id, auth.uid(), 'reporting_period', period.id, 'closed',
    jsonb_build_object('academic_year', period.academic_year, 'academic_term', period.academic_term,
      'revision', next_revision, 'reason', trim(p_reason))
  );
  return next_revision;
end;
$$;

revoke all on function public.close_reporting_period(uuid, integer, text) from public, anon;
grant execute on function public.close_reporting_period(uuid, integer, text) to authenticated;

create or replace function public.guard_published_learner_record_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' and old.kind = 'academic' and exists (
    select 1 from public.profiles p
    join public.reporting_periods period
      on period.campus_id = p.campus_id
      and period.academic_year = old.academic_year
      and period.academic_term = old.academic_term
      and period.period_status = 'closed'
    where p.id = old.student_id
  ) then
    raise exception 'This reporting period is closed; contact an administrator before changing marks';
  end if;
  if tg_op <> 'INSERT' and old.kind = 'academic' and exists (
    select 1 from public.profiles p
    join public.report_publications publication on publication.campus_id = p.campus_id
    where p.id = old.student_id and publication.academic_year = old.academic_year
      and publication.academic_term = old.academic_term and publication.published_at is not null
  ) then
    raise exception 'This academic period has been published; contact an administrator before changing marks';
  end if;
  if tg_op <> 'DELETE' and new.kind = 'academic' and exists (
    select 1 from public.profiles p
    join public.reporting_periods period
      on period.campus_id = p.campus_id
      and period.academic_year = new.academic_year
      and period.academic_term = new.academic_term
      and period.period_status = 'closed'
    where p.id = new.student_id
  ) then
    raise exception 'This reporting period is closed; contact an administrator before changing marks';
  end if;
  if tg_op <> 'DELETE' and new.kind = 'academic' and exists (
    select 1 from public.profiles p
    join public.report_publications publication on publication.campus_id = p.campus_id
    where p.id = new.student_id and publication.academic_year = new.academic_year
      and publication.academic_term = new.academic_term and publication.published_at is not null
  ) then
    raise exception 'This academic period has been published; contact an administrator before changing marks';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
