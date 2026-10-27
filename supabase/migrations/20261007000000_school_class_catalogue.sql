create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  class_level text not null check (length(trim(class_level)) between 1 and 80),
  capacity integer check (capacity is null or capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index school_classes_campus_level_unique
  on public.school_classes(campus_id, lower(trim(class_level)));
create index school_classes_campus_active_idx
  on public.school_classes(campus_id, is_active, class_level);

create table public.school_class_streams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.school_classes(id) on delete restrict,
  stream_name text not null check (length(trim(stream_name)) between 1 and 80),
  capacity integer check (capacity is null or capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index school_class_streams_class_name_unique
  on public.school_class_streams(class_id, lower(trim(stream_name)));
create index school_class_streams_class_active_idx
  on public.school_class_streams(class_id, is_active, stream_name);

alter table public.school_classes enable row level security;
alter table public.school_class_streams enable row level security;

create policy "admins manage school classes"
  on public.school_classes for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

create policy "admins manage school class streams"
  on public.school_class_streams for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

comment on table public.school_classes is
  'Canonical Fordridge class levels. Created empty; school-approved names are entered through the admin Classes workspace.';
comment on table public.school_class_streams is
  'Optional streams below a Fordridge class. No stream names or capacities are preconfigured.';

