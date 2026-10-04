-- Fix recursive row-level-security checks between hotels and hotel_members.
-- Run this in Supabase SQL Editor after the initial hotel workspace migration.

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

drop policy if exists "Hotel admins can update their hotels" on public.hotels;
create policy "Hotel admins can update their hotels"
  on public.hotels for update to authenticated
  using ((select private.has_hotel_role(hotels.id, array['owner', 'admin'])))
  with check ((select private.has_hotel_role(hotels.id, array['owner', 'admin'])));

drop policy if exists "Hotel owners can delete their hotels" on public.hotels;
create policy "Hotel owners can delete their hotels"
  on public.hotels for delete to authenticated
  using ((select private.has_hotel_role(hotels.id, array['owner'])));
