import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { DatabaseSetupNotice } from "@/app/components/database-setup-notice";
import { saveRoomRate } from "@/app/calendar/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const rateErrors: Record<string, string> = {
  "invalid-rate": "Enter a valid room and nightly rate.",
  "invalid-rate-room": "Choose an active room in this property.",
  "past-rate": "You can only change rates for today or a future night.",
  "rate-access-denied": "Only an owner, admin, or manager can change room rates.",
  "rate-database-not-ready": "Run the daily room rates migration in Supabase, then refresh this page.",
  "rate-save-failed": "We couldn’t save that room rate. Try again.",
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftDate(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function dateInZone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel, userRole } = await getCurrentHotel();
  const today = dateInZone(hotel.timezone);
  const start = params.week && validDate(params.week) ? params.week : today;
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
  const endExclusive = shiftDate(start, 7);
  const [{ data: rooms, error: roomsError }, { data: stays, error: staysError }, { data: rateOverrides, error: ratesError }] = await Promise.all([
    supabase.from("rooms")
      .select("id, room_number, room_type, status, housekeeping_status, nightly_rate")
      .eq("hotel_id", hotel.id)
      .order("room_number")
      .limit(500),
    supabase.from("reservations")
      .select("id, room_id, guest_name, check_in, check_out, status")
      .eq("hotel_id", hotel.id)
      .not("status", "in", "(cancelled,no_show)")
      .lt("check_in", endExclusive)
      .gt("check_out", start)
      .order("check_in")
      .limit(1000),
    supabase.from("room_rate_overrides")
      .select("room_id, stay_date, nightly_rate")
      .eq("hotel_id", hotel.id)
      .gte("stay_date", start)
      .lt("stay_date", endExclusive),
  ]);

  if (roomsError || staysError) return <DatabaseSetupNotice />;
  if (ratesError) return <main className="module-shell"><section className="module-content"><div className="module-card"><h1>Daily room rates need one setup step</h1><p>In Supabase SQL Editor, run the contents of <strong>supabase/migrations/20261004200000_add_daily_room_rates.sql</strong>, then refresh this page.</p><Link className="text-action" href="/dashboard">Return to overview →</Link></div></section></main>;

  const rateByRoomDate = new Map((rateOverrides ?? []).map((item) => [`${item.room_id}:${item.stay_date}`, Number(item.nightly_rate)]));

  const staysByRoom = new Map<string, typeof stays>();
  for (const stay of stays) {
    const roomStays = staysByRoom.get(stay.room_id) ?? [];
    roomStays.push(stay);
    staysByRoom.set(stay.room_id, roomStays);
  }
  const bookedNights = rooms.reduce((sum, room) => sum + days.filter((date) =>
    (staysByRoom.get(room.id) ?? []).some((stay) => stay.check_in <= date && stay.check_out > date),
  ).length, 0);
  const arrivals = stays.filter((stay) => stay.check_in >= start && stay.check_in < endExclusive).length;
  const formatAmount = (amount: number) => new Intl.NumberFormat("en", {
    style: "currency", currency: hotel.currency, maximumFractionDigits: 2,
  }).format(amount);
  const formatDay = (date: string) => new Intl.DateTimeFormat("en", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <main className="module-shell">
      <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link className="selected" href="/calendar">Calendar</Link><Link href="/rooms">Rooms</Link><Link href="/reservations">Reservations</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">PROPERTY OPERATIONS</p><h1>Room calendar</h1><p className="module-subtitle">See room bookings and arrivals across seven days.</p></div><Link className="primary-button" href="/reservations">＋ New reservation</Link></div>
        {params.error && rateErrors[params.error] && <p className="form-message error-message" role="alert">{rateErrors[params.error]}</p>}
        {params.message === "rate-saved" && <p className="form-message success-message" role="status">Nightly rate saved. Existing bookings keep their saved total.</p>}
        <section className="module-card calendar-controls"><div className="calendar-period"><Link className="calendar-arrow" href={`/calendar?week=${shiftDate(start, -7)}`} aria-label="Previous seven days">←</Link><strong>{formatDay(start)} – {formatDay(days[6])}</strong><Link className="calendar-arrow" href={`/calendar?week=${shiftDate(start, 7)}`} aria-label="Next seven days">→</Link></div><form className="calendar-jump" method="get" action="/calendar"><label htmlFor="calendarWeek">Start date</label><input id="calendarWeek" type="date" name="week" defaultValue={start} required /><button className="text-action" type="submit">Go</button></form></section>
        <section className="finance-summary-grid calendar-summary"><article className="stat-card"><div className="stat-top"><span>Rooms</span><span className="stat-icon">⌂</span></div><div className="stat-value report-stat-value">{rooms.length}</div><div className="stat-foot">In this property</div></article><article className="stat-card"><div className="stat-top"><span>Booked room nights</span><span className="stat-icon">▦</span></div><div className="stat-value report-stat-value">{bookedNights}</div><div className="stat-foot">Across the 7-day view</div></article><article className="stat-card"><div className="stat-top"><span>Arrivals</span><span className="stat-icon">↘</span></div><div className="stat-value report-stat-value">{arrivals}</div><div className="stat-foot">Check-ins during this period</div></article></section>
        <section className="module-card calendar-card"><div className="module-card-heading"><h2>Room availability</h2><p>Each filled cell shows a guest staying in that room overnight.</p></div>
          {!rooms.length ? <div className="empty-state"><span className="empty-icon">⌂</span><strong>No rooms set up yet</strong><p>Add rooms to your inventory before viewing the calendar.</p><Link className="text-action" href="/rooms">Set up rooms →</Link></div> : <div className="calendar-scroll"><table className="availability-table"><thead><tr><th className="calendar-room-heading">Room</th>{days.map((date) => <th className={date === today ? "today-column" : ""} key={date}><span>{formatDay(date)}</span>{date === today && <small>Today</small>}</th>)}</tr></thead><tbody>{rooms.map((room) => <tr key={room.id}><th className="calendar-room-cell"><strong>{room.room_number}</strong><small>{room.room_type} · {room.status === "active" ? room.housekeeping_status.replaceAll("_", " ") : "Out of service"}</small></th>{days.map((date) => {
            const stay = (staysByRoom.get(room.id) ?? []).find((reservation) => reservation.check_in <= date && reservation.check_out > date);
            const isToday = date === today;
            const rateKey = `${room.id}:${date}`;
            const hasOverride = rateByRoomDate.has(rateKey);
            const rate = hasOverride ? rateByRoomDate.get(rateKey)! : Number(room.nightly_rate);
            return <td className={isToday ? "today-column" : ""} key={date}>{stay ? <div className={`calendar-stay ${stay.status === "checked_in" ? "is-in-house" : ""}`}><strong>{stay.guest_name}</strong><small>{stay.check_in === date ? "Arrives" : stay.status === "checked_in" ? "In house" : "Reserved"}</small></div> : room.status === "out_of_service" ? <span className="calendar-empty out-of-service-cell">Offline</span> : date >= today ? <div className="calendar-rate-cell"><span className="calendar-rate-label">{formatAmount(rate)}{hasOverride ? " · date rate" : " · standard"}</span>{["owner", "admin", "manager"].includes(userRole) && <details className="calendar-rate-editor"><summary>{hasOverride ? "Change rate" : "Set rate"}</summary><form action={saveRoomRate}><input type="hidden" name="roomId" value={room.id} /><input type="hidden" name="stayDate" value={date} /><label className="visually-hidden" htmlFor={`rate-${room.id}-${date}`}>Nightly rate</label><input id={`rate-${room.id}-${date}`} name="nightlyRate" type="number" min="0" step="0.01" defaultValue={rate.toFixed(2)} required /><button type="submit">Save</button></form></details>}<Link className="calendar-book-link" href={`/reservations?room=${room.id}&checkIn=${date}`}>＋ Book</Link></div> : <span className="calendar-empty">Available</span>}</td>;
          })}</tr>)}</tbody></table></div>}
        </section>
        <p className="report-footnote">Check-out dates are the day the room becomes available again. Cancelled and no-show reservations are excluded.</p>
      </section>
    </main>
  );
}
