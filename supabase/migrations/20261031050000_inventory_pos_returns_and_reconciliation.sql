-- Stage 68: trace partial POS returns, reported refunds and optional restocking.
begin;

create table public.inventory_sale_returns (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_payload jsonb not null,
  sale_id uuid not null references public.inventory_sales(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  refund_total numeric(20,2) not null check (refund_total > 0 and refund_total::text not in ('NaN','Infinity','-Infinity')),
  currency text not null check (currency in ('USD','ZiG')),
  returned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index inventory_sale_returns_sale_idx on public.inventory_sale_returns(sale_id,created_at,id);

create table public.inventory_sale_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.inventory_sale_returns(id) on delete restrict,
  sale_line_id uuid not null references public.inventory_sale_lines(id) on delete restrict,
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  variant_id uuid references public.inventory_product_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_label_snapshot text,
  stock_unit_snapshot text not null,
  quantity integer not null check (quantity > 0),
  restocked boolean not null,
  unit_price numeric(12,2) not null check (unit_price > 0),
  currency text not null check (currency in ('USD','ZiG')),
  line_refund numeric(20,2) not null check (line_refund=unit_price*quantity),
  created_at timestamptz not null default now(),
  unique(return_id,sale_line_id)
);
create index inventory_sale_return_lines_sale_line_idx on public.inventory_sale_return_lines(sale_line_id,created_at);

create table public.inventory_sale_refunds (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null unique references public.inventory_sale_returns(id) on delete restrict,
  amount numeric(20,2) not null check (amount > 0 and amount::text not in ('NaN','Infinity','-Infinity')),
  currency text not null check (currency in ('USD','ZiG')),
  reported_method text not null check (length(btrim(reported_method)) between 1 and 60),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.inventory_sale_returns enable row level security;
alter table public.inventory_sale_return_lines enable row level security;
alter table public.inventory_sale_refunds enable row level security;
revoke all on public.inventory_sale_returns,public.inventory_sale_return_lines,public.inventory_sale_refunds from public,anon,authenticated;
grant select on public.inventory_sale_returns,public.inventory_sale_return_lines,public.inventory_sale_refunds to authenticated;
create policy "Main Admin reads inventory returns" on public.inventory_sale_returns for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads inventory return lines" on public.inventory_sale_return_lines for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads inventory refunds" on public.inventory_sale_refunds for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());

alter table public.inventory_stock_movements add column return_line_id uuid unique references public.inventory_sale_return_lines(id) on delete restrict;
alter table public.inventory_stock_movements
  drop constraint inventory_stock_movements_source_check,
  add constraint inventory_stock_movements_source_check check (
    (movement_type='receipt' and quantity_delta>0 and receipt_line_id is not null and adjustment_id is null and sale_line_id is null and return_line_id is null)
    or (movement_type='adjustment' and quantity_delta<>0 and receipt_line_id is null and adjustment_id is not null and sale_line_id is null and return_line_id is null)
    or (movement_type='sale' and quantity_delta<0 and receipt_line_id is null and adjustment_id is null and sale_line_id is not null and return_line_id is null)
    or (movement_type='return' and quantity_delta>0 and receipt_line_id is null and adjustment_id is null and sale_line_id is null and return_line_id is not null)
  );
alter table public.inventory_stock_movements
  drop constraint inventory_stock_movements_type_check,
  add constraint inventory_stock_movements_type_check check (movement_type in ('receipt','adjustment','sale','return'));

create function public.record_inventory_sale_return(
  p_request_id uuid, p_sale_id uuid, p_items jsonb, p_reason text, p_reported_refund_method text
)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_payload jsonb;
  previous public.inventory_sale_returns;
  sale public.inventory_sales;
  sale_line public.inventory_sale_lines;
  return_record public.inventory_sale_returns;
  return_line public.inventory_sale_return_lines;
  refund public.inventory_sale_refunds;
  item jsonb;
  item_count integer;
  product_ids uuid[];
  quantity_value integer;
  previously_returned integer;
  total_refund numeric(20,2):=0;
  method text:=nullif(btrim(coalesce(p_reported_refund_method,'')),'');
  reason_text text:=nullif(btrim(coalesce(p_reason,'')),'');
  result_lines jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null or p_sale_id is null then raise exception 'Return request and sale are required' using errcode='22023'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Select between 1 and 50 return lines' using errcode='22023';
  end if;
  if reason_text is null or length(reason_text) not between 5 and 1000 then raise exception 'Enter a return reason of 5 to 1000 characters' using errcode='22023'; end if;
  if method is null or length(method)>60 then raise exception 'Enter the refund method reported by the operator' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if coalesce(item->>'sale_line_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,6}$'
       or coalesce(item->>'restock','') not in ('true','false') then
      raise exception 'Each return line needs a sale line, positive whole quantity, and explicit restock choice' using errcode='22023';
    end if;
  end loop;
  if exists (select 1 from (select value->>'sale_line_id' id,count(*) n from jsonb_array_elements(p_items) group by 1 having count(*)>1) duplicates) then
    raise exception 'Combine duplicate sale lines before submitting a return' using errcode='22023';
  end if;
  select count(*),array_agg(distinct sl.product_id order by sl.product_id)
    into item_count,product_ids
    from jsonb_array_elements(p_items) item_json
    join public.inventory_sale_lines sl on sl.id=(item_json.value->>'sale_line_id')::uuid and sl.sale_id=p_sale_id;
  if item_count<>jsonb_array_length(p_items) then raise exception 'A selected item does not belong to this sale' using errcode='22023'; end if;

  request_payload:=jsonb_build_object('sale_id',p_sale_id,'items',p_items,'reason',reason_text,'reported_refund_method',method);
  perform pg_advisory_xact_lock(hashtextextended('inventory-sale-return:'||p_request_id::text,0));
  select * into previous from public.inventory_sale_returns where request_id=p_request_id;
  if found then
    if previous.returned_by<>auth.uid() or previous.request_payload is distinct from request_payload then
      raise exception 'Return request ID was already used for another operation' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('product',product_name_snapshot,'variant',variant_label_snapshot,
      'quantity',quantity,'unit',stock_unit_snapshot,'restocked',restocked,'line_refund',line_refund,'currency',currency)
      order by id),'[]'::jsonb) into result_lines from public.inventory_sale_return_lines where return_id=previous.id;
    return jsonb_build_object('id',previous.id,'sale_id',previous.sale_id,'currency',previous.currency,'refund_total',previous.refund_total,'lines',result_lines);
  end if;

  -- A sale-row lock serializes simultaneous partial returns against remaining sold quantities.
  select * into sale from public.inventory_sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  perform id from public.inventory_products where id=any(product_ids) order by id for update;
  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value:=(item->>'quantity')::integer;
    select * into sale_line from public.inventory_sale_lines where id=(item->>'sale_line_id')::uuid and sale_id=sale.id;
    select coalesce(sum(quantity),0)::integer into previously_returned from public.inventory_sale_return_lines where sale_line_id=sale_line.id;
    if quantity_value>sale_line.quantity-previously_returned then
      raise exception 'Return quantity exceeds the remaining sold quantity for %',sale_line.product_name_snapshot using errcode='P0001';
    end if;
    total_refund:=total_refund+sale_line.unit_price*quantity_value;
  end loop;
  if total_refund<=0 then raise exception 'Refund total must be positive' using errcode='22023'; end if;

  insert into public.inventory_sale_returns(request_id,request_payload,sale_id,reason,refund_total,currency,returned_by)
    values(p_request_id,request_payload,sale.id,reason_text,total_refund,sale.currency,auth.uid()) returning * into return_record;
  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value:=(item->>'quantity')::integer;
    select * into sale_line from public.inventory_sale_lines where id=(item->>'sale_line_id')::uuid and sale_id=sale.id;
    insert into public.inventory_sale_return_lines(return_id,sale_line_id,product_id,variant_id,product_name_snapshot,variant_label_snapshot,stock_unit_snapshot,quantity,restocked,unit_price,currency,line_refund)
      values(return_record.id,sale_line.id,sale_line.product_id,sale_line.variant_id,sale_line.product_name_snapshot,sale_line.variant_label_snapshot,
        sale_line.stock_unit_snapshot,quantity_value,(item->>'restock')::boolean,sale_line.unit_price,sale_line.currency,sale_line.unit_price*quantity_value)
      returning * into return_line;
    if return_line.restocked then
      insert into public.inventory_stock_movements(product_id,variant_id,movement_type,quantity_delta,return_line_id,actor_id,reason)
        values(return_line.product_id,return_line.variant_id,'return',return_line.quantity,return_line.id,auth.uid(),'Restocked POS return '||return_record.id::text||': '||reason_text);
    end if;
    result_lines:=result_lines||jsonb_build_array(jsonb_build_object('product',return_line.product_name_snapshot,'variant',return_line.variant_label_snapshot,
      'quantity',return_line.quantity,'unit',return_line.stock_unit_snapshot,'restocked',return_line.restocked,'line_refund',return_line.line_refund,'currency',return_line.currency));
  end loop;
  insert into public.inventory_sale_refunds(return_id,amount,currency,reported_method,recorded_by)
    values(return_record.id,total_refund,sale.currency,method,auth.uid()) returning * into refund;
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
    values(auth.uid(),'inventory_sale_return',return_record.id,'returned',jsonb_build_object('sale_id',sale.id,'line_count',item_count,
      'refund_total',total_refund,'currency',sale.currency,'refund_method_reported',method,'reason',reason_text,'refund_id',refund.id));
  return jsonb_build_object('id',return_record.id,'sale_id',sale.id,'currency',sale.currency,'refund_total',total_refund,'lines',result_lines);
end;
$$;

revoke all on function public.record_inventory_sale_return(uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.record_inventory_sale_return(uuid,uuid,jsonb,text,text) to authenticated;

commit;
