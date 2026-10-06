create table public.cashbook_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null check (length(trim(category)) > 0),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD' check (currency in ('USD','ZiG')),
  reference text,
  recorded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.cashbook_expenses enable row level security;
create policy "admins manage cashbook expenses" on public.cashbook_expenses for all to authenticated using (public.my_role()='admin') with check (public.my_role()='admin' and recorded_by=auth.uid());
