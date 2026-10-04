import { DatabaseSetupNotice } from "@/app/components/database-setup-notice";
import { getCurrentHotel } from "@/lib/hotels/current";
import { DashboardView } from "./dashboard-view";

export const dynamic = "force-dynamic";

function dateInZone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function stayNights(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function shiftDate(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function localMidnightAsIso(date: string, timezone: string) {
  const midnightUtc = new Date(`${date}T00:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(midnightUtc);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localWallTimeAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  const offset = localWallTimeAsUtc - midnightUtc.getTime();
  return new Date(midnightUtc.getTime() - offset).toISOString();
}

export default async function DashboardPage() {
  const { supabase, hotel, claims, workspaces } = await getCurrentHotel();
  const today = dateInZone(hotel.timezone);
  const firstSalesDay = shiftDate(today, -13);
  const [{ data: rooms, error: roomsError }, { data: stays, error: staysError }] = await Promise.all([
    supabase.from("rooms").select("id, room_number, status").eq("hotel_id", hotel.id),
    supabase
      .from("reservations")
      .select("id, room_id, guest_name, adults, children, check_in, check_out, status")
      .eq("hotel_id", hotel.id)
      .gte("check_out", today)
      .order("check_in")
      .limit(500),
  ]);

  if (roomsError || staysError) return <DatabaseSetupNotice />;

  const sales: Array<{ total_amount: number; created_at: string }> = [];
  let salesError: unknown = null;
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from("pos_orders")
      .select("total_amount, created_at")
      .eq("hotel_id", hotel.id)
      .gte("created_at", localMidnightAsIso(firstSalesDay, hotel.timezone))
      .order("created_at")
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (result.error) {
      salesError = result.error;
      break;
    }
    sales.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) break;
  }
  if (salesError) return <DatabaseSetupNotice />;

  const salesByDate = new Map<string, number>();
  for (const sale of sales) {
    const localParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: hotel.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(sale.created_at));
    const localValues = Object.fromEntries(localParts.map((part) => [part.type, part.value]));
    const bucketDate = `${localValues.year}-${localValues.month}-${localValues.day}`;
    salesByDate.set(bucketDate, (salesByDate.get(bucketDate) ?? 0) + Number(sale.total_amount));
  }
  const salesDays = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6));
  const dailySales = salesDays.map((date) => ({
    label: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)),
    amount: salesByDate.get(date) ?? 0,
  }));
  const salesToday = salesByDate.get(today) ?? 0;
  const currentSevenDaySales = salesDays.reduce((sum, date) => sum + (salesByDate.get(date) ?? 0), 0);
  const previousSevenDaySales = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 13))
    .reduce((sum, date) => sum + (salesByDate.get(date) ?? 0), 0);
  const salesTrend = previousSevenDaySales > 0
    ? `${currentSevenDaySales >= previousSevenDaySales ? "↗" : "↘"} ${Math.round(Math.abs(currentSevenDaySales - previousSevenDaySales) / previousSevenDaySales * 100)}% vs prior 7 days`
    : currentSevenDaySales > 0 ? "New sales" : "No sales yet";

  const activeRooms = rooms.filter((room) => room.status === "active");
  const outOfService = rooms.length - activeRooms.length;
  const activeStays = stays.filter(
    (stay) => !["cancelled", "no_show", "checked_out"].includes(stay.status),
  );
  const occupiedRoomIds = new Set(
    activeStays
      .filter((stay) => stay.check_in <= today && stay.check_out > today)
      .map((stay) => stay.room_id),
  );
  const occupied = occupiedRoomIds.size;
  const available = Math.max(0, activeRooms.length - occupied);
  const occupancy = activeRooms.length
    ? Math.round((occupied / activeRooms.length) * 100)
    : 0;
  const arrivalsToday = activeStays.filter((stay) => stay.check_in === today).length;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const arrivals = activeStays
    .filter((stay) => stay.check_in >= today)
    .slice(0, 3)
    .map((stay) => {
      const room = roomById.get(stay.room_id);
      const nights = stayNights(stay.check_in, stay.check_out);
      return {
        name: stay.guest_name,
        detail: `${room ? `Room ${room.room_number}` : "Room"} · ${nights} ${nights === 1 ? "night" : "nights"}`,
        date: shortDate(stay.check_in),
        status: stay.status === "checked_in" ? "In-house" : "Expected",
      };
    });

  const metadata = claims.user_metadata as Record<string, unknown> | undefined;
  const managerName =
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    (typeof claims.email === "string" && claims.email.split("@")[0]) ||
    "there";
  const todayLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: hotel.timezone,
  }).format(new Date());

  return (
    <DashboardView
      hotelName={hotel.name}
      managerName={managerName}
      todayLabel={todayLabel}
      stats={[
        { label: "Rooms in service", value: String(activeRooms.length), note: `${outOfService} out of service`, icon: "⌂" },
        { label: "Room occupancy", value: `${occupancy}%`, note: `${occupied} occupied · ${available} available`, icon: "▦" },
        { label: "Arrivals today", value: String(arrivalsToday), note: "confirmed check-ins", icon: "↘" },
        { label: "Restaurant sales today", value: new Intl.NumberFormat("en", { style: "currency", currency: hotel.currency, maximumFractionDigits: 0 }).format(salesToday), note: "recorded in the point of sale", icon: "♧" },
      ]}
      roomStats={{ occupied, available, outOfService, occupancy }}
      salesPerformance={{
        currency: hotel.currency,
        total: currentSevenDaySales,
        trend: salesTrend,
        days: dailySales,
      }}
      arrivals={arrivals}
      arrivalsToday={arrivalsToday}
      hotelId={hotel.id}
      workspaces={workspaces}
    />
  );
}
