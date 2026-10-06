create table public.report_publications (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  academic_year integer not null check (academic_year >= 2000),
  academic_term text not null check (academic_term in ('Term 1','Term 2','Term 3')),
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  unique (campus_id, academic_year, academic_term)
);
alter table public.report_publications enable row level security;
create policy "authenticated read report publications" on public.report_publications for select to authenticated using (true);
create policy "admins manage report publications" on public.report_publications for all to authenticated using (public.my_role()='admin') with check (public.my_role()='admin');
