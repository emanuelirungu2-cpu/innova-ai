-- Daily usage protection for the AI assistant.
create table if not exists public.ai_daily_usage (
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_day date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (hotel_id, user_id)
);

alter table public.ai_daily_usage enable row level security;
revoke all on public.ai_daily_usage from anon, authenticated;
grant all on public.ai_daily_usage to service_role;

create or replace function public.consume_ai_daily_request(
  p_hotel_id uuid,
  p_daily_limit integer default 20
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null or not private.has_hotel_role(
    p_hotel_id, array['owner', 'admin', 'manager', 'staff']
  ) then
    raise exception 'Not allowed to use the hotel assistant' using errcode = '42501';
  end if;
  if p_daily_limit < 1 or p_daily_limit > 100 then
    raise exception 'Invalid usage limit' using errcode = '22023';
  end if;

  insert into public.ai_daily_usage (hotel_id, user_id, usage_day, request_count)
  values (p_hotel_id, v_user_id, current_date, 1)
  on conflict (hotel_id, user_id) do update
    set usage_day = case
          when public.ai_daily_usage.usage_day < current_date then current_date
          else public.ai_daily_usage.usage_day
        end,
        request_count = case
          when public.ai_daily_usage.usage_day < current_date then 1
          else public.ai_daily_usage.request_count + 1
        end
  returning request_count into v_count;

  if v_count > p_daily_limit then
    raise exception 'Daily assistant usage limit reached' using errcode = '54000';
  end if;
  return p_daily_limit - v_count;
end;
$$;

revoke all on function public.consume_ai_daily_request(uuid, integer) from public, anon;
grant execute on function public.consume_ai_daily_request(uuid, integer) to authenticated;

-- Stripe subscription state is written only by the signed webhook using service_role.
create table if not exists public.hotel_subscriptions (
  hotel_id uuid primary key references public.hotels (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_key text,
  status text not null default 'inactive' check (status in (
    'inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid',
    'incomplete', 'incomplete_expired', 'paused'
  )),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_stripe_event_created bigint,
  updated_at timestamptz not null default now()
);

alter table public.hotel_subscriptions add column if not exists plan_key text;
alter table public.hotel_subscriptions add column if not exists last_stripe_event_created bigint;

alter table public.hotel_subscriptions enable row level security;
drop policy if exists "Hotel managers can view subscription status" on public.hotel_subscriptions;
create policy "Hotel managers can view subscription status"
  on public.hotel_subscriptions for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));
revoke all on public.hotel_subscriptions from anon, authenticated;
grant select on public.hotel_subscriptions to authenticated;
grant all on public.hotel_subscriptions to service_role;

create or replace function public.sync_hotel_subscription(
  p_hotel_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_plan_key text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the billing webhook can synchronize subscriptions' using errcode = '42501';
  end if;
  insert into public.hotel_subscriptions (
    hotel_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
    plan_key, status, current_period_end, cancel_at_period_end,
    last_stripe_event_created, updated_at
  ) values (
    p_hotel_id, p_customer_id, p_subscription_id, p_price_id,
    p_plan_key, p_status, p_period_end, coalesce(p_cancel_at_period_end, false),
    p_event_created, now()
  )
  on conflict (hotel_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    plan_key = excluded.plan_key,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_stripe_event_created = excluded.last_stripe_event_created,
    updated_at = now()
  where public.hotel_subscriptions.last_stripe_event_created is null
     or excluded.last_stripe_event_created >= public.hotel_subscriptions.last_stripe_event_created;
  return found;
end;
$$;
revoke all on function public.sync_hotel_subscription(uuid, text, text, text, text, text, timestamptz, boolean, bigint) from public, anon, authenticated;
grant execute on function public.sync_hotel_subscription(uuid, text, text, text, text, text, timestamptz, boolean, bigint) to service_role;

create table if not exists public.hotel_portfolio_links (
  hotel_id uuid primary key references public.hotels (id) on delete cascade,
  billing_hotel_id uuid not null references public.hotels (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (hotel_id <> billing_hotel_id)
);
alter table public.hotel_portfolio_links enable row level security;
revoke all on public.hotel_portfolio_links from anon, authenticated;
grant all on public.hotel_portfolio_links to service_role;

create or replace function public.has_active_workspace_subscription(p_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.has_hotel_role(p_hotel_id, array['owner', 'admin', 'manager', 'staff']))
    and (
      exists (
        select 1 from public.hotel_subscriptions as subscription
        where subscription.hotel_id = p_hotel_id
          and subscription.status in ('active', 'trialing')
      )
      or exists (
        select 1
        from public.hotel_portfolio_links as portfolio
        join public.hotel_subscriptions as subscription
          on subscription.hotel_id = portfolio.billing_hotel_id
        where portfolio.hotel_id = p_hotel_id
          and subscription.plan_key = 'multi_property'
          and subscription.status in ('active', 'trialing')
      )
    );
$$;
revoke all on function public.has_active_workspace_subscription(uuid) from public, anon;
grant execute on function public.has_active_workspace_subscription(uuid) to authenticated;

create or replace function public.create_portfolio_hotel_workspace(
  p_name text,
  p_city text,
  p_country text,
  p_timezone text,
  p_currency text,
  p_billing_hotel_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hotel_id uuid;
begin
  if v_user_id is null or not private.has_hotel_role(
    p_billing_hotel_id, array['owner', 'admin']
  ) then
    raise exception 'Only a property owner or admin can add portfolio workspaces' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.hotel_subscriptions as subscription
    where subscription.hotel_id = p_billing_hotel_id
      and subscription.plan_key = 'multi_property'
      and subscription.status in ('active', 'trialing')
  ) then
    raise exception 'An active Multi-property plan is required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_city, ''))) not between 2 and 100
     or char_length(btrim(coalesce(p_country, ''))) not between 2 and 100
     or coalesce(p_currency, '') !~ '^[A-Z]{3}$'
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid property details' using errcode = '22023';
  end if;

  insert into public.hotels (name, city, country, timezone, currency, created_by)
  values (btrim(p_name), btrim(p_city), btrim(p_country), p_timezone, p_currency, v_user_id)
  returning id into v_hotel_id;
  insert into public.hotel_members (hotel_id, user_id, role)
  values (v_hotel_id, v_user_id, 'owner');
  insert into public.hotel_portfolio_links (hotel_id, billing_hotel_id, created_by)
  values (v_hotel_id, p_billing_hotel_id, v_user_id);
  return v_hotel_id;
end;
$$;
revoke all on function public.create_portfolio_hotel_workspace(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_portfolio_hotel_workspace(text, text, text, text, text, uuid) to authenticated;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
grant all on public.stripe_webhook_events to service_role;

-- Team access and invitation acceptance.
alter table public.hotel_members add column if not exists email text;
update public.hotel_members as membership
  set email = auth_user.email
  from auth.users as auth_user
  where auth_user.id = membership.user_id and membership.email is distinct from auth_user.email;

create or replace function private.set_hotel_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select auth_user.email into new.email
    from auth.users as auth_user
    where auth_user.id = new.user_id;
  return new;
end;
$$;
revoke all on function private.set_hotel_member_email() from public, anon, authenticated;
drop trigger if exists set_hotel_member_email on public.hotel_members;
create trigger set_hotel_member_email
  before insert or update of user_id on public.hotel_members
  for each row execute function private.set_hotel_member_email();

drop policy if exists "Hotel managers can view workspace memberships" on public.hotel_members;
create policy "Hotel managers can view workspace memberships"
  on public.hotel_members for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));

drop policy if exists "Hotel managers can remove team members" on public.hotel_members;
create policy "Hotel managers can remove team members"
  on public.hotel_members for delete to authenticated
  using (
    user_id <> (select auth.uid())
    and role <> 'owner'
    and (
      (select private.has_hotel_role(hotel_id, array['owner', 'admin']))
      or (role = 'staff' and (select private.has_hotel_role(hotel_id, array['manager'])))
    )
  );
grant select, delete on public.hotel_members to authenticated;

create table if not exists public.hotel_invitations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  email text not null check (char_length(email) between 5 and 254),
  role text not null check (role in ('admin', 'manager', 'staff')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);
create index if not exists hotel_invitations_hotel_status_idx
  on public.hotel_invitations (hotel_id, status, created_at desc);
create unique index if not exists hotel_invitations_pending_email_uidx
  on public.hotel_invitations (hotel_id, lower(email)) where status = 'pending';

alter table public.hotel_invitations enable row level security;
drop policy if exists "Hotel managers can view invitations" on public.hotel_invitations;
create policy "Hotel managers can view invitations"
  on public.hotel_invitations for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));
drop policy if exists "Hotel managers can create invitations" on public.hotel_invitations;
create policy "Hotel managers can create invitations"
  on public.hotel_invitations for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and role <> 'owner'
    and (role <> 'admin' or (select private.has_hotel_role(hotel_id, array['owner', 'admin'])))
    and (select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager']))
  );
drop policy if exists "Hotel managers can update invitations" on public.hotel_invitations;
create policy "Hotel managers can update invitations"
  on public.hotel_invitations for update to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])))
  with check ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager'])));
revoke all on public.hotel_invitations from anon, authenticated;
grant select, insert on public.hotel_invitations to authenticated;
grant update (status) on public.hotel_invitations to authenticated;

create or replace function public.claim_hotel_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_hotel_id uuid;
  v_role text;
  v_invite_email text;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Authentication and a verified email are required' using errcode = '42501';
  end if;
  select invitation.hotel_id, invitation.role, lower(invitation.email)
    into v_hotel_id, v_role, v_invite_email
    from public.hotel_invitations as invitation
    where invitation.id = p_invitation_id
      and invitation.status = 'pending'
      and invitation.expires_at > now()
    for update;
  if not found or v_invite_email <> v_email then
    raise exception 'Invitation is invalid or expired' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.hotel_members as member
      where member.hotel_id = v_hotel_id and member.user_id = v_user_id
  ) then
    insert into public.hotel_members (hotel_id, user_id, role)
    values (v_hotel_id, v_user_id, v_role);
  end if;
  update public.hotel_invitations
    set status = 'accepted', accepted_at = now()
    where id = p_invitation_id;
  return v_hotel_id;
end;
$$;
revoke all on function public.claim_hotel_invitation(uuid) from public, anon;
grant execute on function public.claim_hotel_invitation(uuid) to authenticated;
