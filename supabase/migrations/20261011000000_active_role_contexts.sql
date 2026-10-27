-- Keep the selected role isolated to the signed-in Supabase session. The
-- existing authorization helpers remain on profiles.role until Stage 15
-- migrates the full policy set to active-role-aware scoped checks.
create table public.user_active_role_contexts (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','principal','accountant','teacher','student','parent','staff')),
  campus_id uuid references public.campuses(id),
  updated_at timestamptz not null default now()
);

alter table public.user_active_role_contexts enable row level security;
revoke all on public.user_active_role_contexts from anon, authenticated;

create or replace function public.portal_session_id()
returns uuid language sql stable security definer set search_path = auth, pg_temp
as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;
revoke all on function public.portal_session_id() from public, anon;
grant execute on function public.portal_session_id() to authenticated;

create policy "active role context is private to its session"
  on public.user_active_role_contexts for select to authenticated
  using (user_id = auth.uid() and session_id = public.portal_session_id());

create or replace function public.resolve_active_portal_context()
returns table(active_role text, active_campus_id uuid)
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := public.portal_session_id();
  v_role text;
  v_campus uuid;
begin
  if v_user is null then raise exception 'Sign in to the Fordridge portal'; end if;
  if v_session is null then raise exception 'A valid portal session is required'; end if;

  select c.role, c.campus_id into v_role, v_campus
  from public.user_active_role_contexts c
  where c.session_id = v_session and c.user_id = v_user
  for update;
  if found and exists (
    select 1 from public.user_role_memberships m
    where m.user_id = v_user and m.role = v_role and m.campus_id is not distinct from v_campus
  ) then
    update public.user_active_role_contexts set updated_at = now()
    where session_id = v_session and user_id = v_user;
    return query select v_role, v_campus;
    return;
  end if;

  select m.role, m.campus_id into v_role, v_campus
  from public.user_role_memberships m
  where m.user_id = v_user and m.is_primary;
  if not found then raise exception 'No primary Fordridge role is configured for this account'; end if;

  insert into public.user_active_role_contexts(session_id, user_id, role, campus_id)
  values (v_session, v_user, v_role, v_campus)
  on conflict (session_id) do update
    set user_id = excluded.user_id, role = excluded.role, campus_id = excluded.campus_id, updated_at = now()
    where public.user_active_role_contexts.user_id = v_user;
  if not found then raise exception 'This session belongs to another portal account'; end if;
  return query select v_role, v_campus;
end;
$$;

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
  if p_role = 'admin' and p_campus_id is not null and not exists (
    select 1 from public.user_role_memberships m
    where m.user_id = v_user and m.role = p_role and m.campus_id = p_campus_id and m.is_primary
  ) then
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

revoke all on function public.resolve_active_portal_context() from public, anon;
revoke all on function public.switch_active_portal_role(text, uuid) from public, anon;
grant execute on function public.resolve_active_portal_context() to authenticated;
grant execute on function public.switch_active_portal_role(text, uuid) to authenticated;
