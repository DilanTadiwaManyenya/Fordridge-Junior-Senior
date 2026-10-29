create or replace function public.review_reporting_period(
  p_period_id uuid,
  p_action text,
  p_expected_revision integer,
  p_expected_current_period_id uuid,
  p_expected_current_revision integer,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row public.reporting_periods;
  current_row public.reporting_periods;
  campus_to_lock uuid;
  next_revision integer;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Administrator access required';
  end if;
  if p_action not in ('reopen', 'make_current') then
    raise exception 'Choose a supported reporting-period review action';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) < 8 then
    raise exception 'Enter a reason of at least 8 characters for this change';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'The reason must be 500 characters or fewer';
  end if;

  select campus_id into campus_to_lock
  from public.reporting_periods where id = p_period_id;
  if not found then raise exception 'Reporting period not found'; end if;
  if public.my_campus_id() is not null and campus_to_lock <> public.my_campus_id() then
    raise exception 'You can change periods only for your active campus';
  end if;

  -- Serialize current-period changes within this campus before checking the
  -- caller's snapshot, so concurrent administrators cannot both become current.
  perform 1 from public.campuses where id = campus_to_lock for update;
  select * into period_row from public.reporting_periods
  where id = p_period_id for update;
  if p_expected_revision is null or p_expected_revision <> period_row.revision then
    raise exception 'This reporting period changed; refresh the page and review the latest revision';
  end if;

  if p_action = 'reopen' then
    if period_row.period_status <> 'closed' then
      raise exception 'Only a closed reporting period can be reopened';
    end if;
    next_revision := period_row.revision + 1;
    update public.reporting_periods
    set period_status = 'open', revision = next_revision,
        updated_at = now(), updated_by = auth.uid()
    where id = period_row.id;
    insert into public.reporting_period_events(
      period_id, campus_id, revision, action, reason, actor_id, details
    ) values (
      period_row.id, period_row.campus_id, next_revision, 'reopened', trim(p_reason), auth.uid(),
      jsonb_build_object('previous_status', period_row.period_status, 'is_current', period_row.is_current)
    );
    insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
    values (
      period_row.campus_id, auth.uid(), 'reporting_period', period_row.id, 'reopened',
      jsonb_build_object('academic_year', period_row.academic_year, 'academic_term', period_row.academic_term,
        'revision', next_revision, 'reason', trim(p_reason))
    );
    return next_revision;
  end if;

  if period_row.period_status <> 'open' then
    raise exception 'Only an open reporting period can be made current';
  end if;
  if period_row.is_current then
    raise exception 'This reporting period is already current';
  end if;

  select * into current_row from public.reporting_periods
  where campus_id = period_row.campus_id and is_current
  for update;
  if found then
    if p_expected_current_period_id is distinct from current_row.id
      or p_expected_current_revision is distinct from current_row.revision then
      raise exception 'The current reporting period changed; refresh the page and review the latest revision';
    end if;
    next_revision := current_row.revision + 1;
    update public.reporting_periods
    set is_current = false, revision = next_revision, updated_at = now(), updated_by = auth.uid()
    where id = current_row.id;
    insert into public.reporting_period_events(
      period_id, campus_id, revision, action, reason, actor_id, details
    ) values (
      current_row.id, current_row.campus_id, next_revision, 'made_not_current', trim(p_reason), auth.uid(),
      jsonb_build_object('replacement_period_id', period_row.id)
    );
    insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
    values (
      current_row.campus_id, auth.uid(), 'reporting_period', current_row.id, 'made_not_current',
      jsonb_build_object('replacement_period_id', period_row.id, 'revision', next_revision,
        'reason', trim(p_reason))
    );
  elsif p_expected_current_period_id is not null or p_expected_current_revision is not null then
    raise exception 'The current reporting period changed; refresh the page and review the latest revision';
  end if;

  next_revision := period_row.revision + 1;
  update public.reporting_periods
  set is_current = true, revision = next_revision, updated_at = now(), updated_by = auth.uid()
  where id = period_row.id;
  insert into public.reporting_period_events(
    period_id, campus_id, revision, action, reason, actor_id, details
  ) values (
    period_row.id, period_row.campus_id, next_revision, 'made_current', trim(p_reason), auth.uid(),
    jsonb_build_object('previous_current_period_id', case when current_row.id is null then null else current_row.id end)
  );
  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (
    period_row.campus_id, auth.uid(), 'reporting_period', period_row.id, 'made_current',
    jsonb_build_object('previous_current_period_id', case when current_row.id is null then null else current_row.id end,
      'revision', next_revision, 'reason', trim(p_reason))
  );
  return next_revision;
end;
$$;

revoke all on function public.review_reporting_period(uuid, text, integer, uuid, integer, text) from public, anon;
grant execute on function public.review_reporting_period(uuid, text, integer, uuid, integer, text) to authenticated;
