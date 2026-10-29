create table public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  academic_year integer not null check (academic_year >= 2000),
  academic_term text not null check (academic_term in ('Term 1', 'Term 2', 'Term 3')),
  period_status text not null default 'open' check (period_status in ('open', 'closed')),
  is_current boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (campus_id, academic_year, academic_term)
);
create unique index reporting_periods_one_current_per_campus
  on public.reporting_periods(campus_id) where is_current;

create table public.reporting_period_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.reporting_periods(id) on delete restrict,
  campus_id uuid not null references public.campuses(id),
  revision integer not null check (revision > 0),
  action text not null check (action in ('registered', 'closed', 'reopened', 'made_current', 'made_not_current')),
  reason text,
  actor_id uuid references public.profiles(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_id, revision)
);
create index reporting_period_events_campus_time_idx
  on public.reporting_period_events(campus_id, created_at desc);

alter table public.reporting_periods enable row level security;
alter table public.reporting_period_events enable row level security;
create policy "admins read reporting periods" on public.reporting_periods
  for select to authenticated using (
    public.my_role() = 'admin'
    and (public.my_campus_id() is null or campus_id = public.my_campus_id())
  );
create policy "admins read reporting period events" on public.reporting_period_events
  for select to authenticated using (
    public.my_role() = 'admin'
    and (public.my_campus_id() is null or campus_id = public.my_campus_id())
  );
revoke all on public.reporting_periods from public, anon, authenticated;
revoke all on public.reporting_period_events from public, anon, authenticated;
grant select on public.reporting_periods, public.reporting_period_events to authenticated;

-- Copy existing period identities, without merging report publication state
-- into the new period status. A published report remains a separate record.
with known_periods as (
  select campus_id, academic_year, academic_term
  from public.report_term_settings where campus_id is not null
  union all
  select campus_id, academic_year, academic_term
  from public.report_publications
), grouped_periods as (
  select distinct campus_id, academic_year, academic_term from known_periods
)
insert into public.reporting_periods(campus_id, academic_year, academic_term, period_status, revision)
select campus_id, academic_year, academic_term, 'open', 1 from grouped_periods
on conflict (campus_id, academic_year, academic_term) do nothing;

insert into public.reporting_period_events(period_id, campus_id, revision, action, details)
select period.id, period.campus_id, period.revision, 'registered',
  jsonb_build_object('source', 'existing Fordridge report configuration')
from public.reporting_periods period
where not exists (
  select 1 from public.reporting_period_events event
  where event.period_id = period.id and event.revision = period.revision
);

create or replace function public.register_reporting_period(
  p_campus_id uuid,
  p_academic_year integer,
  p_academic_term text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_period_id uuid;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Administrator access required';
  end if;
  if public.my_campus_id() is not null and p_campus_id is distinct from public.my_campus_id() then
    raise exception 'You can register periods only for your active campus';
  end if;
  if p_campus_id is null or p_academic_year is null or p_academic_year < 2000
    or p_academic_term is null or p_academic_term not in ('Term 1', 'Term 2', 'Term 3') then
    raise exception 'Choose a campus, valid academic year and valid term';
  end if;

  insert into public.reporting_periods(campus_id, academic_year, academic_term, created_by, updated_by)
  values (p_campus_id, p_academic_year, p_academic_term, auth.uid(), auth.uid())
  on conflict (campus_id, academic_year, academic_term) do nothing
  returning id into new_period_id;
  if new_period_id is null then
    raise exception 'This reporting period is already registered';
  end if;

  insert into public.reporting_period_events(
    period_id, campus_id, revision, action, actor_id, details
  ) values (
    new_period_id, p_campus_id, 1, 'registered', auth.uid(),
    jsonb_build_object('source', 'administrator')
  );
  return new_period_id;
end;
$$;

revoke all on function public.register_reporting_period(uuid, integer, text) from public, anon;
grant execute on function public.register_reporting_period(uuid, integer, text) to authenticated;
