-- Stage 61: preserve legacy expense history and add audited Main Admin review.
-- Existing records start unreviewed because historical approval was not stored.
alter table public.cashbook_expenses
  add column review_status text not null default 'legacy_unreviewed',
  add column reviewed_by uuid references public.profiles(id),
  add column reviewed_at timestamptz,
  add column review_reason text,
  add column reversed_by uuid references public.profiles(id),
  add column reversed_at timestamptz,
  add column reversal_reason text,
  add column correction_of uuid references public.cashbook_expenses(id) on delete restrict;

alter table public.cashbook_expenses
  add constraint cashbook_expenses_review_status_check
    check (review_status in ('legacy_unreviewed','pending','approved','rejected','reversed')),
  add constraint cashbook_expenses_review_metadata_check check (
    (review_status in ('legacy_unreviewed','pending') and reviewed_by is null and reviewed_at is null and review_reason is null)
    or (review_status in ('approved','rejected') and reviewed_by is not null and reviewed_at is not null and length(btrim(review_reason)) between 5 and 1000)
    or (review_status='reversed' and (
      (reviewed_by is null and reviewed_at is null and review_reason is null)
      or (reviewed_by is not null and reviewed_at is not null and length(btrim(review_reason)) between 5 and 1000)
    ))
  ),
  add constraint cashbook_expenses_reversal_metadata_check check (
    (review_status='reversed' and reversed_by is not null and reversed_at is not null and length(btrim(reversal_reason)) between 5 and 1000)
    or (review_status<>'reversed' and reversed_by is null and reversed_at is null and reversal_reason is null)
  ),
  add constraint cashbook_expenses_not_own_correction check (correction_of is null or correction_of<>id);

create index cashbook_expenses_review_date_idx
  on public.cashbook_expenses(review_status, expense_date desc);
create index cashbook_expenses_correction_of_idx
  on public.cashbook_expenses(correction_of) where correction_of is not null;

create table public.cashbook_expense_events (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.cashbook_expenses(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('submitted','approved','rejected','reversed','reversed_for_correction','correction_submitted')),
  reason text,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.cashbook_expense_events enable row level security;
create policy "Main Admin reads cashbook expense events"
  on public.cashbook_expense_events for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
revoke all on public.cashbook_expense_events from public, anon, authenticated;
grant select on public.cashbook_expense_events to authenticated;

create table public.cashbook_expense_requests (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  operation text not null check (operation in ('submit','review','reverse','correct')),
  payload jsonb not null,
  source_expense_id uuid references public.cashbook_expenses(id) on delete restrict,
  result_expense_id uuid not null references public.cashbook_expenses(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.cashbook_expense_requests enable row level security;
revoke all on public.cashbook_expense_requests from public, anon, authenticated;

-- Main Admin reads the cashbook directly; every write now passes through the
-- audited RPCs below. This preserves existing Main Admin read scope.
drop policy if exists "admins manage cashbook expenses" on public.cashbook_expenses;
create policy "Main Admin reads cashbook expenses"
  on public.cashbook_expenses for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
revoke all on public.cashbook_expenses from public, anon, authenticated;
grant select on public.cashbook_expenses to authenticated;

create function public.normalize_cashbook_expense(p_expense jsonb)
returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  expense_day date;
  expense_amount numeric;
  expense_category text;
  expense_currency text;
  expense_description text;
  expense_reference text;
begin
  if p_expense is null or jsonb_typeof(p_expense) is distinct from 'object' then
    raise exception 'Expense details are required' using errcode='22023';
  end if;
  begin
    expense_day := (p_expense->>'expense_date')::date;
    expense_amount := (p_expense->>'amount')::numeric;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'Enter a valid expense date and amount' using errcode='22023';
  end;
  expense_category := btrim(coalesce(p_expense->>'category',''));
  expense_currency := upper(btrim(coalesce(p_expense->>'currency','')));
  expense_description := btrim(coalesce(p_expense->>'description',''));
  expense_reference := nullif(btrim(coalesce(p_expense->>'reference','')),'');
  if expense_day is null then raise exception 'Choose an expense date' using errcode='22023'; end if;
  if expense_category not in ('Fuel','Stationery','Repairs','Food','Transport','Utilities','Other') then
    raise exception 'Choose a recognized expense category' using errcode='22023';
  end if;
  if expense_currency not in ('USD','ZiG') then raise exception 'Choose USD or ZiG' using errcode='22023'; end if;
  if expense_amount is null or expense_amount<=0 or expense_amount::text in ('NaN','Infinity','-Infinity')
    or expense_amount<>round(expense_amount,2) or expense_amount>9999999999.99 then
    raise exception 'Enter a positive amount with at most two decimal places' using errcode='22023';
  end if;
  if length(expense_description) not between 1 and 2000 then
    raise exception 'Enter a description of 1 to 2000 characters' using errcode='22023';
  end if;
  if length(coalesce(expense_reference,''))>200 then
    raise exception 'Reference must be no longer than 200 characters' using errcode='22023';
  end if;
  return jsonb_build_object(
    'expense_date',expense_day,
    'category',expense_category,
    'description',expense_description,
    'amount',expense_amount,
    'currency',expense_currency,
    'reference',expense_reference
  );
end;
$$;
revoke all on function public.normalize_cashbook_expense(jsonb) from public, anon, authenticated;

create function public.submit_cashbook_expense(p_request_id uuid, p_expense jsonb)
returns public.cashbook_expenses
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized jsonb;
  previous public.cashbook_expense_requests;
  result public.cashbook_expenses;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Expense request ID required' using errcode='22023'; end if;
  normalized := public.normalize_cashbook_expense(p_expense);
  perform pg_advisory_xact_lock(hashtextextended('cashbook-expense:'||p_request_id::text,0));
  select * into previous from public.cashbook_expense_requests where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.operation<>'submit' or previous.payload is distinct from normalized then
      raise exception 'Expense request ID was already used for another operation' using errcode='22023';
    end if;
    select * into result from public.cashbook_expenses where id=previous.result_expense_id;
    return result;
  end if;
  insert into public.cashbook_expenses(expense_date,category,description,amount,currency,reference,recorded_by,review_status)
  values ((normalized->>'expense_date')::date,normalized->>'category',normalized->>'description',
    (normalized->>'amount')::numeric,normalized->>'currency',normalized->>'reference',auth.uid(),'pending')
  returning * into result;
  insert into public.cashbook_expense_requests(request_id,actor_id,operation,payload,result_expense_id)
  values (p_request_id,auth.uid(),'submit',normalized,result.id);
  insert into public.cashbook_expense_events(expense_id,actor_id,action,after_state)
  values (result.id,auth.uid(),'submitted',to_jsonb(result));
  return result;
end;
$$;

create function public.review_cashbook_expense(p_expense_id uuid,p_request_id uuid,p_decision text,p_reason text)
returns public.cashbook_expenses
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  previous public.cashbook_expense_requests;
  expense public.cashbook_expenses;
  before_state jsonb;
  request_payload jsonb;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Review request ID required' using errcode='22023'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Choose approve or reject' using errcode='22023'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Enter a review reason of 5 to 1000 characters' using errcode='22023';
  end if;
  request_payload := jsonb_build_object('expense_id',p_expense_id,'decision',p_decision,'reason',btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended('cashbook-expense:'||p_request_id::text,0));
  select * into previous from public.cashbook_expense_requests where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.operation<>'review' or previous.payload is distinct from request_payload then
      raise exception 'Review request ID was already used for another operation' using errcode='22023';
    end if;
    select * into expense from public.cashbook_expenses where id=previous.result_expense_id;
    return expense;
  end if;
  select * into expense from public.cashbook_expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if expense.review_status not in ('pending','legacy_unreviewed') then
    raise exception 'Expense is not awaiting review' using errcode='P0001';
  end if;
  before_state := to_jsonb(expense);
  update public.cashbook_expenses set review_status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
    where id=expense.id returning * into expense;
  insert into public.cashbook_expense_requests(request_id,actor_id,operation,payload,source_expense_id,result_expense_id)
  values (p_request_id,auth.uid(),'review',request_payload,expense.id,expense.id);
  insert into public.cashbook_expense_events(expense_id,actor_id,action,reason,before_state,after_state)
  values (expense.id,auth.uid(),p_decision,btrim(p_reason),before_state,to_jsonb(expense));
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
  values (auth.uid(),'cashbook_expense',expense.id,p_decision,jsonb_build_object('reason',btrim(p_reason)));
  return expense;
end;
$$;

create function public.reverse_cashbook_expense(p_expense_id uuid,p_request_id uuid,p_reason text)
returns public.cashbook_expenses
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  previous public.cashbook_expense_requests;
  expense public.cashbook_expenses;
  before_state jsonb;
  request_payload jsonb;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Reversal request ID required' using errcode='22023'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Enter a reversal reason of 5 to 1000 characters' using errcode='22023';
  end if;
  request_payload := jsonb_build_object('expense_id',p_expense_id,'reason',btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended('cashbook-expense:'||p_request_id::text,0));
  select * into previous from public.cashbook_expense_requests where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.operation<>'reverse' or previous.payload is distinct from request_payload then
      raise exception 'Reversal request ID was already used for another operation' using errcode='22023';
    end if;
    select * into expense from public.cashbook_expenses where id=previous.result_expense_id;
    return expense;
  end if;
  select * into expense from public.cashbook_expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if expense.review_status not in ('approved','legacy_unreviewed') then
    raise exception 'Only approved or unreviewed legacy expenses can be reversed' using errcode='P0001';
  end if;
  before_state := to_jsonb(expense);
  update public.cashbook_expenses set review_status='reversed',reversed_by=auth.uid(),reversed_at=now(),reversal_reason=btrim(p_reason)
    where id=expense.id returning * into expense;
  insert into public.cashbook_expense_requests(request_id,actor_id,operation,payload,source_expense_id,result_expense_id)
  values (p_request_id,auth.uid(),'reverse',request_payload,expense.id,expense.id);
  insert into public.cashbook_expense_events(expense_id,actor_id,action,reason,before_state,after_state)
  values (expense.id,auth.uid(),'reversed',btrim(p_reason),before_state,to_jsonb(expense));
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
  values (auth.uid(),'cashbook_expense',expense.id,'reversed',jsonb_build_object('reason',btrim(p_reason),'settlement','No cash refund or transfer was performed'));
  return expense;
end;
$$;

create function public.correct_cashbook_expense(p_expense_id uuid,p_request_id uuid,p_expense jsonb,p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized jsonb;
  request_payload jsonb;
  previous public.cashbook_expense_requests;
  original public.cashbook_expenses;
  replacement public.cashbook_expenses;
  before_state jsonb;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Correction request ID required' using errcode='22023'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Enter a correction reason of 5 to 1000 characters' using errcode='22023';
  end if;
  normalized := public.normalize_cashbook_expense(p_expense);
  request_payload := jsonb_build_object('expense_id',p_expense_id,'expense',normalized,'reason',btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended('cashbook-expense:'||p_request_id::text,0));
  select * into previous from public.cashbook_expense_requests where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.operation<>'correct' or previous.payload is distinct from request_payload then
      raise exception 'Correction request ID was already used for another operation' using errcode='22023';
    end if;
    select * into original from public.cashbook_expenses where id=previous.source_expense_id;
    select * into replacement from public.cashbook_expenses where id=previous.result_expense_id;
    return jsonb_build_object('original',to_jsonb(original),'replacement',to_jsonb(replacement));
  end if;
  select * into original from public.cashbook_expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if original.review_status not in ('approved','legacy_unreviewed') then
    raise exception 'Only approved or unreviewed legacy expenses can be corrected' using errcode='P0001';
  end if;
  before_state := to_jsonb(original);
  update public.cashbook_expenses set review_status='reversed',reversed_by=auth.uid(),reversed_at=now(),reversal_reason=btrim(p_reason)
    where id=original.id returning * into original;
  insert into public.cashbook_expenses(expense_date,category,description,amount,currency,reference,recorded_by,review_status,correction_of)
  values ((normalized->>'expense_date')::date,normalized->>'category',normalized->>'description',
    (normalized->>'amount')::numeric,normalized->>'currency',normalized->>'reference',auth.uid(),'pending',original.id)
  returning * into replacement;
  insert into public.cashbook_expense_requests(request_id,actor_id,operation,payload,source_expense_id,result_expense_id)
  values (p_request_id,auth.uid(),'correct',request_payload,original.id,replacement.id);
  insert into public.cashbook_expense_events(expense_id,actor_id,action,reason,before_state,after_state)
  values (original.id,auth.uid(),'reversed_for_correction',btrim(p_reason),before_state,to_jsonb(original));
  insert into public.cashbook_expense_events(expense_id,actor_id,action,reason,after_state)
  values (replacement.id,auth.uid(),'correction_submitted',btrim(p_reason),to_jsonb(replacement));
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
  values (auth.uid(),'cashbook_expense',original.id,'reversed_for_correction',jsonb_build_object('replacement_id',replacement.id,'reason',btrim(p_reason),'settlement','No cash refund or transfer was performed'));
  return jsonb_build_object('original',to_jsonb(original),'replacement',to_jsonb(replacement));
end;
$$;

revoke all on function public.submit_cashbook_expense(uuid,jsonb) from public, anon;
revoke all on function public.review_cashbook_expense(uuid,uuid,text,text) from public, anon;
revoke all on function public.reverse_cashbook_expense(uuid,uuid,text) from public, anon;
revoke all on function public.correct_cashbook_expense(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.submit_cashbook_expense(uuid,jsonb) to authenticated;
grant execute on function public.review_cashbook_expense(uuid,uuid,text,text) to authenticated;
grant execute on function public.reverse_cashbook_expense(uuid,uuid,text) to authenticated;
grant execute on function public.correct_cashbook_expense(uuid,uuid,jsonb,text) to authenticated;
