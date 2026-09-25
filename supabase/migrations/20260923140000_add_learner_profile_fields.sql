-- These fields are nullable: no learner metadata is invented for existing profiles.
alter table public.profiles
  add column if not exists admission_number text,
  add column if not exists class_level text,
  add column if not exists class_stream text,
  add column if not exists enrollment_status text;

create unique index if not exists profiles_admission_number_unique
  on public.profiles(admission_number)
  where admission_number is not null;

alter table public.profiles
  add constraint profiles_enrollment_status_valid
  check (enrollment_status is null or enrollment_status in ('active', 'inactive', 'graduated', 'transferred'));
