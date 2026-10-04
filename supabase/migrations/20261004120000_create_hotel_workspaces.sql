-- Innova AI: tenant-safe hotel workspace foundation.
-- Run once in the Supabase SQL Editor for the project used by this app.

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  city text not null check (char_length(btrim(city)) between 2 and 100),
  country text not null check (char_length(btrim(country)) between 2 and 100),
  timezone text not null default 'Africa/Nairobi',
  currency text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.hotel_members (
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (hotel_id, user_id)
);

create index if not exists hotel_members_user_id_idx
  on public.hotel_members (user_id, hotel_id);

alter table public.hotels enable row level security;
alter table public.hotel_members enable row level security;

-- The policy helper reads memberships with a pinned search path. Keeping it in
-- the private schema avoids recursive RLS checks between hotels and members.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.has_hotel_role(
  p_hotel_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hotel_members as membership
    where membership.hotel_id = p_hotel_id
      and membership.user_id = (select auth.uid())
      and membership.role = any (p_roles)
  );
$$;

revoke all on function private.has_hotel_role(uuid, text[]) from public, anon;
grant execute on function private.has_hotel_role(uuid, text[]) to authenticated;

drop policy if exists "Members can view their hotels" on public.hotels;
create policy "Members can view their hotels"
  on public.hotels for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.has_hotel_role(hotels.id, array['owner', 'admin', 'manager', 'staff']))
  );

drop policy if exists "Users can create hotels as themselves" on public.hotels;
create policy "Users can create hotels as themselves"
  on public.hotels for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "Members can view their own memberships" on public.hotel_members;
create policy "Members can view their own memberships"
  on public.hotel_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add themselves as hotel owner" on public.hotel_members;
create policy "Users can add themselves as hotel owner"
  on public.hotel_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1
      from public.hotels
      where hotels.id = hotel_members.hotel_id
        and hotels.created_by = (select auth.uid())
    )
  );

drop policy if exists "Hotel admins can update their hotels" on public.hotels;
create policy "Hotel admins can update their hotels"
  on public.hotels for update to authenticated
  using (
    (select private.has_hotel_role(hotels.id, array['owner', 'admin']))
  )
  with check (
    (select private.has_hotel_role(hotels.id, array['owner', 'admin']))
  );

drop policy if exists "Hotel owners can delete their hotels" on public.hotels;
create policy "Hotel owners can delete their hotels"
  on public.hotels for delete to authenticated
  using (
    (select private.has_hotel_role(hotels.id, array['owner']))
  );

revoke all on public.hotels from anon, authenticated;
grant select, insert, update, delete on public.hotels to authenticated;
revoke all on public.hotel_members from anon, authenticated;
grant select, insert on public.hotel_members to authenticated;

create or replace function public.create_hotel_workspace(
  p_name text,
  p_city text,
  p_country text,
  p_timezone text,
  p_currency text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hotel_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_city, ''))) not between 2 and 100
     or char_length(btrim(coalesce(p_country, ''))) not between 2 and 100
     or coalesce(p_currency, '') !~ '^[A-Z]{3}$'
     or not exists (
       select 1 from pg_catalog.pg_timezone_names where name = p_timezone
     ) then
    raise exception 'Invalid hotel details' using errcode = '22023';
  end if;

  insert into public.hotels (name, city, country, timezone, currency, created_by)
  values (
    btrim(p_name),
    btrim(p_city),
    btrim(p_country),
    p_timezone,
    p_currency,
    v_user_id
  )
  returning id into v_hotel_id;

  insert into public.hotel_members (hotel_id, user_id, role)
  values (v_hotel_id, v_user_id, 'owner');

  return v_hotel_id;
end;
$$;

revoke all on function public.create_hotel_workspace(text, text, text, text, text)
  from public, anon;
grant execute on function public.create_hotel_workspace(text, text, text, text, text)
  to authenticated;
