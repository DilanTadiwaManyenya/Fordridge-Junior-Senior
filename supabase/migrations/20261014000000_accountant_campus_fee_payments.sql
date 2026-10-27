-- Stage 17: accountants may collect campus-scoped payments, but cannot create
-- fee charges, edit the fee schedule, reverse receipts, or access the cashbook.

create policy "accountants read campus fee records"
  on public.fee_records for select to authenticated
  using (
    public.my_role() = 'accountant'
    and campus_id = public.my_campus_id()
  );

create policy "accountants read campus fee transactions"
  on public.fee_transactions for select to authenticated
  using (
    public.my_role() = 'accountant'
    and campus_id = public.my_campus_id()
  );

create policy "accountants read fee settings"
  on public.fee_settings for select to authenticated
  using (public.my_role() = 'accountant');

-- Return only finance fields and learner name for the assigned campus. This
-- avoids widening profiles RLS merely to populate the accountant fee list.
create function public.accountant_finance_fee_records()
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
  if public.my_role() is distinct from 'accountant' then
    raise exception 'Accountant finance access required';
  end if;
  if v_campus_id is null then
    raise exception 'A campus-scoped Accountant membership is required';
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

revoke all on function public.accountant_finance_fee_records() from public, anon;
grant execute on function public.accountant_finance_fee_records() to authenticated;

-- Preserve the existing idempotent payment transaction while allowing only an
-- active Accountant membership to collect within its campus. Reversals remain
-- Main Admin-only and are not provided by this RPC.
create or replace function public.record_fee_payment(
  p_fee_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_request_id uuid
)
returns public.fee_transactions
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare
  fee public.fee_records;
  tx public.fee_transactions;
  v_role public.app_role := public.my_role();
  v_campus_id uuid := public.my_campus_id();
begin
  if v_role is distinct from 'admin' and v_role is distinct from 'accountant' then
    raise exception 'Administrator or Accountant access required';
  end if;
  if v_role = 'accountant' and v_campus_id is null then
    raise exception 'A campus-scoped Accountant membership is required';
  end if;
  if p_request_id is null then raise exception 'Payment request ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into tx from public.fee_transactions where request_id = p_request_id;
  if found then
    if v_role = 'accountant' and tx.campus_id is distinct from v_campus_id then
      raise exception 'Fee record is unavailable in your assigned campus';
    end if;
    if tx.fee_record_id <> p_fee_id
      or tx.amount <> p_amount
      or tx.payment_method <> p_method
      or tx.reference is distinct from nullif(trim(p_reference),'') then
      raise exception 'This request ID was already used for another payment';
    end if;
    return tx;
  end if;

  select * into fee from public.fee_records where id = p_fee_id for update;
  if not found then
    if v_role = 'accountant' then
      raise exception 'Fee record is unavailable in your assigned campus';
    end if;
    raise exception 'Fee record not found';
  end if;
  if v_role = 'accountant' and fee.campus_id is distinct from v_campus_id then
    raise exception 'Fee record is unavailable in your assigned campus';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2)
    or p_amount > fee.amount - fee.paid_amount then
    raise exception 'Payment must be positive and no greater than the outstanding balance';
  end if;

  insert into public.fee_transactions(
    fee_record_id,campus_id,amount,payment_method,reference,recorded_by,request_id
  ) values (
    fee.id,fee.campus_id,p_amount,p_method,nullif(trim(p_reference),''),auth.uid(),p_request_id
  ) returning * into tx;
  update public.fee_records set
    paid_amount = paid_amount + p_amount,
    status = case when paid_amount + p_amount >= amount then 'paid' else 'pending' end,
    payment_reference = coalesce(tx.reference,payment_reference),
    updated_at = now()
  where id = fee.id;
  return tx;
end;
$$;

revoke all on function public.record_fee_payment(uuid,numeric,text,text,uuid) from public, anon;
grant execute on function public.record_fee_payment(uuid,numeric,text,text,uuid) to authenticated;
