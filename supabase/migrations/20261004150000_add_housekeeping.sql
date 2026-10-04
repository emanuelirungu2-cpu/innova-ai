-- Add a lightweight room-cleaning workflow and mark rooms dirty after checkout.

alter table public.rooms
  add column if not exists housekeeping_status text not null default 'clean'
  check (housekeeping_status in ('clean', 'dirty', 'cleaning'));

create or replace function public.set_room_housekeeping_status(
  p_room_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hotel_id uuid;
begin
  if p_status not in ('clean', 'dirty', 'cleaning') then
    raise exception 'Invalid housekeeping status' using errcode = '22023';
  end if;

  select room.hotel_id into v_hotel_id
  from public.rooms as room
  where room.id = p_room_id;

  if v_hotel_id is null or not private.has_hotel_role(
    v_hotel_id,
    array['owner', 'admin', 'manager', 'staff']
  ) then
    raise exception 'Not allowed to update this room' using errcode = '42501';
  end if;

  update public.rooms
  set housekeeping_status = p_status
  where id = p_room_id and hotel_id = v_hotel_id;
end;
$$;

revoke all on function public.set_room_housekeeping_status(uuid, text) from public, anon;
grant execute on function public.set_room_housekeeping_status(uuid, text) to authenticated;

create or replace function private.mark_room_dirty_after_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'checked_out' and old.status is distinct from new.status then
    update public.rooms
    set housekeeping_status = 'dirty'
    where id = new.room_id and hotel_id = new.hotel_id;
  end if;
  return new;
end;
$$;

revoke all on function private.mark_room_dirty_after_checkout() from public, anon, authenticated;

drop trigger if exists mark_room_dirty_after_checkout on public.reservations;
create trigger mark_room_dirty_after_checkout
  after update of status on public.reservations
  for each row execute function private.mark_room_dirty_after_checkout();
