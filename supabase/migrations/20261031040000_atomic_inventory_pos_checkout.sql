-- Stage 67: configure catalogue prices and post a complete POS checkout atomically.
begin;

alter table public.inventory_products
  add column unit_price numeric(12,2),
  add column price_currency text,
  add constraint inventory_products_price_pair_check
    check ((unit_price is null and price_currency is null) or (unit_price is not null and unit_price > 0 and unit_price::text not in ('NaN','Infinity','-Infinity') and price_currency in ('USD','ZiG')));

create table public.inventory_product_price_requests (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.inventory_product_price_requests enable row level security;
revoke all on public.inventory_product_price_requests from public, anon, authenticated;

create function public.set_inventory_product_price(
  p_request_id uuid, p_product_id uuid, p_unit_price numeric, p_currency text
)
returns public.inventory_products
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_payload jsonb;
  previous public.inventory_product_price_requests;
  product public.inventory_products;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null or p_product_id is null then raise exception 'Price request and product are required' using errcode='22023'; end if;
  if p_unit_price is null or p_unit_price <= 0 or p_unit_price > 9999999999.99 or p_unit_price::text in ('NaN','Infinity','-Infinity') or p_unit_price<>round(p_unit_price,2) then
    raise exception 'Enter a positive price up to 9999999999.99' using errcode='22023';
  end if;
  if p_currency is null or p_currency not in ('USD','ZiG') then raise exception 'Choose USD or ZiG' using errcode='22023'; end if;
  request_payload := jsonb_build_object('product_id',p_product_id,'unit_price',p_unit_price,'currency',p_currency);
  perform pg_advisory_xact_lock(hashtextextended('inventory-product-price:'||p_request_id::text,0));
  select * into previous from public.inventory_product_price_requests where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.payload is distinct from request_payload then
      raise exception 'Price request ID was already used for another change' using errcode='22023';
    end if;
    select * into product from public.inventory_products where id=previous.product_id;
    return product;
  end if;
  select * into product from public.inventory_products where id=p_product_id and active for update;
  if not found then raise exception 'Active product not found'; end if;
  update public.inventory_products set unit_price=p_unit_price,price_currency=p_currency,updated_at=now()
    where id=product.id returning * into product;
  insert into public.inventory_product_price_requests(request_id,actor_id,product_id,payload)
    values(p_request_id,auth.uid(),product.id,request_payload);
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
    values(auth.uid(),'inventory_product',product.id,'price_updated',jsonb_build_object('unit_price',product.unit_price,'currency',product.price_currency));
  return product;
end;
$$;

revoke all on function public.set_inventory_product_price(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.set_inventory_product_price(uuid,uuid,numeric,text) to authenticated;

create table public.inventory_sales (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_payload jsonb not null,
  currency text not null check (currency in ('USD','ZiG')),
  subtotal numeric(20,2) not null check (subtotal > 0 and subtotal::text not in ('NaN','Infinity','-Infinity')),
  total numeric(20,2) not null check (total=subtotal),
  sold_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index inventory_sales_created_idx on public.inventory_sales(created_at desc,id);

create table public.inventory_sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.inventory_sales(id) on delete restrict,
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  variant_id uuid references public.inventory_product_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_label_snapshot text,
  stock_unit_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price > 0 and unit_price::text not in ('NaN','Infinity','-Infinity')),
  currency text not null check (currency in ('USD','ZiG')),
  line_total numeric(20,2) not null check (line_total=unit_price*quantity),
  created_at timestamptz not null default now()
);
create index inventory_sale_lines_sale_idx on public.inventory_sale_lines(sale_id,id);
create index inventory_sale_lines_stock_idx on public.inventory_sale_lines(product_id,variant_id,created_at);

create table public.inventory_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.inventory_sales(id) on delete restrict,
  amount numeric(20,2) not null check (amount > 0 and amount::text not in ('NaN','Infinity','-Infinity')),
  currency text not null check (currency in ('USD','ZiG')),
  reported_method text not null check (length(btrim(reported_method)) between 1 and 60),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.inventory_sales enable row level security;
alter table public.inventory_sale_lines enable row level security;
alter table public.inventory_sale_payments enable row level security;
revoke all on public.inventory_sales,public.inventory_sale_lines,public.inventory_sale_payments from public,anon,authenticated;
grant select on public.inventory_sales,public.inventory_sale_lines,public.inventory_sale_payments to authenticated;
create policy "Main Admin reads inventory sales" on public.inventory_sales for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads inventory sale lines" on public.inventory_sale_lines for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads inventory sale payments" on public.inventory_sale_payments for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());

alter table public.inventory_stock_movements
  add column sale_line_id uuid unique references public.inventory_sale_lines(id) on delete restrict;
alter table public.inventory_stock_movements
  drop constraint inventory_stock_movements_source_check,
  add constraint inventory_stock_movements_source_check check (
    (movement_type='receipt' and quantity_delta>0 and receipt_line_id is not null and adjustment_id is null and sale_line_id is null)
    or (movement_type='adjustment' and quantity_delta<>0 and receipt_line_id is null and adjustment_id is not null and sale_line_id is null)
    or (movement_type='sale' and quantity_delta<0 and receipt_line_id is null and adjustment_id is null and sale_line_id is not null)
  );
alter table public.inventory_stock_movements
  drop constraint inventory_stock_movements_type_check,
  add constraint inventory_stock_movements_type_check check (movement_type in ('receipt','adjustment','sale'));

create function public.record_inventory_sale(
  p_request_id uuid, p_items jsonb, p_reported_method text
)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_payload jsonb;
  previous public.inventory_sales;
  sale public.inventory_sales;
  item jsonb;
  product public.inventory_products;
  variant public.inventory_product_variants;
  sale_line public.inventory_sale_lines;
  payment public.inventory_sale_payments;
  product_ids uuid[];
  item_count integer;
  quantity_value integer;
  balance bigint;
  line_amount numeric(20,2);
  total_amount numeric(20,2):=0;
  sale_currency text;
  method text:=nullif(btrim(coalesce(p_reported_method,'')),'');
  result_lines jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Sale request ID required' using errcode='22023'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Select between 1 and 50 sale lines' using errcode='22023';
  end if;
  if method is null or length(method)>60 then raise exception 'Enter the payment method reported by the operator' using errcode='22023'; end if;

  -- Normalize and validate line identity before locking stock rows.
  for item in select value from jsonb_array_elements(p_items) loop
    if coalesce(item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,6}$' then
      raise exception 'Each sale line needs a product and positive whole quantity' using errcode='22023';
    end if;
    if nullif(item->>'variant_id','') is not null and (item->>'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Sale line has an invalid variant' using errcode='22023';
    end if;
  end loop;
  select count(*),array_agg(distinct (value->>'product_id')::uuid order by (value->>'product_id')::uuid)
    into item_count,product_ids from jsonb_array_elements(p_items);
  if exists (
    select 1 from (
      select (value->>'product_id')::uuid product_id,nullif(value->>'variant_id','') variant_id,count(*) n
      from jsonb_array_elements(p_items) group by 1,2 having count(*)>1
    ) duplicate_lines
  ) then raise exception 'Combine duplicate product and variant lines before checkout' using errcode='22023'; end if;

  request_payload:=jsonb_build_object('items',p_items,'reported_method',method);
  perform pg_advisory_xact_lock(hashtextextended('inventory-sale:'||p_request_id::text,0));
  select * into previous from public.inventory_sales where request_id=p_request_id;
  if found then
    if previous.sold_by<>auth.uid() or previous.request_payload is distinct from request_payload then
      raise exception 'Sale request ID was already used for another checkout' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('product',product_name_snapshot,'variant',variant_label_snapshot,
      'quantity',quantity,'unit',stock_unit_snapshot,'unit_price',unit_price,'currency',currency,'line_total',line_total)
      order by id),'[]'::jsonb) into result_lines from public.inventory_sale_lines where sale_id=previous.id;
    return jsonb_build_object('id',previous.id,'currency',previous.currency,'total',previous.total,'lines',result_lines);
  end if;

  -- Product locks serialize checkout against receipts, adjustments, and price changes.
  perform id from public.inventory_products where id=any(product_ids) order by id for update;
  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value:=(item->>'quantity')::integer;
    select * into product from public.inventory_products where id=(item->>'product_id')::uuid and active;
    if not found or product.unit_price is null or product.price_currency is null then
      raise exception 'A selected product is unavailable or has no configured selling price';
    end if;
    if sale_currency is null then sale_currency:=product.price_currency;
    elsif sale_currency<>product.price_currency then raise exception 'A checkout cannot mix currencies' using errcode='22023'; end if;
    if product.tracks_variants then
      if nullif(item->>'variant_id','') is null then raise exception 'Choose a variant for each selected product' using errcode='22023'; end if;
      select * into variant from public.inventory_product_variants where id=(item->>'variant_id')::uuid and product_id=product.id and active for update;
      if not found then raise exception 'Selected variant is unavailable'; end if;
    elsif nullif(item->>'variant_id','') is not null then
      raise exception 'This product uses one stock balance, not variants' using errcode='22023';
    end if;
    select coalesce(sum(quantity_delta),0)::bigint into balance from public.inventory_stock_movements
      where product_id=product.id and variant_id is not distinct from nullif(item->>'variant_id','')::uuid;
    if balance<quantity_value then raise exception 'Not enough stock for % (available %, requested %)',product.name,balance,quantity_value using errcode='P0001'; end if;
    line_amount:=round(product.unit_price*quantity_value,2);
    total_amount:=total_amount+line_amount;
  end loop;
  if total_amount<=0 then raise exception 'Checkout total must be positive' using errcode='22023'; end if;

  insert into public.inventory_sales(request_id,request_payload,currency,subtotal,total,sold_by)
    values(p_request_id,request_payload,sale_currency,total_amount,total_amount,auth.uid()) returning * into sale;
  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value:=(item->>'quantity')::integer;
    select * into product from public.inventory_products where id=(item->>'product_id')::uuid;
    if nullif(item->>'variant_id','') is not null then
      select * into variant from public.inventory_product_variants where id=(item->>'variant_id')::uuid;
    else variant:=null; end if;
    line_amount:=round(product.unit_price*quantity_value,2);
    insert into public.inventory_sale_lines(sale_id,product_id,variant_id,product_name_snapshot,variant_label_snapshot,stock_unit_snapshot,quantity,unit_price,currency,line_total)
      values(sale.id,product.id,variant.id,product.name,variant.label,product.stock_unit,quantity_value,product.unit_price,product.price_currency,line_amount)
      returning * into sale_line;
    insert into public.inventory_stock_movements(product_id,variant_id,movement_type,quantity_delta,sale_line_id,actor_id,reason)
      values(product.id,variant.id,'sale',-quantity_value,sale_line.id,auth.uid(),'POS sale '||sale.id::text);
    result_lines:=result_lines||jsonb_build_array(jsonb_build_object('product',sale_line.product_name_snapshot,'variant',sale_line.variant_label_snapshot,
      'quantity',sale_line.quantity,'unit',sale_line.stock_unit_snapshot,'unit_price',sale_line.unit_price,'currency',sale_line.currency,'line_total',sale_line.line_total));
  end loop;
  insert into public.inventory_sale_payments(sale_id,amount,currency,reported_method,recorded_by)
    values(sale.id,total_amount,sale_currency,method,auth.uid()) returning * into payment;
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
    values(auth.uid(),'inventory_sale',sale.id,'checked_out',jsonb_build_object('line_count',item_count,'currency',sale_currency,'total',total_amount,'payment_method_reported',method,'payment_id',payment.id));
  return jsonb_build_object('id',sale.id,'currency',sale_currency,'total',total_amount,'lines',result_lines);
end;
$$;

revoke all on function public.record_inventory_sale(uuid,jsonb,text) from public,anon;
grant execute on function public.record_inventory_sale(uuid,jsonb,text) to authenticated;

commit;
