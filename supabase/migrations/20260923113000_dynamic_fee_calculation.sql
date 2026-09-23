-- Server-trusted term-fee calculation, ported from FEES TRACKER.py.py.
create table if not exists public.fee_settings (
  setting_key text primary key check (setting_key in (
    'fee_olevel_zimsec', 'fee_olevel_cambridge', 'fee_alevel_arts',
    'fee_alevel_comm', 'fee_alevel_comm_sci', 'fee_alevel_sci_zimsec',
    'fee_alevel_sci_cambridge', 'fee_sports', 'fee_development', 'fee_bus'
  )),
  setting_value numeric(12,2) not null check (setting_value >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.fee_settings(setting_key, setting_value) values
  ('fee_olevel_zimsec', 270), ('fee_olevel_cambridge', 450),
  ('fee_alevel_arts', 330), ('fee_alevel_comm', 330),
  ('fee_alevel_comm_sci', 330), ('fee_alevel_sci_zimsec', 330),
  ('fee_alevel_sci_cambridge', 450), ('fee_sports', 20),
  ('fee_development', 40), ('fee_bus', 0)
on conflict (setting_key) do nothing;

alter table public.fee_settings enable row level security;
create policy "admins view fee settings" on public.fee_settings for select using (public.my_role() = 'admin');
create policy "admins manage fee settings" on public.fee_settings for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

alter table public.fee_records
  add column if not exists form text,
  add column if not exists curriculum text,
  add column if not exists terms_enrolled integer check (terms_enrolled >= 1),
  add column if not exists academic_year integer,
  add column if not exists academic_term text,
  add column if not exists fee_breakdown jsonb;
create unique index if not exists fee_records_one_term_per_student
  on public.fee_records(student_id, academic_year, academic_term)
  where academic_year is not null and academic_term is not null;

create or replace function public.get_fee_breakdown(
  p_form text, p_curriculum text, p_terms_enrolled integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  items jsonb := '[]'::jsonb;
  school_fee numeric;
  is_alevel boolean := position('6' in coalesce(p_form, '')) > 0;
  is_cambridge boolean := lower(coalesce(p_curriculum, '')) = 'cambridge';
  is_science boolean := position('Sciences' in coalesce(p_form, '')) > 0 and position('Comm' in coalesce(p_form, '')) = 0;
  is_comm_sci boolean := position('Comm & Sci' in coalesce(p_form, '')) > 0;
  is_comm boolean := position('Commercials' in coalesce(p_form, '')) > 0;
begin
  select jsonb_object_agg(setting_key, setting_value) into s from public.fee_settings;
  s := coalesce(s, '{}'::jsonb);
  if not is_alevel then
    school_fee := coalesce((s->>'fee_olevel_' || case when is_cambridge then 'cambridge' else 'zimsec' end)::numeric, 0);
    items := items || jsonb_build_array(jsonb_build_object('label', 'School Fees (' || case when is_cambridge then 'Cambridge' else coalesce(p_curriculum, 'ZIMSEC') end || ')', 'amount', school_fee));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Sports Fee', 'amount', coalesce((s->>'fee_sports')::numeric, 0)));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Practical Fee', 'amount', 20));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Development Levy', 'amount', coalesce((s->>'fee_development')::numeric, 0)));
    if coalesce((s->>'fee_bus')::numeric, 0) > 0 then items := items || jsonb_build_array(jsonb_build_object('label', 'Bus Levy', 'amount', (s->>'fee_bus')::numeric)); end if;
    if p_terms_enrolled = 1 then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab Levy (1st Term at School)', 'amount', 30));
    elsif p_terms_enrolled = 2 then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab Levy (2nd Term at School)', 'amount', 30)); end if;
  else
    is_cambridge := is_cambridge and is_science;
    school_fee := case when is_cambridge then coalesce((s->>'fee_alevel_sci_cambridge')::numeric, 0) when is_science then coalesce((s->>'fee_alevel_sci_zimsec')::numeric, 0) when is_comm_sci then coalesce((s->>'fee_alevel_comm_sci')::numeric, 0) when is_comm then coalesce((s->>'fee_alevel_comm')::numeric, 0) else coalesce((s->>'fee_alevel_arts')::numeric, 0) end;
    items := items || jsonb_build_array(jsonb_build_object('label', 'School Fees (' || case when is_cambridge then 'Cambridge' else 'ZIMSEC' end || ')', 'amount', school_fee));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Sports Fee', 'amount', coalesce((s->>'fee_sports')::numeric, 0)));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Development Levy', 'amount', coalesce((s->>'fee_development')::numeric, 0)));
    if coalesce((s->>'fee_bus')::numeric, 0) > 0 then items := items || jsonb_build_array(jsonb_build_object('label', 'Bus Levy', 'amount', (s->>'fee_bus')::numeric)); end if;
    if is_cambridge then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab & Computer Science Fee', 'amount', 100));
    elsif p_terms_enrolled <> 1 and (is_science or is_comm_sci) then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab & Computer Science Fee', 'amount', 50)); end if;
  end if;
  if p_terms_enrolled = 1 then
    items := items || jsonb_build_array(jsonb_build_object('label', 'Registration Fee (Once off)', 'amount', 30), jsonb_build_object('label', 'Desk Fee (Once off)', 'amount', 50), jsonb_build_object('label', 'Report Book (Once off)', 'amount', 10), jsonb_build_object('label', 'School ID (Once off)', 'amount', 5));
  end if;
  return jsonb_build_object('total', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(items) x), 'items', items);
end $$;

-- Admin-only creation deliberately calculates amount and immutable line-item snapshot in Postgres.
create or replace function public.create_term_fee_record(
  p_student_id uuid, p_form text, p_curriculum text, p_terms_enrolled integer,
  p_academic_year integer, p_academic_term text, p_due_date date default null
) returns public.fee_records
language plpgsql security definer set search_path = public as $$
declare r public.fee_records; b jsonb; student_campus uuid;
begin
  if public.my_role() <> 'admin' then raise exception 'Only administrators can create fee records'; end if;
  select campus_id into student_campus from public.profiles where id = p_student_id and role = 'student';
  if student_campus is null then raise exception 'Fee records require a student with an assigned campus'; end if;
  b := public.get_fee_breakdown(p_form, p_curriculum, p_terms_enrolled);
  insert into public.fee_records(campus_id, student_id, amount, due_date, form, curriculum, terms_enrolled, academic_year, academic_term, fee_breakdown)
  values (student_campus, p_student_id, (b->>'total')::numeric, p_due_date, p_form, p_curriculum, p_terms_enrolled, p_academic_year, p_academic_term, b->'items') returning * into r;
  return r;
end $$;

revoke all on function public.get_fee_breakdown(text, text, integer) from public;
revoke all on function public.create_term_fee_record(uuid, text, text, integer, integer, text, date) from public;
grant execute on function public.create_term_fee_record(uuid, text, text, integer, integer, text, date) to authenticated;
