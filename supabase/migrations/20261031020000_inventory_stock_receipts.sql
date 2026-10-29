-- Stage 65: create the empty catalogue foundation and auditable stock receipts.
-- Product, variant, campus and stock values are never preloaded by this migration.
begin;

create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  sku text,
  category text,
  stock_unit text not null check (length(btrim(stock_unit)) between 1 and 40),
  tracks_variants boolean not null default false,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sku is null or length(btrim(sku)) between 1 and 80),
  check (category is null or length(btrim(category)) between 1 and 100)
);
create unique index inventory_products_sku_casefold_idx
  on public.inventory_products(lower(btrim(sku))) where sku is not null;
create index inventory_products_active_name_idx
  on public.inventory_products(active, lower(name));

create table public.inventory_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  label text not null check (length(btrim(label)) between 1 and 40),
  sku text,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (sku is null or length(btrim(sku)) between 1 and 80)
);
create unique index inventory_product_variants_label_casefold_idx
  on public.inventory_product_variants(product_id, lower(btrim(label)));
create unique index inventory_product_variants_sku_casefold_idx
  on public.inventory_product_variants(lower(btrim(sku))) where sku is not null;
create index inventory_product_variants_product_idx
  on public.inventory_product_variants(product_id, active, lower(label));

create table public.inventory_product_requests (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  operation text not null check (operation in ('create_product','add_variant')),
  payload jsonb not null,
  product_id uuid references public.inventory_products(id) on delete restrict,
  variant_id uuid references public.inventory_product_variants(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (product_id is not null or variant_id is not null)
);

create table public.inventory_stock_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  receipt_kind text not null check (receipt_kind in ('supplier_delivery','opening_stock')),
  supplier_name text,
  supplier_reference text,
  notes text,
  request_payload jsonb not null,
  received_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (supplier_name is null or length(btrim(supplier_name)) between 1 and 200),
  check (supplier_reference is null or length(btrim(supplier_reference)) <= 120),
  check (notes is null or length(btrim(notes)) between 1 and 1000),
  check ((receipt_kind='supplier_delivery' and supplier_name is not null) or (receipt_kind='opening_stock' and length(btrim(notes)) between 5 and 1000))
);
create index inventory_stock_receipts_created_idx
  on public.inventory_stock_receipts(created_at desc, id);

create table public.inventory_stock_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.inventory_stock_receipts(id) on delete restrict,
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  variant_id uuid references public.inventory_product_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_label_snapshot text,
  stock_unit_snapshot text not null,
  quantity_received integer not null check (quantity_received > 0),
  unit_cost numeric(12,2),
  cost_currency text check (cost_currency in ('USD','ZiG')),
  created_at timestamptz not null default now(),
  check ((unit_cost is null and cost_currency is null) or (unit_cost is not null and unit_cost >= 0 and unit_cost::text not in ('NaN','Infinity','-Infinity') and cost_currency is not null))
);
create index inventory_stock_receipt_lines_receipt_idx
  on public.inventory_stock_receipt_lines(receipt_id, id);
create index inventory_stock_receipt_lines_product_idx
  on public.inventory_stock_receipt_lines(product_id, variant_id, created_at);

create table public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  variant_id uuid references public.inventory_product_variants(id) on delete restrict,
  movement_type text not null check (movement_type in ('receipt')),
  quantity_delta integer not null check (quantity_delta > 0),
  receipt_line_id uuid not null unique references public.inventory_stock_receipt_lines(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index inventory_stock_movements_product_idx
  on public.inventory_stock_movements(product_id, variant_id, created_at, id);

alter table public.inventory_products enable row level security;
alter table public.inventory_product_variants enable row level security;
alter table public.inventory_product_requests enable row level security;
alter table public.inventory_stock_receipts enable row level security;
alter table public.inventory_stock_receipt_lines enable row level security;
alter table public.inventory_stock_movements enable row level security;

revoke all on public.inventory_products, public.inventory_product_variants,
  public.inventory_product_requests, public.inventory_stock_receipts,
  public.inventory_stock_receipt_lines, public.inventory_stock_movements
  from public, anon, authenticated;
grant select on public.inventory_products, public.inventory_product_variants,
  public.inventory_stock_receipts, public.inventory_stock_receipt_lines,
  public.inventory_stock_movements to authenticated;

create policy "Main Admin reads inventory products"
  on public.inventory_products for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads inventory variants"
  on public.inventory_product_variants for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads stock receipts"
  on public.inventory_stock_receipts for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads stock receipt lines"
  on public.inventory_stock_receipt_lines for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());
create policy "Main Admin reads stock movements"
  on public.inventory_stock_movements for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());

create function public.create_inventory_product(
  p_request_id uuid, p_name text, p_sku text, p_category text, p_stock_unit text, p_tracks_variants boolean
)
returns public.inventory_products
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_payload jsonb;
  previous public.inventory_product_requests;
  product public.inventory_products;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Product request ID required' using errcode='22023'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 then raise exception 'Enter a product name of 1 to 160 characters' using errcode='22023'; end if;
  if p_sku is not null and length(btrim(p_sku)) not between 1 and 80 then raise exception 'SKU must be 1 to 80 characters' using errcode='22023'; end if;
  if p_category is not null and length(btrim(p_category)) not between 1 and 100 then raise exception 'Category must be 1 to 100 characters' using errcode='22023'; end if;
  if p_stock_unit is null or length(btrim(p_stock_unit)) not between 1 and 40 then raise exception 'Enter a stock unit of 1 to 40 characters' using errcode='22023'; end if;
  if p_tracks_variants is null then raise exception 'Choose whether the product has variants' using errcode='22023'; end if;
  request_payload := jsonb_build_object('name',btrim(p_name),'sku',nullif(btrim(coalesce(p_sku,'')),''),
    'category',nullif(btrim(coalesce(p_category,'')),''),'stock_unit',btrim(p_stock_unit),'tracks_variants',p_tracks_variants);
  perform pg_advisory_xact_lock(hashtextextended('inventory-product:'||p_request_id::text,0));
  select * into previous from public.inventory_product_requests where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.operation<>'create_product' or previous.payload is distinct from request_payload then
      raise exception 'Product request ID was already used for another operation' using errcode='22023';
    end if;
    select * into product from public.inventory_products where id=previous.product_id;
    return product;
  end if;
  insert into public.inventory_products(name,sku,category,stock_unit,tracks_variants,created_by)
  values (btrim(p_name),nullif(btrim(coalesce(p_sku,'')),''),nullif(btrim(coalesce(p_category,'')),''),btrim(p_stock_unit),p_tracks_variants,auth.uid())
  returning * into product;
  insert into public.inventory_product_requests(request_id,actor_id,operation,payload,product_id)
  values (p_request_id,auth.uid(),'create_product',request_payload,product.id);
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
  values(auth.uid(),'inventory_product',product.id,'created',jsonb_build_object('name',product.name,'sku',product.sku,'tracks_variants',product.tracks_variants));
  return product;
end;
$$;

create function public.add_inventory_product_variant(p_request_id uuid,p_product_id uuid,p_label text,p_sku text default null)
returns public.inventory_product_variants
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_payload jsonb;
  previous public.inventory_product_requests;
  product public.inventory_products;
  variant public.inventory_product_variants;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Variant request ID required' using errcode='22023'; end if;
  if p_product_id is null then raise exception 'Choose a product' using errcode='22023'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 40 then raise exception 'Enter a variant label of 1 to 40 characters' using errcode='22023'; end if;
  if p_sku is not null and length(btrim(p_sku)) not between 1 and 80 then raise exception 'Variant SKU must be 1 to 80 characters' using errcode='22023'; end if;
  request_payload := jsonb_build_object('product_id',p_product_id,'label',btrim(p_label),'sku',nullif(btrim(coalesce(p_sku,'')),''));
  perform pg_advisory_xact_lock(hashtextextended('inventory-product:'||p_request_id::text,0));
  select * into previous from public.inventory_product_requests where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.operation<>'add_variant' or previous.payload is distinct from request_payload then
      raise exception 'Variant request ID was already used for another operation' using errcode='22023';
    end if;
    select * into variant from public.inventory_product_variants where id=previous.variant_id;
    return variant;
  end if;
  select * into product from public.inventory_products where id=p_product_id and active for update;
  if not found then raise exception 'Active product not found'; end if;
  if not product.tracks_variants then raise exception 'This product uses one stock balance, not variants'; end if;
  insert into public.inventory_product_variants(product_id,label,sku,created_by)
  values(product.id,btrim(p_label),nullif(btrim(coalesce(p_sku,'')),''),auth.uid())
  returning * into variant;
  insert into public.inventory_product_requests(request_id,actor_id,operation,payload,product_id,variant_id)
  values(p_request_id,auth.uid(),'add_variant',request_payload,product.id,variant.id);
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
  values(auth.uid(),'inventory_product_variant',variant.id,'created',jsonb_build_object('product_id',product.id,'label',variant.label));
  return variant;
end;
$$;

create function public.record_inventory_stock_receipt(
  p_request_id uuid, p_receipt_kind text, p_supplier_name text, p_supplier_reference text, p_notes text, p_items jsonb
)
returns uuid
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_payload jsonb;
  prior_receipt public.inventory_stock_receipts;
  receipt public.inventory_stock_receipts;
  item record;
  product public.inventory_products;
  variant public.inventory_product_variants;
  line public.inventory_stock_receipt_lines;
  v_supplier text := nullif(btrim(coalesce(p_supplier_name,'')),'');
  v_reference text := nullif(btrim(coalesce(p_supplier_reference,'')),'');
  v_notes text := nullif(btrim(coalesce(p_notes,'')),'');
  v_total integer := 0;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Stock receipt request ID required' using errcode='22023'; end if;
  if p_receipt_kind not in ('supplier_delivery','opening_stock') then raise exception 'Choose a supported receipt type' using errcode='22023'; end if;
  if p_receipt_kind='supplier_delivery' and length(coalesce(v_supplier,'')) not between 1 and 200 then raise exception 'Enter the supplier name' using errcode='22023'; end if;
  if p_receipt_kind='opening_stock' and length(coalesce(v_notes,'')) not between 5 and 1000 then raise exception 'Enter a reason for opening stock (5 to 1000 characters)' using errcode='22023'; end if;
  if v_reference is not null and length(v_reference)>120 then raise exception 'Supplier reference must be 120 characters or fewer' using errcode='22023'; end if;
  if v_notes is not null and length(v_notes)>1000 then raise exception 'Notes must be 1000 characters or fewer' using errcode='22023'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'A stock receipt needs 1 to 100 product lines' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (nullif(x->>'variant_id','') is not null and (x->>'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,6}$'
      or (nullif(x->>'unit_cost','') is not null and (x->>'unit_cost') !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$')
      or (nullif(x->>'cost_currency','') is not null and (x->>'cost_currency') not in ('USD','ZiG'))
      or ((nullif(x->>'unit_cost','') is null) <> (nullif(x->>'cost_currency','') is null))
  ) then raise exception 'Each line needs a valid product, positive whole quantity, and matching optional cost/currency' using errcode='22023'; end if;
  if p_receipt_kind='supplier_delivery' and exists(select 1 from jsonb_array_elements(p_items) x where nullif(x->>'unit_cost','') is null) then
    raise exception 'Enter the known supplier unit cost and currency for each delivery line, or record it as opening stock with a reason' using errcode='22023';
  end if;
  request_payload := jsonb_build_object('receipt_kind',p_receipt_kind,'supplier_name',v_supplier,'supplier_reference',v_reference,'notes',v_notes,'items',p_items);
  perform pg_advisory_xact_lock(hashtextextended('inventory-stock-receipt:'||p_request_id::text,0));
  select * into prior_receipt from public.inventory_stock_receipts where request_id=p_request_id;
  if found then
    if prior_receipt.received_by<>auth.uid() or prior_receipt.request_payload is distinct from request_payload then
      raise exception 'Stock receipt request ID was already used for another receipt' using errcode='22023';
    end if;
    return prior_receipt.id;
  end if;
  insert into public.inventory_stock_receipts(request_id,receipt_kind,supplier_name,supplier_reference,notes,request_payload,received_by)
  values(p_request_id,p_receipt_kind,v_supplier,v_reference,v_notes,request_payload,auth.uid())
  returning * into receipt;
  for item in
    select (x->>'product_id')::uuid as product_id,
      nullif(x->>'variant_id','')::uuid as variant_id,
      (x->>'quantity')::integer as quantity,
      nullif(x->>'unit_cost','')::numeric(12,2) as unit_cost,
      nullif(x->>'cost_currency','') as cost_currency
    from jsonb_array_elements(p_items) x
    order by (x->>'product_id')::uuid, nullif(x->>'variant_id','')::uuid nulls first
  loop
    select * into product from public.inventory_products where id=item.product_id and active for update;
    if not found then raise exception 'A selected product is unavailable'; end if;
    variant := null;
    if product.tracks_variants then
      if item.variant_id is null then raise exception 'Choose a variant for %',product.name; end if;
      select * into variant from public.inventory_product_variants where id=item.variant_id and product_id=product.id and active for update;
      if not found then raise exception 'The selected variant is unavailable for %',product.name; end if;
    elsif item.variant_id is not null then
      raise exception '% does not use variants',product.name;
    end if;
    insert into public.inventory_stock_receipt_lines(receipt_id,product_id,variant_id,product_name_snapshot,variant_label_snapshot,stock_unit_snapshot,quantity_received,unit_cost,cost_currency)
    values(receipt.id,product.id,variant.id,product.name,variant.label,product.stock_unit,item.quantity,item.unit_cost,item.cost_currency)
    returning * into line;
    insert into public.inventory_stock_movements(product_id,variant_id,movement_type,quantity_delta,receipt_line_id,actor_id,reason)
    values(product.id,variant.id,'receipt',item.quantity,line.id,auth.uid(),coalesce(v_notes,v_supplier,'Opening stock'));
    v_total:=v_total+item.quantity;
  end loop;
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
  values(auth.uid(),'inventory_stock_receipt',receipt.id,'received',jsonb_build_object('receipt_kind',p_receipt_kind,'line_count',jsonb_array_length(p_items),'quantity_total',v_total,'supplier_name',v_supplier,'supplier_reference',v_reference));
  return receipt.id;
end;
$$;

revoke all on function public.create_inventory_product(uuid,text,text,text,text,boolean) from public, anon;
revoke all on function public.add_inventory_product_variant(uuid,uuid,text,text) from public, anon;
revoke all on function public.record_inventory_stock_receipt(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.create_inventory_product(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.add_inventory_product_variant(uuid,uuid,text,text) to authenticated;
grant execute on function public.record_inventory_stock_receipt(uuid,text,text,text,text,jsonb) to authenticated;

commit;
