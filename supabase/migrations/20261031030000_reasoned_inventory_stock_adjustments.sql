-- Stage 66: make stock corrections explicit, signed, idempotent and audited.
begin;

create table public.inventory_stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  variant_id uuid references public.inventory_product_variants(id) on delete restrict,
  quantity_before bigint not null check (quantity_before >= 0),
  quantity_delta integer not null check (quantity_delta <> 0),
  quantity_after bigint not null check (quantity_after >= 0 and quantity_after=quantity_before+quantity_delta),
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  request_payload jsonb not null,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index inventory_stock_adjustments_product_idx
  on public.inventory_stock_adjustments(product_id, variant_id, created_at desc, id);

alter table public.inventory_stock_movements
  alter column receipt_line_id drop not null,
  add column adjustment_id uuid unique references public.inventory_stock_adjustments(id) on delete restrict;

alter table public.inventory_stock_movements
  drop constraint inventory_stock_movements_movement_type_check,
  drop constraint inventory_stock_movements_quantity_delta_check,
  add constraint inventory_stock_movements_type_check
    check (movement_type in ('receipt','adjustment')),
  add constraint inventory_stock_movements_source_check check (
    (movement_type='receipt' and quantity_delta>0 and receipt_line_id is not null and adjustment_id is null)
    or (movement_type='adjustment' and quantity_delta<>0 and receipt_line_id is null and adjustment_id is not null)
  );

alter table public.inventory_stock_adjustments enable row level security;
revoke all on public.inventory_stock_adjustments from public, anon, authenticated;
grant select on public.inventory_stock_adjustments to authenticated;
create policy "Main Admin reads stock adjustments"
  on public.inventory_stock_adjustments for select to authenticated
  using (public.my_role()='admin' and public.is_current_main_admin());

create function public.adjust_inventory_stock(
  p_request_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity_delta integer,
  p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_payload jsonb;
  previous public.inventory_stock_adjustments;
  adjustment public.inventory_stock_adjustments;
  product public.inventory_products;
  variant public.inventory_product_variants;
  current_balance bigint;
  next_balance bigint;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' or not public.is_current_main_admin() then
    raise exception 'Main Admin access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Stock adjustment request ID required' using errcode='22023'; end if;
  if p_product_id is null then raise exception 'Choose a product to adjust' using errcode='22023'; end if;
  if p_quantity_delta is null or p_quantity_delta=0 or p_quantity_delta < -9999999 or p_quantity_delta > 9999999 then
    raise exception 'Enter a non-zero whole-number adjustment between -9999999 and 9999999' using errcode='22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Enter a reason of 5 to 1000 characters' using errcode='22023';
  end if;
  request_payload := jsonb_build_object('product_id',p_product_id,'variant_id',p_variant_id,
    'quantity_delta',p_quantity_delta,'reason',btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended('inventory-stock-adjustment:'||p_request_id::text,0));
  select * into previous from public.inventory_stock_adjustments where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.request_payload is distinct from request_payload then
      raise exception 'Stock adjustment request ID was already used for another change' using errcode='22023';
    end if;
    return jsonb_build_object('id',previous.id,'quantity_before',previous.quantity_before,
      'quantity_delta',previous.quantity_delta,'quantity_after',previous.quantity_after,
      'product_id',previous.product_id,'variant_id',previous.variant_id);
  end if;

  -- Receipt and adjustment workflows lock the product first, serializing changes
  -- for both single-balance items and their variants.
  select * into product from public.inventory_products where id=p_product_id and active for update;
  if not found then raise exception 'Active product not found'; end if;
  if product.tracks_variants then
    if p_variant_id is null then raise exception 'Choose a variant for this product' using errcode='22023'; end if;
    select * into variant from public.inventory_product_variants
      where id=p_variant_id and product_id=product.id and active for update;
    if not found then raise exception 'Active variant not found for this product'; end if;
  elsif p_variant_id is not null then
    raise exception 'This product uses one stock balance, not variants' using errcode='22023';
  end if;

  select coalesce(sum(quantity_delta),0)::bigint into current_balance
  from public.inventory_stock_movements
  where product_id=product.id and variant_id is not distinct from p_variant_id;
  next_balance := current_balance + p_quantity_delta;
  if next_balance < 0 then
    raise exception 'Adjustment would make stock negative (current %, requested %)',current_balance,p_quantity_delta using errcode='P0001';
  end if;

  insert into public.inventory_stock_adjustments(request_id,product_id,variant_id,quantity_before,quantity_delta,quantity_after,reason,request_payload,actor_id)
  values(p_request_id,product.id,p_variant_id,current_balance,p_quantity_delta,next_balance,btrim(p_reason),request_payload,auth.uid())
  returning * into adjustment;
  insert into public.inventory_stock_movements(product_id,variant_id,movement_type,quantity_delta,adjustment_id,actor_id,reason)
  values(product.id,p_variant_id,'adjustment',p_quantity_delta,adjustment.id,auth.uid(),btrim(p_reason));
  insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail)
  values(auth.uid(),'inventory_stock_adjustment',adjustment.id,'adjusted',jsonb_build_object(
    'product_id',product.id,'variant_id',p_variant_id,'quantity_before',current_balance,
    'quantity_delta',p_quantity_delta,'quantity_after',next_balance,'reason',btrim(p_reason)
  ));
  return jsonb_build_object('id',adjustment.id,'quantity_before',current_balance,
    'quantity_delta',p_quantity_delta,'quantity_after',next_balance,
    'product_id',product.id,'variant_id',p_variant_id);
end;
$$;

revoke all on function public.adjust_inventory_stock(uuid,uuid,uuid,integer,text) from public, anon;
grant execute on function public.adjust_inventory_stock(uuid,uuid,uuid,integer,text) to authenticated;

commit;
