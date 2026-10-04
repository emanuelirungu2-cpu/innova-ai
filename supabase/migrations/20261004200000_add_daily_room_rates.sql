-- Allow hotel managers to set a room-specific rate for a specific night.

create table if not exists public.room_rate_overrides (
  hotel_id uuid not null,
  room_id uuid not null,
  stay_date date not null,
  nightly_rate numeric(12, 2) not null check (nightly_rate >= 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, room_id, stay_date),
  foreign key (hotel_id, room_id)
    references public.rooms (hotel_id, id) on delete cascade
);

create index if not exists room_rate_overrides_hotel_date_idx
  on public.room_rate_overrides (hotel_id, stay_date);

alter table public.room_rate_overrides enable row level security;

drop policy if exists "Hotel members can view room rate overrides" on public.room_rate_overrides;
create policy "Hotel members can view room rate overrides"
  on public.room_rate_overrides for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff'])));

drop policy if exists "Hotel managers can set room rate overrides" on public.room_rate_overrides;
create policy "Hotel managers can set room rate overrides"
  on public.room_rate_overrides for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager']))
  );

drop policy if exists "Hotel managers can update room rate overrides" on public.room_rate_overrides;
create policy "Hotel managers can update room rate overrides"
  on public.room_rate_overrides for update to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])))
  with check ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));

revoke all on public.room_rate_overrides from anon, authenticated;
grant select, insert, update on public.room_rate_overrides to authenticated;
