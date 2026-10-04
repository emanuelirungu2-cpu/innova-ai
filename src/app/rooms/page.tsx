import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { DatabaseSetupNotice } from "@/app/components/database-setup-notice";
import { createRoom, updateHousekeepingStatus, updateRoomRate, updateRoomStatus } from "@/app/rooms/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const errors: Record<string, string> = {
  "invalid-room": "Check the room number, type, capacity, and rate.",
  "duplicate-room": "That room number is already in this hotel.",
  "database-not-ready": "Run the latest rooms and housekeeping migration in Supabase, then refresh this page.",
  "save-failed": "We couldn’t save that room. Try again.",
};

export const dynamic = "force-dynamic";

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel } = await getCurrentHotel();
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id, room_number, room_type, max_guests, nightly_rate, status, housekeeping_status")
    .eq("hotel_id", hotel.id)
    .order("room_number");

  if (error) return <DatabaseSetupNotice />;

  const formatRate = (amount: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: hotel.currency,
      maximumFractionDigits: 0,
    }).format(Number(amount));

  return (
    <main className="module-shell">
      <header className="module-header">
        <Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="module-property">{hotel.name} <small>{hotel.city}</small></span>
        <nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link className="selected" href="/rooms">Rooms</Link><Link href="/reservations">Reservations</Link><Link href="/menu">Menu</Link><Link href="/pos">POS</Link></nav>
        <form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
      </header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">PROPERTY OPERATIONS</p><h1>Rooms</h1><p className="module-subtitle">Manage your room inventory and nightly rates.</p></div><span className="module-count">{rooms.length} {rooms.length === 1 ? "room" : "rooms"}</span></div>
        {params.error && errors[params.error] && <p className="form-message error-message" role="alert">{errors[params.error]}</p>}
        {params.message && <p className="form-message success-message" role="status">{params.message === "room-created" ? "Room added to your inventory." : params.message === "housekeeping-updated" ? "Housekeeping status updated." : params.message === "rate-updated" ? "Nightly rate updated." : "Room status updated."}</p>}

        <div className="module-grid">
          <section className="module-card">
            <div className="module-card-heading"><h2>Add a room</h2><p>Set up a room before taking reservations for it.</p></div>
            <form className="module-form" action={createRoom}>
              <label htmlFor="roomNumber">Room number or name</label><input id="roomNumber" name="roomNumber" type="text" placeholder="e.g. 204" maxLength={30} required />
              <label htmlFor="roomType">Room type</label><select id="roomType" name="roomType" defaultValue="Standard"><option>Standard</option><option>Deluxe</option><option>Suite</option><option>Family</option><option>Accessible</option></select>
              <div className="module-form-row"><div><label htmlFor="maxGuests">Guest capacity</label><input id="maxGuests" name="maxGuests" type="number" min="1" max="20" defaultValue="2" required /></div><div><label htmlFor="nightlyRate">Rate per night ({hotel.currency})</label><input id="nightlyRate" name="nightlyRate" type="number" min="0" step="0.01" defaultValue="0" required /></div></div>
              <button className="primary-button module-submit" type="submit">＋ Add room</button>
            </form>
          </section>

          <section className="module-card inventory-card">
            <div className="module-card-heading"><h2>Room inventory</h2><p>Track availability and housekeeping. Checked-out rooms are marked as needing cleaning.</p></div>
            {rooms.length === 0 ? <div className="empty-state"><span className="empty-icon">▦</span><strong>No rooms added yet</strong><p>Add your first room to start building the inventory.</p></div> : <div className="room-list">{rooms.map((room) => <article className="room-row" key={room.id}><span className="room-icon">⌂</span><div className="room-main"><strong>Room {room.room_number}</strong><small>{room.room_type} · Up to {room.max_guests} guests · {formatRate(room.nightly_rate)} / night</small><small className={`housekeeping-label housekeeping-${room.housekeeping_status}`}>{room.housekeeping_status === "clean" ? "Clean" : room.housekeeping_status === "dirty" ? "Needs cleaning" : "Being cleaned"}</small></div><div className="room-actions"><form className="room-price-form" action={updateRoomRate}><input type="hidden" name="roomId" value={room.id} /><label className="visually-hidden" htmlFor={`nightly-rate-${room.id}`}>Nightly rate for room {room.room_number}</label><input id={`nightly-rate-${room.id}`} name="nightlyRate" type="number" min="0" step="0.01" defaultValue={room.nightly_rate} /><button className="text-action" type="submit">Save rate</button></form><form action={updateHousekeepingStatus}><input type="hidden" name="roomId" value={room.id} /><select aria-label={`Housekeeping status for room ${room.room_number}`} name="housekeepingStatus" defaultValue={room.housekeeping_status}><option value="clean">Clean</option><option value="dirty">Needs cleaning</option><option value="cleaning">Being cleaned</option></select><button className="text-action" type="submit">Update</button></form><span className={`room-status ${room.status === "active" ? "is-active" : "is-offline"}`}>{room.status === "active" ? "Active" : "Out of service"}</span><form action={updateRoomStatus}><input type="hidden" name="roomId" value={room.id} /><input type="hidden" name="status" value={room.status === "active" ? "out_of_service" : "active"} /><button className="text-action" type="submit">{room.status === "active" ? "Take offline" : "Restore"}</button></form></div></article>)}</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
