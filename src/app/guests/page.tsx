import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

type GuestSummary = {
  key: string;
  profileReservationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  bookings: number;
  lastStay: string | null;
  nextStay: string | null;
};

function dateInZone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export const dynamic = "force-dynamic";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 80);
  const { supabase, hotel } = await getCurrentHotel();
  let query = supabase.from("reservations")
    .select("id, guest_name, guest_email, guest_phone, check_in, check_out, status, created_at")
    .eq("hotel_id", hotel.id)
    .not("status", "in", "(cancelled,no_show)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (search) query = query.ilike("guest_name", `%${search}%`);
  const { data: reservations, error } = await query;

  if (error) {
    return <main className="setup-shell"><section className="setup-card"><h1>Guest records are unavailable</h1><p className="setup-intro">Refresh the page. If this continues, confirm the rooms and reservations database setup is complete.</p><Link className="text-action" href="/dashboard">Return to overview →</Link></section></main>;
  }

  const today = dateInZone(hotel.timezone);
  const guests = new Map<string, GuestSummary>();
  for (const reservation of reservations) {
    const emailKey = reservation.guest_email?.trim().toLocaleLowerCase();
    const phoneKey = reservation.guest_phone?.replace(/\D/g, "");
    const key = emailKey ? `email:${emailKey}` : phoneKey ? `phone:${phoneKey}` : `reservation:${reservation.id}`;
    const guest = guests.get(key);
    if (guest) {
      guest.bookings += 1;
      if (reservation.status === "checked_out" && (!guest.lastStay || reservation.check_in > guest.lastStay)) {
        guest.lastStay = reservation.check_in;
      }
      if (reservation.status === "confirmed" && reservation.check_in >= today && (!guest.nextStay || reservation.check_in < guest.nextStay)) {
        guest.nextStay = reservation.check_in;
      }
    } else {
      guests.set(key, {
        key,
        profileReservationId: reservation.id,
        name: reservation.guest_name,
        email: reservation.guest_email,
        phone: reservation.guest_phone,
        bookings: 1,
        lastStay: reservation.status === "checked_out" ? reservation.check_in : null,
        nextStay: reservation.status === "confirmed" && reservation.check_in >= today ? reservation.check_in : null,
      });
    }
  }

  const guestList = [...guests.values()].sort((a, b) => {
    if (a.nextStay && b.nextStay) return a.nextStay.localeCompare(b.nextStay);
    if (a.nextStay) return -1;
    if (b.nextStay) return 1;
    return (b.lastStay ?? "").localeCompare(a.lastStay ?? "");
  });
  const repeatGuests = guestList.filter((guest) => guest.bookings > 1).length;
  const withUpcomingStay = guestList.filter((guest) => guest.nextStay).length;

  return (
    <main className="module-shell">
      <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/rooms">Rooms</Link><Link href="/reservations">Reservations</Link><Link className="selected" href="/guests">Guests</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">GUEST RELATIONSHIPS</p><h1>Guests</h1><p className="module-subtitle">Find returning guests and see their upcoming hotel stays.</p></div><Link className="primary-button" href="/reservations">＋ New reservation</Link></div>
        <section className="module-card guest-search-card"><form className="guest-search-form" method="get" action="/guests"><label htmlFor="guestSearch">Search guest names</label><div><input id="guestSearch" name="q" type="search" maxLength={80} defaultValue={search} placeholder="Enter a guest name" /><button className="primary-button" type="submit">Search</button>{search && <Link className="text-action" href="/guests">Clear</Link>}</div></form><p className="report-hint">Showing guests from the most recent reservation records for {hotel.name}.</p></section>
        <section className="finance-summary-grid guest-summary-grid"><article className="stat-card"><div className="stat-top"><span>Guest records</span><span className="stat-icon">♙</span></div><div className="stat-value report-stat-value">{guestList.length}</div><div className="stat-foot">With reservations at this property</div></article><article className="stat-card"><div className="stat-top"><span>Returning guests</span><span className="stat-icon">↻</span></div><div className="stat-value report-stat-value">{repeatGuests}</div><div className="stat-foot">More than one reservation</div></article><article className="stat-card"><div className="stat-top"><span>Upcoming stays</span><span className="stat-icon">▣</span></div><div className="stat-value report-stat-value">{withUpcomingStay}</div><div className="stat-foot">Guests with a confirmed future stay</div></article></section>
        <section className="module-card guest-directory-card"><div className="module-card-heading"><h2>{search ? `Search results for “${search}”` : "Guest directory"}</h2><p>{guestList.length} {guestList.length === 1 ? "guest" : "guests"}</p></div>
        {!guestList.length ? <div className="empty-state"><span className="empty-icon">♙</span><strong>{search ? "No matching guests" : "No guest reservations yet"}</strong><p>{search ? "Try another name or clear your search." : "Guests will appear here after you create reservations."}</p></div> : <div className="guest-list">{guestList.map((guest) => <article className="guest-directory-row" key={guest.key}><span className="guest-avatar blue">{guest.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div className="guest-directory-main"><strong>{guest.name}</strong><div className="guest-contact-links">{guest.email && <a href={`mailto:${guest.email}`}>{guest.email}</a>}{guest.phone && <a href={`tel:${guest.phone}`}>{guest.phone}</a>}{!guest.email && !guest.phone && <small>No contact details saved</small>}</div></div><div className="guest-booking-count"><strong>{guest.bookings}</strong><small>{guest.bookings === 1 ? "reservation" : "reservations"}</small></div><div className="guest-stay-dates"><strong>{guest.nextStay ? `Next stay ${displayDate(guest.nextStay)}` : "No upcoming stay"}</strong><small>{guest.lastStay ? `Last completed stay ${displayDate(guest.lastStay)}` : "No completed stay yet"}</small></div><Link className="guest-profile-link" href={`/guests/${guest.profileReservationId}`}>View history →</Link></article>)}</div>}
        </section>
        <p className="report-footnote">Guest contact information is visible to signed-in members of this hotel workspace.</p>
      </section>
    </main>
  );
}
