-- Learner profile edits require a reason and append a field-level audit record.
create or replace function public.admin_update_profile(
  p_id uuid,
  p_name text,
  p_campus uuid,
  p_admission text,
  p_class text,
  p_stream text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Administrator access required';
  end if;

  select role into target_role
  from public.profiles
  where id = p_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;
  if target_role = 'student' then
    raise exception 'Use the controlled learner correction workflow';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Name is required';
  end if;

  update public.profiles
  set full_name = trim(p_name), campus_id = p_campus
  where id = p_id;

  insert into public.audit_trail(actor_id, entity_type, entity_id, action)
  values (auth.uid(), 'profile', p_id, 'updated');
end;
$$;

create or replace function public.admin_correct_learner_profile(
  p_id uuid,
  p_name text,
  p_campus uuid,
  p_admission text,
  p_class text,
  p_stream text,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  learner_row public.profiles;
  reason text := trim(coalesce(p_reason, ''));
  changes jsonb := '{}'::jsonb;
  next_name text := trim(coalesce(p_name, ''));
  next_admission text := nullif(trim(coalesce(p_admission, '')), '');
  next_class text := nullif(trim(coalesce(p_class, '')), '');
  next_stream text := nullif(trim(coalesce(p_stream, '')), '');
  next_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Administrator access required';
  end if;
  if length(reason) < 10 or length(reason) > 500 then
    raise exception 'Correction reason must be between 10 and 500 characters';
  end if;
  if next_name = '' then
    raise exception 'Name is required';
  end if;
  if next_status is not null and next_status not in ('active', 'inactive', 'graduated', 'transferred') then
    raise exception 'Invalid enrolment status';
  end if;

  select * into learner_row
  from public.profiles
  where id = p_id
  for update;

  if not found then
    raise exception 'Learner profile not found';
  end if;
  if learner_row.role is distinct from 'student' then
    raise exception 'Target profile is not a learner';
  end if;

  if learner_row.full_name is distinct from next_name then
    changes := changes || jsonb_build_object('full_name', jsonb_build_object('from', learner_row.full_name, 'to', next_name));
  end if;
  if learner_row.campus_id is distinct from p_campus then
    changes := changes || jsonb_build_object('campus_id', jsonb_build_object('from', learner_row.campus_id, 'to', p_campus));
  end if;
  if learner_row.admission_number is distinct from next_admission then
    changes := changes || jsonb_build_object('admission_number', jsonb_build_object('from', learner_row.admission_number, 'to', next_admission));
  end if;
  if learner_row.class_level is distinct from next_class then
    changes := changes || jsonb_build_object('class_level', jsonb_build_object('from', learner_row.class_level, 'to', next_class));
  end if;
  if learner_row.class_stream is distinct from next_stream then
    changes := changes || jsonb_build_object('class_stream', jsonb_build_object('from', learner_row.class_stream, 'to', next_stream));
  end if;
  if learner_row.enrollment_status is distinct from next_status then
    changes := changes || jsonb_build_object('enrollment_status', jsonb_build_object('from', learner_row.enrollment_status, 'to', next_status));
  end if;
  if changes = '{}'::jsonb then
    raise exception 'No learner profile changes to record';
  end if;

  update public.profiles
  set full_name = next_name,
      campus_id = p_campus,
      admission_number = next_admission,
      class_level = next_class,
      class_stream = next_stream,
      enrollment_status = next_status
  where id = p_id;

  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (
    coalesce(p_campus, learner_row.campus_id),
    auth.uid(),
    'learner_profile',
    p_id,
    'corrected',
    jsonb_build_object('reason', reason, 'changes', changes)
  );
end;
$$;

revoke all on function public.admin_correct_learner_profile(uuid, text, uuid, text, text, text, text, text) from public;
grant execute on function public.admin_correct_learner_profile(uuid, text, uuid, text, text, text, text, text) to authenticated;
