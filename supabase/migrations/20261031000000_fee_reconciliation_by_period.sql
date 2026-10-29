create or replace function public.preview_fee_reconciliation(
  p_campus_id uuid default null,
  p_academic_year integer default null,
  p_academic_term text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role public.app_role := public.my_role();
  v_user_campus uuid := public.my_campus_id();
  v_scope_campus uuid := p_campus_id;
  result jsonb;
begin
  if v_role = 'admin' then
    if not public.is_current_main_admin() then
      raise exception 'Main administrator access required';
    end if;
    if p_campus_id is not null and not exists(select 1 from public.campuses where id = p_campus_id) then
      raise exception 'Select a valid campus';
    end if;
  elsif v_role in ('principal','accountant') then
    if v_user_campus is null then
      raise exception 'A campus-scoped finance role is required';
    end if;
    if p_campus_id is not null and p_campus_id is distinct from v_user_campus then
      raise exception 'Finance reconciliation is limited to your assigned campus';
    end if;
    v_scope_campus := v_user_campus;
  else
    raise exception 'Finance reconciliation access required';
  end if;

  with scoped_fees as materialized (
    select f.id, f.student_id, learner.full_name as student_name,
      f.campus_id, campus.name as campus_name, campus.code as campus_code,
      f.academic_year, f.academic_term, f.currency, f.amount,
      f.paid_amount, f.status, f.due_date,
      coalesce(payments.transaction_total,0)::numeric as transaction_total,
      coalesce(payments.wrong_campus_count,0)::integer as wrong_campus_count
    from public.fee_records f
    join public.campuses campus on campus.id = f.campus_id
    join public.profiles learner on learner.id = f.student_id and learner.role = 'student'
    left join lateral (
      select sum(tx.amount)::numeric as transaction_total,
        count(*) filter (where tx.campus_id is distinct from f.campus_id)::integer as wrong_campus_count
      from public.fee_transactions tx
      where tx.fee_record_id = f.id
    ) payments on true
    where (v_scope_campus is null or f.campus_id = v_scope_campus)
      and (p_academic_year is null or f.academic_year = p_academic_year)
      and (p_academic_term is null or f.academic_term = p_academic_term)
  ), analyzed as (
    select scoped_fees.*,
      array_remove(array[
        case when round(paid_amount,2) is distinct from round(transaction_total,2)
          then 'payment_total_mismatch'::text end,
        case when wrong_campus_count > 0 then 'payment_campus_mismatch'::text end,
        case when (status = 'paid' and paid_amount < amount)
          or (status <> 'paid' and amount > 0 and paid_amount >= amount)
          then 'fee_status_mismatch'::text end,
        case when academic_year is null or nullif(trim(academic_term),'') is null
          then 'period_not_assigned'::text end,
        case when nullif(trim(currency),'') is null then 'currency_not_recorded'::text end
      ], null) as anomaly_types
    from scoped_fees
  ), periods as (
    select campus_id,campus_name,campus_code,academic_year,academic_term,currency,
      count(*)::integer as fee_record_count,
      sum(amount)::numeric(14,2) as charges,
      sum(paid_amount)::numeric(14,2) as paid_on_fee_records,
      sum(transaction_total)::numeric(14,2) as payments_in_ledger,
      sum(amount-paid_amount)::numeric(14,2) as outstanding,
      count(*) filter (where cardinality(anomaly_types)>0)::integer as exception_count
    from analyzed
    group by campus_id,campus_name,campus_code,academic_year,academic_term,currency
  ), issues as (
    select * from analyzed where cardinality(anomaly_types)>0
  )
  select jsonb_build_object(
    'record_count',(select count(*) from analyzed),
    'anomaly_count',(select count(*) from issues),
    'anomalies_truncated',(select count(*) from issues)>200,
    'periods',coalesce((select jsonb_agg(jsonb_build_object(
      'campus_id',campus_id,'campus_name',campus_name,'campus_code',campus_code,
      'academic_year',academic_year,'academic_term',academic_term,'currency',currency,
      'fee_record_count',fee_record_count,'charges',charges,
      'paid_on_fee_records',paid_on_fee_records,'payments_in_ledger',payments_in_ledger,
      'outstanding',outstanding,'exception_count',exception_count
    ) order by campus_name,academic_year nulls first,academic_term nulls first,currency)
      from periods),'[]'::jsonb),
    'anomalies',coalesce((select jsonb_agg(jsonb_build_object(
      'fee_record_id',id,
      'student_name',student_name,'campus_id',campus_id,'campus_name',campus_name,
      'academic_year',academic_year,'academic_term',academic_term,'currency',currency,
      'charges',amount,'paid_on_fee_record',paid_amount,'payments_in_ledger',transaction_total,
      'status',status,'due_date',due_date,'anomaly_types',to_jsonb(anomaly_types)
    ) order by campus_name,academic_year nulls first,academic_term nulls first,student_name)
      from (select * from issues order by campus_name,academic_year nulls first,academic_term nulls first,student_name limit 200) issue_rows),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.preview_fee_reconciliation(uuid,integer,text) from public, anon;
grant execute on function public.preview_fee_reconciliation(uuid,integer,text) to authenticated;

comment on function public.preview_fee_reconciliation(uuid,integer,text) is
  'Read-only reconciliation of fee records against payment transactions, grouped by campus, academic period and currency; Main Admin may select scope while Principal/Accountant remain campus-scoped.';
