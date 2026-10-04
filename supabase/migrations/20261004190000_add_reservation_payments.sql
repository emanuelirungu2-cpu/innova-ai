-- Track payments and refunds against room reservations with server-side balance checks.

-- Older installations may have created reservations before this composite key was present.
-- The global primary key already guarantees these pairs are unique; this index lets the
-- payment table enforce that its reservation and hotel belong together.
create unique index if not exists reservations_hotel_id_id_uidx
  on public.reservations (hotel_id, id);

create table if not exists public.reservation_payments (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null,
  reservation_id uuid not null,
  kind text not null check (kind in ('payment', 'refund')),
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'mobile_money', 'bank_transfer')),
  reference text check (reference is null or char_length(reference) <= 120),
  recorded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (hotel_id, reservation_id)
    references public.reservations (hotel_id, id) on delete restrict
);

create index if not exists reservation_payments_hotel_booking_idx
  on public.reservation_payments (hotel_id, reservation_id, created_at desc);

alter table public.reservation_payments enable row level security;

drop policy if exists "Hotel members can view reservation payments" on public.reservation_payments;
create policy "Hotel members can view reservation payments"
  on public.reservation_payments for select to authenticated
  using ((select private.has_hotel_role(hotel_id, array['owner', 'admin', 'manager', 'staff'])));

revoke all on public.reservation_payments from anon, authenticated;
grant select on public.reservation_payments to authenticated;

create or replace function public.record_reservation_transaction(
  p_hotel_id uuid,
  p_reservation_id uuid,
  p_kind text,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_total numeric(12, 2);
  v_status text;
  v_net_paid numeric(12, 2);
begin
  if v_user_id is null or not private.has_hotel_role(
    p_hotel_id,
    array['owner', 'admin', 'manager', 'staff']
  ) then
    raise exception 'Not allowed to record a reservation transaction' using errcode = '42501';
  end if;

  if p_kind not in ('payment', 'refund')
     or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
     or p_payment_method not in ('cash', 'card', 'mobile_money', 'bank_transfer')
     or char_length(coalesce(p_reference, '')) > 120 then
    raise exception 'Invalid reservation transaction details' using errcode = '22023';
  end if;

  if p_kind = 'refund' and not private.has_hotel_role(
    p_hotel_id,
    array['owner', 'admin', 'manager']
  ) then
    raise exception 'Only a hotel manager can record refunds' using errcode = '42501';
  end if;

  select reservation.total_amount, reservation.status
    into v_total, v_status
    from public.reservations as reservation
    where reservation.id = p_reservation_id
      and reservation.hotel_id = p_hotel_id
    for update;

  if not found then
    raise exception 'Reservation not found' using errcode = '22023';
  end if;

  select coalesce(sum(
    case when transaction.kind = 'refund' then -transaction.amount else transaction.amount end
  ), 0)
    into v_net_paid
    from public.reservation_payments as transaction
    where transaction.hotel_id = p_hotel_id
      and transaction.reservation_id = p_reservation_id;

  if p_kind = 'payment' then
    if v_status in ('cancelled', 'no_show') or v_net_paid + p_amount > v_total then
      raise exception 'Payment exceeds the reservation balance or the booking is closed' using errcode = '22023';
    end if;
  elsif p_amount > v_net_paid then
    raise exception 'Refund exceeds the amount received' using errcode = '22023';
  end if;

  insert into public.reservation_payments (
    hotel_id, reservation_id, kind, amount, payment_method, reference, recorded_by
  ) values (
    p_hotel_id, p_reservation_id, p_kind, p_amount, p_payment_method,
    nullif(btrim(p_reference), ''), v_user_id
  );

  if p_kind = 'payment' then
    v_net_paid := v_net_paid + p_amount;
  else
    v_net_paid := v_net_paid - p_amount;
  end if;
  return greatest(0, v_total - v_net_paid);
end;
$$;

revoke all on function public.record_reservation_transaction(uuid, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.record_reservation_transaction(uuid, uuid, text, numeric, text, text) to authenticated;
