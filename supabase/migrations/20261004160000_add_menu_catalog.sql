-- Create a hotel-scoped food and beverage catalog for the Innova AI POS.

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null default 'food' check (category in ('food', 'beverage', 'other')),
  description text check (description is null or char_length(description) <= 500),
  price numeric(12, 2) not null check (price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hotel_id, id)
);

create unique index if not exists menu_items_hotel_name_idx
  on public.menu_items (hotel_id, lower(name));
create index if not exists menu_items_hotel_category_idx
  on public.menu_items (hotel_id, category, is_available, name);

alter table public.menu_items enable row level security;

drop policy if exists "Hotel members can view menu items" on public.menu_items;
create policy "Hotel members can view menu items"
  on public.menu_items for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff'])));

drop policy if exists "Hotel managers can add menu items" on public.menu_items;
create policy "Hotel managers can add menu items"
  on public.menu_items for insert to authenticated
  with check ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));

drop policy if exists "Hotel managers can update menu items" on public.menu_items;
create policy "Hotel managers can update menu items"
  on public.menu_items for update to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])))
  with check ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));

drop policy if exists "Hotel admins can delete menu items" on public.menu_items;
create policy "Hotel admins can delete menu items"
  on public.menu_items for delete to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin'])));

revoke all on public.menu_items from anon, authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
