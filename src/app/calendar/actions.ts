"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function hotelToday(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function saveRoomRate(formData: FormData) {
  const roomId = value(formData, "roomId");
  const stayDate = value(formData, "stayDate");
  const rateText = value(formData, "nightlyRate");
  const rate = Number(rateText);
  const parsedDate = new Date(`${stayDate}T00:00:00.000Z`);
  if (
    !roomId || !/^\d{4}-\d{2}-\d{2}$/.test(stayDate) ||
    Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== stayDate ||
    rateText === "" || !Number.isFinite(rate) || rate < 0 || rate > 9_999_999_999.99
  ) redirect(`/calendar?week=${encodeURIComponent(stayDate)}&error=invalid-rate`);

  const { supabase, hotel, userId, userRole } = await getCurrentHotel();
  if (!["owner", "admin", "manager"].includes(userRole)) {
    redirect(`/calendar?week=${encodeURIComponent(stayDate)}&error=rate-access-denied`);
  }
  if (stayDate < hotelToday(hotel.timezone)) {
    redirect(`/calendar?week=${encodeURIComponent(stayDate)}&error=past-rate`);
  }

  const { data: room, error: roomError } = await supabase.from("rooms")
    .select("id").eq("id", roomId).eq("hotel_id", hotel.id).eq("status", "active").maybeSingle();
  if (roomError || !room) redirect(`/calendar?week=${encodeURIComponent(stayDate)}&error=invalid-rate-room`);

  const { error } = await supabase.from("room_rate_overrides").upsert({
    hotel_id: hotel.id,
    room_id: room.id,
    stay_date: stayDate,
    nightly_rate: rate,
    created_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "hotel_id,room_id,stay_date" });

  if (error) {
    console.error("Room rate update failed", { code: error.code });
    if (["42P01", "PGRST205"].includes(error.code)) {
      redirect(`/calendar?week=${encodeURIComponent(stayDate)}&error=rate-database-not-ready`);
    }
    if (error.code === "42501") redirect(`/calendar?week=${encodeURIComponent(stayDate)}&error=rate-access-denied`);
    redirect(`/calendar?week=${encodeURIComponent(stayDate)}&error=rate-save-failed`);
  }

  revalidatePath("/calendar");
  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  redirect(`/calendar?week=${encodeURIComponent(stayDate)}&message=rate-saved`);
}
