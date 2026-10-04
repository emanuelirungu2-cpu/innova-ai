import type { SupabaseClient } from "@supabase/supabase-js";

export type PosSaleRecord = {
  id: string;
  order_number: number | string;
  payment_method: "cash" | "card" | "mobile_money";
  total_amount: number | string;
  created_at: string;
};

export function isIsoCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftCalendarDate(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

export function localMidnightIso(date: string, timezone: string) {
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
  return new Date(midnightUtc.getTime() - (localWallTimeAsUtc - midnightUtc.getTime())).toISOString();
}

export async function getPosSalesBetween(
  supabase: SupabaseClient,
  hotelId: string,
  start: string,
  end: string,
  timezone: string,
) {
  const sales: PosSaleRecord[] = [];
  const startIso = localMidnightIso(start, timezone);
  const endExclusiveIso = localMidnightIso(shiftCalendarDate(end, 1), timezone);

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("pos_orders")
      .select("id, order_number, payment_method, total_amount, created_at")
      .eq("hotel_id", hotelId)
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + 999);

    if (error) throw error;
    sales.push(...((data ?? []) as PosSaleRecord[]));
    if ((data ?? []).length < 1000) break;
  }

  return sales;
}
