import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { DatabaseSetupNotice } from "@/app/components/database-setup-notice";
import { cancelReservation, checkInReservation, checkOutReservation, createReservation, recordReservationTransaction } from "@/app/reservations/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const errors: Record<string, string> = {
  "invalid-details": "Check the guest details, dates, and total amount.",
  "invalid-room": "Choose an active room from this hotel.",
  "over-capacity": "The guest count is higher than this room’s capacity. Choose a larger room or reduce the guest count.",
  "dates-unavailable": "That room already has a reservation overlapping those dates. Choose another room or dates.",
  "database-not-ready": "Run the rooms and reservations migration in Supabase, then refresh this page.",
  "check-in-unavailable": "Check-in is available from the guest’s check-in date until their check-out date.",
  "check-out-unavailable": "Check-out is available on or after the guest’s check-out date, once they have checked in.",
  "save-failed": "We couldn’t save that reservation. Try again.",
  "invalid-payment": "Check the payment amount, type, and reference.",
  "payment-database-not-ready": "Run the reservation payments migration in Supabase, then refresh this page.",
  "payment-balance": "That amount exceeds the balance due or the refundable amount.",
  "refund-access-denied": "Only an owner, admin, or manager can record a refund.",
  "refund-before-cancel": "Refund recorded payments before cancelling this reservation.",
  "daily-rate-database-not-ready": "Run the daily room rates migration in Supabase, then refresh and try again.",
};

function localDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export const dynamic = "force-dynamic";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; room?: string; checkIn?: string; guest?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel, userRole } = await getCurrentHotel();
  const today = localDate(hotel.timezone);
  const requestedCheckIn = params.checkIn && validDate(params.checkIn) && params.checkIn >= today
    ? params.checkIn
    : today;
  const requestedGuest = (params.guest ?? "").slice(0, 120);
  const [{ data: rooms, error: roomsError }, { data: reservations, error: reservationsError }] = await Promise.all([
    supabase.from("rooms").select("id, room_number, room_type, nightly_rate, status").eq("hotel_id", hotel.id).order("room_number"),
    supabase.from("reservations").select("id, room_id, guest_name, guest_email, guest_phone, check_in, check_out, adults, children, total_amount, status").eq("hotel_id", hotel.id).gte("check_out", today).order("check_in").limit(100),
  ]);

  if (roomsError || reservationsError) return <DatabaseSetupNotice />;

  const reservationIds = reservations.map((reservation) => reservation.id);
  const { data: paymentRows, error: paymentsError } = reservationIds.length
    ? await supabase.from("reservation_payments").select("reservation_id, kind, amount, payment_method, reference, created_at").eq("hotel_id", hotel.id).in("reservation_id", reservationIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (paymentsError) return <main className="module-shell"><section className="module-content"><div className="module-card"><h1>Reservation payments need one setup step</h1><p>In Supabase, open SQL Editor, paste the contents of <strong>supabase/migrations/20261004190000_add_reservation_payments.sql</strong>, and click Run. Then refresh this page.</p></div></section></main>;

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const activeRooms = rooms.filter((room) => room.status === "active");
  const paymentsByReservation = new Map<string, Array<NonNullable<typeof paymentRows>[number]>>();
  for (const payment of paymentRows ?? []) {
    const rows = paymentsByReservation.get(payment.reservation_id) ?? [];
    rows.push(payment);
    paymentsByReservation.set(payment.reservation_id, rows);
  }
  const upcoming = reservations.filter((reservation) => !["cancelled", "no_show"].includes(reservation.status));
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en", { style: "currency", currency: hotel.currency, maximumFractionDigits: 0 }).format(Number(amount));

  return (
    <main className="module-shell">
      <header className="module-header">
        <Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="module-property">{hotel.name} <small>{hotel.city}</small></span>
        <nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/calendar">Calendar</Link><Link href="/rooms">Rooms</Link><Link className="selected" href="/reservations">Reservations</Link><Link href="/menu">Menu</Link><Link href="/pos">POS</Link></nav>
        <form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
      </header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">PROPERTY OPERATIONS</p><h1>Reservations</h1><p className="module-subtitle">Create bookings and keep room dates conflict-free.</p></div><span className="module-count">{upcoming.length} upcoming</span></div>
        {params.error && errors[params.error] && <p className="form-message error-message" role="alert">{errors[params.error]}</p>}
        {params.message && <p className="form-message success-message" role="status">{{ "reservation-created": "Reservation saved.", "reservation-cancelled": "Reservation cancelled.", "guest-checked-in": "Guest checked in.", "guest-checked-out": "Guest checked out.", "payment-recorded": "Payment recorded.", "refund-recorded": "Refund recorded." }[params.message] ?? "Reservation updated."}</p>}
        <div className="module-grid reservation-grid">
          <section className="module-card">
            <div className="module-card-heading"><h2>New reservation</h2><p>Assign an active room and enter the guest&apos;s stay details.</p></div>
            {activeRooms.length === 0 ? <div className="empty-state"><span className="empty-icon">⌂</span><strong>Add rooms first</strong><p>Your inventory is empty. Add at least one active room to accept reservations.</p><Link className="text-action" href="/rooms">Set up rooms →</Link></div> : <form className="module-form" action={createReservation}>
              <label htmlFor="guestName">Guest name</label><input id="guestName" name="guestName" type="text" placeholder="Guest full name" defaultValue={requestedGuest} minLength={2} maxLength={120} required />
              <div className="module-form-row"><div><label htmlFor="guestEmail">Email (optional)</label><input id="guestEmail" name="guestEmail" type="email" placeholder="guest@example.com" maxLength={254} /></div><div><label htmlFor="guestPhone">Phone (optional)</label><input id="guestPhone" name="guestPhone" type="tel" placeholder="+254 700 000 000" maxLength={30} /></div></div>
              <label htmlFor="roomId">Room</label><select id="roomId" name="roomId" defaultValue={activeRooms.some((room) => room.id === params.room) ? params.room : activeRooms[0].id} required>{activeRooms.map((room) => <option value={room.id} key={room.id}>Room {room.room_number} · {room.room_type} · {formatAmount(room.nightly_rate)}/night</option>)}</select>
              <div className="module-form-row"><div><label htmlFor="checkIn">Check-in</label><input id="checkIn" name="checkIn" type="date" defaultValue={requestedCheckIn} required /></div><div><label htmlFor="checkOut">Check-out</label><input id="checkOut" name="checkOut" type="date" required /></div></div>
              <div className="module-form-row"><div><label htmlFor="adults">Adults</label><input id="adults" name="adults" type="number" min="1" max="20" defaultValue="1" required /></div><div><label htmlFor="children">Children</label><input id="children" name="children" type="number" min="0" max="20" defaultValue="0" required /></div></div>
              <label htmlFor="totalAmount">Total stay amount ({hotel.currency}, optional)</label><input id="totalAmount" name="totalAmount" type="number" min="0" step="0.01" placeholder="Auto-calculated from rate × nights" /><small className="field-hint">Leave blank to use the selected room’s nightly rate. Enter an amount to override it.</small>
              <button className="primary-button module-submit" type="submit">＋ Save reservation</button>
            </form>}
          </section>

          <section className="module-card booking-card">
            <div className="module-card-heading"><h2>Upcoming stays</h2><p>Confirmed bookings from today onward.</p></div>
            {upcoming.length === 0 ? <div className="empty-state"><span className="empty-icon">▣</span><strong>No upcoming reservations</strong><p>New bookings will appear here after you save them.</p></div> : <div className="booking-list">{upcoming.map((reservation) => {
              const room = roomById.get(reservation.room_id);
              const transactions = paymentsByReservation.get(reservation.id) ?? [];
              const netPaid = transactions.reduce((sum, item) => sum + (item.kind === "refund" ? -Number(item.amount) : Number(item.amount)), 0);
              const balance = Math.max(0, Number(reservation.total_amount) - netPaid);
              const canRefund = ["owner", "admin", "manager"].includes(userRole);
              return <article className="booking-row" key={reservation.id}><div className="booking-row-top"><span className="guest-avatar blue">{reservation.guest_name.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase()}</span><div className="guest-name"><strong>{reservation.guest_name}</strong><small>{room ? `Room ${room.room_number} · ${room.room_type}` : "Room unavailable"}</small></div><span className={`reservation-status status-${reservation.status}`}>{reservation.status.replaceAll("_", " ")}</span></div><div className="booking-details"><span>{displayDate(reservation.check_in)} → {displayDate(reservation.check_out)}</span><strong>{formatAmount(reservation.total_amount)}</strong></div>{reservation.guest_email && <p className="booking-contact">{reservation.guest_email}</p>}<div className="reservation-payment-summary"><span>Paid <strong>{formatAmount(netPaid)}</strong></span><span>Balance <strong>{formatAmount(balance)}</strong></span></div>{transactions.length > 0 && <details className="reservation-payment-history"><summary>Payment history ({transactions.length})</summary>{transactions.map((item, index) => <p key={`${item.created_at}-${index}`}>{item.kind === "refund" ? "Refund" : "Payment"}: {formatAmount(item.amount)} · {item.payment_method.replaceAll("_", " ")}{item.reference ? ` · ${item.reference}` : ""}</p>)}</details>}{["confirmed", "checked_in"].includes(reservation.status) && balance > 0 && <form className="reservation-payment-form" action={recordReservationTransaction}><strong>Record payment</strong><input type="hidden" name="reservationId" value={reservation.id} /><input type="hidden" name="kind" value="payment" /><div className="reservation-payment-fields"><label>Amount<input name="amount" type="number" min="0.01" max={balance.toFixed(2)} step="0.01" defaultValue={balance.toFixed(2)} required /></label><label>Method<select name="paymentMethod" defaultValue="cash"><option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option></select></label><label>Reference (optional)<input name="reference" maxLength={120} placeholder="Receipt or transaction ID" /></label></div><button className="text-action" type="submit">＋ Save payment</button></form>}{canRefund && netPaid > 0 && <form className="reservation-payment-form refund-form" action={recordReservationTransaction}><strong>Record refund</strong><input type="hidden" name="reservationId" value={reservation.id} /><input type="hidden" name="kind" value="refund" /><div className="reservation-payment-fields"><label>Amount<input name="amount" type="number" min="0.01" max={netPaid.toFixed(2)} step="0.01" defaultValue={netPaid.toFixed(2)} required /></label><label>Method<select name="paymentMethod" defaultValue="cash"><option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option></select></label><label>Reference (optional)<input name="reference" maxLength={120} placeholder="Refund receipt or transaction ID" /></label></div><button className="text-action cancel-action" type="submit">Record refund</button></form>}<div className="booking-actions">{reservation.status === "confirmed" && <form action={checkInReservation}><input type="hidden" name="reservationId" value={reservation.id} /><button className="text-action" type="submit">Check in</button></form>}{reservation.status === "checked_in" && <form action={checkOutReservation}><input type="hidden" name="reservationId" value={reservation.id} /><button className="text-action" type="submit">Check out</button></form>}{["confirmed", "checked_in"].includes(reservation.status) && <form action={cancelReservation}><input type="hidden" name="reservationId" value={reservation.id} /><button className="text-action cancel-action" type="submit">Cancel reservation</button></form>}</div></article>;
            })}</div>}
          </section>
        </div>
      </section>
    </main>
  );
}

