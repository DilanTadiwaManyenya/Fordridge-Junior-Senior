begin;

create or replace function public.read_activity_log()
returns table (
  id uuid,
  campus_id uuid,
  entity_type text,
  action text,
  created_at timestamptz,
  actor_name text,
  campus_name text
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  active_role text := public.my_role()::text;
  active_campus uuid := public.my_campus_id();
begin
  if active_role not in ('admin', 'principal', 'accountant', 'teacher') then
    raise exception 'Activity Log access required';
  end if;

  return query
  select a.id, a.campus_id, a.entity_type, a.action, a.created_at,
    coalesce(p.full_name, 'System'), c.name
  from public.audit_trail a
  left join public.profiles p on p.id = a.actor_id
  left join public.campuses c on c.id = a.campus_id
  where
    active_role = 'admin'
    or (active_role = 'principal' and active_campus is not null and a.campus_id = active_campus)
    or (active_role = 'accountant' and active_campus is not null and a.campus_id = active_campus
      and a.actor_id = auth.uid()
      and a.entity_type in ('fee_transaction', 'cashbook_expense', 'expense_review', 'inventory_sale',
        'inventory_sale_return', 'inventory_stock_receipt', 'inventory_stock_adjustment'))
    or (active_role = 'teacher' and a.actor_id = auth.uid())
  order by a.created_at desc
  limit 200;
end;
$$;

revoke all on function public.read_activity_log() from public, anon;
grant execute on function public.read_activity_log() to authenticated;

commit;
