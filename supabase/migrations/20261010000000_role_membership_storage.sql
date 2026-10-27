-- Store role grants separately from the legacy profiles.role field.
-- Authorization continues to use the legacy role until Stage 13 adds an
-- explicit active-role context and later stages migrate the protected rules.
create table public.user_role_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','principal','accountant','teacher','student','parent','staff')),
  campus_id uuid references public.campuses(id),
  is_primary boolean not null default false,
  granted_by uuid references public.profiles(id),
  grant_reason text not null,
  granted_at timestamptz not null default now(),
  check (role not in ('principal','accountant') or campus_id is not null),
  check (granted_by is null or granted_by <> user_id)
);

create unique index user_role_memberships_scope_unique
  on public.user_role_memberships(user_id, role, coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index user_role_memberships_one_primary
  on public.user_role_memberships(user_id) where is_primary;
create index user_role_memberships_user_idx on public.user_role_memberships(user_id, role);

alter table public.user_role_memberships enable row level security;
revoke all on public.user_role_memberships from anon, authenticated;
grant select on public.user_role_memberships to authenticated;

-- Preserve every existing profile's current role as its primary membership.
insert into public.user_role_memberships(user_id, role, campus_id, is_primary, grant_reason)
select id, role::text, campus_id, true, 'Migrated from the existing Fordridge profile role'
from public.profiles
on conflict do nothing;

create or replace function public.is_current_main_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_role_memberships m
    where m.user_id = auth.uid() and m.role = 'admin' and m.campus_id is null and m.is_primary
  );
$$;
revoke all on function public.is_current_main_admin() from public, anon;
grant execute on function public.is_current_main_admin() to authenticated;

create policy "users read own role memberships or main admin reads all"
  on public.user_role_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_current_main_admin());

create or replace function public.grant_portal_role(
  p_user_id uuid,
  p_role text,
  p_campus_id uuid,
  p_reason text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_reason text := nullif(trim(p_reason), '');
begin
  if auth.uid() is null or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot grant a role to yourself';
  end if;
  if p_role not in ('admin','principal','accountant','teacher','student','parent','staff') then
    raise exception 'Unsupported Fordridge role';
  end if;
  if v_reason is null or length(v_reason) < 8 then
    raise exception 'Provide a role grant reason of at least 8 characters';
  end if;
  if p_role in ('principal','accountant') and p_campus_id is null then
    raise exception 'Principal and accountant grants require a campus';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Target account does not exist';
  end if;
  if p_campus_id is not null and not exists (select 1 from public.campuses where id = p_campus_id) then
    raise exception 'Campus does not exist';
  end if;

  insert into public.user_role_memberships(user_id, role, campus_id, is_primary, granted_by, grant_reason)
  values (p_user_id, p_role, p_campus_id, false, auth.uid(), v_reason)
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
    values (p_campus_id, auth.uid(), 'role_membership', p_user_id, 'granted',
      jsonb_build_object('role', p_role, 'campus_id', p_campus_id, 'reason', v_reason));
  else
    select id into v_id from public.user_role_memberships
    where user_id = p_user_id and role = p_role and campus_id is not distinct from p_campus_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.replace_primary_portal_role(
  p_user_id uuid,
  p_role public.app_role,
  p_campus_id uuid,
  p_reason text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_old record;
  v_reason text := nullif(trim(p_reason), '');
begin
  if auth.uid() is null or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own primary role';
  end if;
  if v_reason is null or length(v_reason) < 8 then
    raise exception 'Provide a role change reason of at least 8 characters';
  end if;
  if p_campus_id is not null and not exists (select 1 from public.campuses where id = p_campus_id) then
    raise exception 'Campus does not exist';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = p_role and campus_id is not distinct from p_campus_id
  ) then
    raise exception 'The provisioned profile role and campus must match the requested primary grant';
  end if;

  select id, role, campus_id into v_old from public.user_role_memberships
  where user_id = p_user_id and is_primary for update;
  if not found then raise exception 'No primary role membership exists for this account'; end if;

  if v_old.role = p_role::text and v_old.campus_id is not distinct from p_campus_id then
    update public.user_role_memberships
    set granted_by = auth.uid(), grant_reason = v_reason, granted_at = now()
    where id = v_old.id;
    insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
    values (p_campus_id, auth.uid(), 'role_membership', p_user_id, 'primary_role_confirmed',
      jsonb_build_object('role', p_role::text, 'campus_id', p_campus_id, 'reason', v_reason));
    return v_old.id;
  end if;
  if v_old.role = 'admin' and v_old.campus_id is null
    and (p_role <> 'admin' or p_campus_id is not null)
    and (select count(*) from public.user_role_memberships where role = 'admin' and campus_id is null) <= 1 then
    raise exception 'The last Main Admin primary membership cannot be changed';
  end if;

  update public.user_role_memberships
  set role = p_role::text, campus_id = p_campus_id, granted_by = auth.uid(), grant_reason = v_reason, granted_at = now()
  where id = v_old.id returning id into v_id;

  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (p_campus_id, auth.uid(), 'role_membership', p_user_id, 'primary_role_changed',
    jsonb_build_object('previous_role', v_old.role, 'previous_campus_id', v_old.campus_id,
      'role', p_role::text, 'campus_id', p_campus_id, 'reason', v_reason));
  return v_id;
end;
$$;

create or replace function public.revoke_portal_role(
  p_user_id uuid,
  p_role text,
  p_campus_id uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_membership public.user_role_memberships%rowtype;
  v_reason text := nullif(trim(p_reason), '');
begin
  if auth.uid() is null or not public.is_current_main_admin() then
    raise exception 'Main administrator access required';
  end if;
  if p_user_id = auth.uid() then raise exception 'You cannot revoke your own role'; end if;
  if v_reason is null or length(v_reason) < 8 then
    raise exception 'Provide a role revocation reason of at least 8 characters';
  end if;
  select * into v_membership from public.user_role_memberships
  where user_id = p_user_id and role = p_role and campus_id is not distinct from p_campus_id for update;
  if not found then raise exception 'Role membership does not exist'; end if;
  if v_membership.is_primary then
    raise exception 'Primary role must be changed through account provisioning';
  end if;

  delete from public.user_role_memberships where id = v_membership.id;
  insert into public.audit_trail(campus_id, actor_id, entity_type, entity_id, action, detail)
  values (p_campus_id, auth.uid(), 'role_membership', p_user_id, 'revoked',
    jsonb_build_object('role', p_role, 'campus_id', p_campus_id, 'reason', v_reason));
end;
$$;

revoke all on function public.grant_portal_role(uuid, text, uuid, text) from public, anon;
revoke all on function public.replace_primary_portal_role(uuid, public.app_role, uuid, text) from public, anon;
revoke all on function public.revoke_portal_role(uuid, text, uuid, text) from public, anon;
grant execute on function public.grant_portal_role(uuid, text, uuid, text) to authenticated;
grant execute on function public.replace_primary_portal_role(uuid, public.app_role, uuid, text) to authenticated;
grant execute on function public.revoke_portal_role(uuid, text, uuid, text) to authenticated;

-- Keep membership rows aligned with Fordridge's deliberately restricted public signup roles.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare requested_role public.app_role;
begin
  requested_role := case lower(coalesce(new.raw_user_meta_data ->> 'portal_role', 'student'))
    when 'parent' then 'parent'::public.app_role
    when 'student' then 'student'::public.app_role
    else 'student'::public.app_role
  end;
  insert into public.profiles(id, full_name, phone_number, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone_number', ''),
    requested_role
  );
  insert into public.user_role_memberships(user_id, role, is_primary, grant_reason)
  values (new.id, requested_role::text, true, 'Approved self-registration role');
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
