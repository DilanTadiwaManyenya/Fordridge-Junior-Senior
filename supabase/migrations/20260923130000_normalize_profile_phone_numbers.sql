-- Canonical portal identifier: E.164. Zimbabwe local mobile numbers are migrated safely.
update public.profiles
set phone_number = '+263' || substring(regexp_replace(phone_number, '[^0-9]', '', 'g') from 2)
where phone_number is not null
  and regexp_replace(phone_number, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$';

alter table public.profiles
  add constraint profiles_phone_number_e164
  check (phone_number is null or phone_number ~ '^[+][1-9][0-9]{7,14}$');
