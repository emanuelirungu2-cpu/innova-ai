-- Innova AI: room inventory and reservation foundation.
-- Run once in the Supabase SQL Editor for the same project as the app.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  room_number text not null check (char_length(btrim(room_number)) between 1 and 30),
  room_type text not null check (char_length(btrim(room_type)) between 2 and 60),
  max_guests smallint not null default 2 check (max_guests between 1 and 20),
  nightly_rate numeric(12, 2) not null default 0 check (nightly_rate >= 0),
  status text not null default 'active' check (status in ('active', 'out_of_service')),
  created_at timestamptz not null default now(),
  unique (hotel_id, id),
  unique (hotel_id, room_number)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  room_id uuid not null,
  guest_name text not null check (char_length(btrim(guest_name)) between 2 and 120),
  guest_email text,
  guest_phone text,
  check_in date not null,
  check_out date not null,
  adults smallint not null default 1 check (adults between 1 and 20),
  children smallint not null default 0 check (children between 0 and 20),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (check_out > check_in),
  foreign key (hotel_id, room_id)
    references public.rooms (hotel_id, id) on delete restrict
);

create index if not exists rooms_hotel_status_idx
  on public.rooms (hotel_id, status, room_number);
create index if not exists reservations_hotel_dates_idx
  on public.reservations (hotel_id, check_in, check_out);
create index if not exists reservations_room_dates_idx
  on public.reservations (hotel_id, room_id, check_in, check_out);

alter table public.rooms enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "Hotel members can view rooms" on public.rooms;
create policy "Hotel members can view rooms"
  on public.rooms for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff'])));

drop policy if exists "Hotel managers can add rooms" on public.rooms;
create policy "Hotel managers can add rooms"
  on public.rooms for insert to authenticated
  with check ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));

drop policy if exists "Hotel managers can update rooms" on public.rooms;
create policy "Hotel managers can update rooms"
  on public.rooms for update to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])))
  with check ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));

drop policy if exists "Hotel admins can delete rooms" on public.rooms;
create policy "Hotel admins can delete rooms"
  on public.rooms for delete to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin'])));

drop policy if exists "Hotel members can view reservations" on public.reservations;
create policy "Hotel members can view reservations"
  on public.reservations for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff'])));

drop policy if exists "Hotel staff can add reservations" on public.reservations;
create policy "Hotel staff can add reservations"
  on public.reservations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff']))
  );

drop policy if exists "Hotel staff can update reservations" on public.reservations;
create policy "Hotel staff can update reservations"
  on public.reservations for update to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff'])))
  with check ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff'])));

drop policy if exists "Hotel admins can delete reservations" on public.reservations;
create policy "Hotel admins can delete reservations"
  on public.reservations for delete to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin'])));

revoke all on public.rooms from anon, authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
revoke all on public.reservations from anon, authenticated;
grant select, insert, update, delete on public.reservations to authenticated;

-- Serialize writes for each room, then reject overlapping active reservations.
create or replace function private.prevent_room_double_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'no_show') then
    return new;
  end if;

  if not exists (
    select 1
    from public.rooms as room
    where room.id = new.room_id
      and room.hotel_id = new.hotel_id
      and room.status = 'active'
      and room.max_guests >= new.adults + new.children
  ) then
    raise exception 'Room is inactive or guest count exceeds room capacity'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.room_id::text, 0::bigint)
  );

  if exists (
    select 1
    from public.reservations as existing
    where existing.hotel_id = new.hotel_id
      and existing.room_id = new.room_id
      and existing.id is distinct from new.id
      and existing.status not in ('cancelled', 'no_show')
      and existing.check_in < new.check_out
      and existing.check_out > new.check_in
  ) then
    raise exception 'Room is already reserved for some of these dates'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_room_double_booking() from public, anon;
grant execute on function private.prevent_room_double_booking() to authenticated;

drop trigger if exists prevent_room_double_booking on public.reservations;
create trigger prevent_room_double_booking
  before insert or update of hotel_id, room_id, check_in, check_out, status
  on public.reservations
  for each row execute function private.prevent_room_double_booking();
