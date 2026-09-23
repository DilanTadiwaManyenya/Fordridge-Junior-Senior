-- Separate portal entry points use the same phone identifier that future OTP can verify.
alter type public.app_role add value if not exists 'staff';

alter table public.profiles add column if not exists phone_number text;
create unique index if not exists profiles_phone_number_unique
  on public.profiles(phone_number) where phone_number is not null;

-- Only the two public self-registration roles may be accepted from Auth metadata.
-- Staff, teacher and admin accounts must be provisioned by an administrator.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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
  return new;
end;
$$;

-- A signed-in user cannot promote themselves by editing their profile.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone_number) on public.profiles to authenticated;
