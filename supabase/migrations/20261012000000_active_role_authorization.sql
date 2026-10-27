-- Stage 15: make database authorization follow the verified active membership.
-- Scoped Campus Admin permissions remain disabled until their feature policies
-- are implemented; never interpret a campus grant as school-wide admin access.

alter type public.app_role add value if not exists 'principal';
alter type public.app_role add value if not exists 'accountant';

create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public, auth, pg_temp
as $$
  with active_membership as (
    select c.role, c.campus_id
    from public.user_active_role_contexts c
    join public.user_role_memberships m
      on m.user_id = c.user_id
     and m.role = c.role
     and m.campus_id is not distinct from c.campus_id
    where c.user_id = auth.uid()
      and c.session_id = public.portal_session_id()
    limit 1
  ), selected_membership as (
    select role, campus_id from active_membership
    union all
    select m.role, m.campus_id
    from public.user_role_memberships m
    where m.user_id = auth.uid()
      and m.is_primary
      and not exists (select 1 from active_membership)
    limit 1
  )
  select case
    when role = 'admin' and campus_id is not null then 'staff'::public.app_role
    else role::public.app_role
  end
  from selected_membership
  limit 1;
$$;

create or replace function public.my_campus_id()
returns uuid
language sql stable security definer set search_path = public, auth, pg_temp
as $$
  with active_membership as (
    select c.campus_id
    from public.user_active_role_contexts c
    join public.user_role_memberships m
      on m.user_id = c.user_id
     and m.role = c.role
     and m.campus_id is not distinct from c.campus_id
    where c.user_id = auth.uid()
      and c.session_id = public.portal_session_id()
    limit 1
  )
  select campus_id from active_membership
  union all
  select m.campus_id
  from public.user_role_memberships m
  where m.user_id = auth.uid()
    and m.is_primary
    and not exists (select 1 from active_membership)
  limit 1;
$$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.my_campus_id() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_campus_id() to authenticated;

-- Stage 13 held secondary Campus Admin switching until a scoped-policy stage.
-- Keep the guard explicit here, including primary campus-scoped admin grants.
create or replace function public.switch_active_portal_role(
  p_role text,
  p_campus_id uuid
)
returns table(active_role text, active_campus_id uuid)
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := public.portal_session_id();
begin
  if v_user is null then raise exception 'Sign in to the Fordridge portal'; end if;
  if v_session is null then raise exception 'A valid portal session is required'; end if;
  if not exists (
    select 1 from public.user_role_memberships m
    where m.user_id = v_user and m.role = p_role and m.campus_id is not distinct from p_campus_id
  ) then raise exception 'That role and campus are not assigned to your account'; end if;
  if p_role = 'admin' and p_campus_id is not null then
    raise exception 'Campus Admin switching requires the scoped policy stage';
  end if;

  insert into public.user_active_role_contexts(session_id, user_id, role, campus_id)
  values (v_session, v_user, p_role, p_campus_id)
  on conflict (session_id) do update
    set role = excluded.role, campus_id = excluded.campus_id, updated_at = now()
    where public.user_active_role_contexts.user_id = v_user;
  if not found then raise exception 'This session belongs to another portal account'; end if;
  return query select p_role, p_campus_id;
end;
$$;

revoke all on function public.switch_active_portal_role(text, uuid) from public, anon;
grant execute on function public.switch_active_portal_role(text, uuid) to authenticated;
