create table public.report_grade_bands (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  minimum_percent numeric(5,2) not null check (minimum_percent >= 0 and minimum_percent <= 100),
  maximum_percent numeric(5,2) not null check (maximum_percent >= 0 and maximum_percent <= 100 and maximum_percent >= minimum_percent),
  grade text not null check (length(trim(grade)) > 0),
  descriptor text,
  created_at timestamptz not null default now()
);
alter table public.report_grade_bands enable row level security;
create policy "authenticated read grade bands" on public.report_grade_bands for select to authenticated using (true);
create policy "admins manage grade bands" on public.report_grade_bands for all to authenticated using (public.my_role()='admin') with check (public.my_role()='admin');
