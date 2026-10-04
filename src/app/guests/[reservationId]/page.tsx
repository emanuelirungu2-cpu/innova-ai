import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export const dynamic = "force-dynamic";

export default async function GuestProfilePage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  const { supabase, hotel } = await getCurrentHotel();
  const { data: anchor, error: anchorError } = await supabase
    .from("reservations")
    .select("id, guest_name, guest_email, guest_phone")
    .eq("hotel_id", hotel.id)
    .eq("id", reservationId)
    .maybeSingle();

  if (anchorError || !anchor) {
    return <main className="module-shell"><section className="module-content"><div className="module-card"><h1>Guest profile unavailable</h1><p>This guest record may have been removed or is no longer available.</p><Link className="text-action" href="/guests">Return to guests →</Link></div></section></main>;
  }

  let historyQuery = supabase.from("reservations")
    .select("id, room_id, check_in, check_out, total_amount, status, created_at")
    .eq("hotel_id", hotel.id);
  if (anchor.guest_email) historyQuery = historyQuery.eq("guest_email", anchor.guest_email);
  else if (anchor.guest_phone) historyQuery = historyQuery.eq("guest_phone", anchor.guest_phone);
  else historyQuery = historyQuery.eq("id", anchor.id);
  const [{ data: history, error: historyError }, { data: rooms }] = await Promise.all([
    historyQuery.order("check_in", { ascending: false }).limit(500),
    supabase.from("rooms").select("id, room_number, room_type").eq("hotel_id", hotel.id),
  ]);
  const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));
  const stays = history ?? [];
  const spent = stays.filter((stay) => stay.status === "checked_out")
    .reduce((sum, stay) => sum + Number(stay.total_amount), 0);
  const formatAmount = (amount: number) => new Intl.NumberFormat("en", {
    style: "currency", currency: hotel.currency, maximumFractionDigits: 2,
  }).format(amount);

  return (
    <main className="module-shell">
      <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/rooms">Rooms</Link><Link href="/reservations">Reservations</Link><Link className="selected" href="/guests">Guests</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
      <section className="module-content">
        <Link className="text-action guest-back-link" href="/guests">← Guest directory</Link>
        <div className="module-title-row"><div><p className="eyebrow">GUEST PROFILE</p><h1>{anchor.guest_name}</h1><p className="module-subtitle">{anchor.guest_email || "No email saved"}{anchor.guest_phone ? ` · ${anchor.guest_phone}` : ""}</p></div><Link className="primary-button" href={`/reservations?guest=${encodeURIComponent(anchor.guest_name)}`}>＋ New reservation</Link></div>
        <div className="finance-summary-grid guest-profile-summary"><article className="stat-card"><div className="stat-top"><span>Total stays</span><span className="stat-icon">▣</span></div><div className="stat-value report-stat-value">{stays.length}</div><div className="stat-foot">Bookings on record</div></article><article className="stat-card"><div className="stat-top"><span>Completed stay value</span><span className="stat-icon">＋</span></div><div className="stat-value report-stat-value">{formatAmount(spent)}</div><div className="stat-foot">Based on checked-out reservations</div></article></div>
        <section className="module-card guest-history-card"><div className="module-card-heading"><h2>Reservation history</h2><p>Most recent stays for this guest at {hotel.name}.</p></div>{historyError ? <p className="form-message error-message" role="alert">Couldn’t load this guest’s reservation history. Refresh the page to try again.</p> : !stays.length ? <div className="empty-state"><strong>No stays found</strong></div> : <div className="guest-history-list">{stays.map((stay) => { const room = roomById.get(stay.room_id); return <article className="guest-history-row" key={stay.id}><div><strong>{displayDate(stay.check_in)} → {displayDate(stay.check_out)}</strong><small>{room ? `Room ${room.room_number} · ${room.room_type}` : "Room details unavailable"}</small></div><span className={`reservation-status status-${stay.status}`}>{stay.status.replaceAll("_", " ")}</span><strong className="guest-history-amount">{formatAmount(Number(stay.total_amount))}</strong></article>; })}</div>}</section>
        <p className="report-footnote">Completed stay value uses reservation totals. It does not subtract refunds or unpaid balances.</p>
      </section>
    </main>
  );
}
