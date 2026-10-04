-- Add a hotel-scoped expense ledger for owners and managers.

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  expense_date date not null,
  category text not null check (category in (
    'food_supplies', 'payroll', 'rent', 'utilities', 'maintenance',
    'transport', 'marketing', 'other'
  )),
  description text not null check (char_length(btrim(description)) between 2 and 240),
  vendor text check (vendor is null or char_length(vendor) <= 120),
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'mobile_money', 'bank_transfer')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (hotel_id, id)
);

create index if not exists expenses_hotel_date_idx
  on public.expenses (hotel_id, expense_date desc, created_at desc);

alter table public.expenses enable row level security;

drop policy if exists "Hotel managers can view expenses" on public.expenses;
create policy "Hotel managers can view expenses"
  on public.expenses for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));

drop policy if exists "Hotel managers can add expenses" on public.expenses;
create policy "Hotel managers can add expenses"
  on public.expenses for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager']))
  );

revoke all on public.expenses from anon, authenticated;
grant select, insert on public.expenses to authenticated;
