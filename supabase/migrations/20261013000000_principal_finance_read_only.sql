-- Stage 16: principals may review campus finance data without mutation rights.
-- The fee schedule is school-wide; fee records and transactions are campus-scoped.
-- The cashbook is intentionally excluded until its rows have a campus scope.

create policy "principals read fee settings"
  on public.fee_settings for select to authenticated
  using (public.my_role() = 'principal');

create policy "principals read campus fee records"
  on public.fee_records for select to authenticated
  using (
    public.my_role() = 'principal'
    and campus_id = public.my_campus_id()
  );

create policy "principals read campus fee transactions"
  on public.fee_transactions for select to authenticated
  using (
    public.my_role() = 'principal'
    and campus_id = public.my_campus_id()
  );

-- Return only the directory and fee fields needed for the Principal summary.
-- Profiles remain private under their existing RLS policies.
create function public.principal_finance_fee_records()
returns table (
  id uuid,
  campus_id uuid,
  amount numeric,
  paid_amount numeric,
  currency text,
  due_date date,
  status text,
  payment_reference text,
  academic_year integer,
  academic_term text,
  student_name text,
  campus_name text,
  campus_code text
)
language plpgsql stable security definer set search_path = public, auth, pg_temp
as $$
declare
  v_campus_id uuid := public.my_campus_id();
begin
  if public.my_role() is distinct from 'principal' then
    raise exception 'Principal finance access required';
  end if;
  if v_campus_id is null then
    raise exception 'A campus-scoped Principal membership is required';
  end if;

  return query
    select f.id, f.campus_id, f.amount, f.paid_amount, f.currency,
      f.due_date, f.status, f.payment_reference, f.academic_year,
      f.academic_term, p.full_name, c.name, c.code
    from public.fee_records f
    join public.profiles p on p.id = f.student_id and p.role = 'student'
    join public.campuses c on c.id = f.campus_id
    where f.campus_id = v_campus_id
    order by f.due_date;
end;
$$;

revoke all on function public.principal_finance_fee_records() from public, anon;
grant execute on function public.principal_finance_fee_records() to authenticated;
