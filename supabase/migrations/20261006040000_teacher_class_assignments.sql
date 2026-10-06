create table public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  class_level text not null check (length(trim(class_level)) > 0),
  class_stream text,
  subject text,
  created_at timestamptz not null default now(),
  unique (teacher_id, campus_id, class_level, class_stream, subject)
);
alter table public.teacher_class_assignments enable row level security;
create policy "admins manage class assignments" on public.teacher_class_assignments for all to authenticated using (public.my_role()='admin') with check (public.my_role()='admin');
create policy "teachers read own class assignments" on public.teacher_class_assignments for select to authenticated using (teacher_id=auth.uid());
