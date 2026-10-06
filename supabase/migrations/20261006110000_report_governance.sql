create table public.report_term_settings (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  academic_year integer not null check (academic_year >= 2000),
  academic_term text not null check (academic_term in ('Term 1','Term 2','Term 3')),
  next_term_begins_on date,
  class_teacher_name text,
  head_of_school_name text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (campus_id, academic_year, academic_term)
);
alter table public.report_term_settings enable row level security;
create policy "authenticated read report settings" on public.report_term_settings for select to authenticated using (true);
create policy "admins manage report settings" on public.report_term_settings for all to authenticated using (public.my_role()='admin') with check (public.my_role()='admin' and updated_by=auth.uid());
