-- Record parent recovery guidance without exposing or changing credentials.
create or replace function public.admin_record_parent_recovery_support(
  p_parent_id uuid,
  p_identity_verified boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null
    or public.my_role() is distinct from 'admin'::public.app_role
    or public.my_campus_id() is not null
  then
    raise exception 'Main administrator access required';
  end if;

  if p_identity_verified is not true then
    raise exception 'Verify the requester through the school-approved process before recording recovery guidance';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_parent_id and p.role = 'parent'
  ) then
    raise exception 'Parent account does not exist';
  end if;

  if not exists (
    select 1 from public.student_guardians g
    where g.parent_id = p_parent_id
  ) then
    raise exception 'Parent account has no verified learner link';
  end if;

  insert into public.audit_trail(actor_id, entity_type, entity_id, action, detail)
  values (
    auth.uid(),
    'parent_access',
    p_parent_id,
    'recovery_guidance_provided',
    jsonb_build_object(
      'method', 'parent_self_service_sms_reset',
      'identity_verified', true,
      'reusable_credentials_shared', false
    )
  );
end;
$$;

revoke all on function public.admin_record_parent_recovery_support(uuid, boolean) from public, anon;
grant execute on function public.admin_record_parent_recovery_support(uuid, boolean) to authenticated;
