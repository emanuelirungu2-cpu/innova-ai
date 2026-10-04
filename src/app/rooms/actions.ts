"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

export async function createRoom(formData: FormData) {
  const roomNumber = value(formData, "roomNumber");
  const roomType = value(formData, "roomType");
  const maxGuests = Number(value(formData, "maxGuests"));
  const nightlyRate = Number(value(formData, "nightlyRate"));

  if (
    !roomNumber ||
    roomNumber.length > 30 ||
    roomType.length < 2 ||
    roomType.length > 60 ||
    !Number.isInteger(maxGuests) ||
    maxGuests < 1 ||
    maxGuests > 20 ||
    !Number.isFinite(nightlyRate) ||
    nightlyRate < 0
  ) {
    redirect("/rooms?error=invalid-room");
  }

  const { supabase, hotel } = await getCurrentHotel();
  const { error } = await supabase.from("rooms").insert({
    hotel_id: hotel.id,
    room_number: roomNumber,
    room_type: roomType,
    max_guests: maxGuests,
    nightly_rate: nightlyRate,
  });

  if (error) {
    console.error("Room creation failed", { code: error.code });
    if (error.code === "23505") redirect("/rooms?error=duplicate-room");
    if (error.code === "42P01" || error.code === "PGRST205") {
      redirect("/rooms?error=database-not-ready");
    }
    redirect("/rooms?error=save-failed");
  }

  revalidatePath("/rooms");
  revalidatePath("/dashboard");
  redirect("/rooms?message=room-created");
}

export async function updateRoomStatus(formData: FormData) {
  const roomId = value(formData, "roomId");
  const status = value(formData, "status");
  if (!roomId || !["active", "out_of_service"].includes(status)) {
    redirect("/rooms?error=invalid-room");
  }

  const { supabase, hotel } = await getCurrentHotel();
  const { error } = await supabase
    .from("rooms")
    .update({ status })
    .eq("id", roomId)
    .eq("hotel_id", hotel.id);

  if (error) {
    console.error("Room status update failed", { code: error.code });
    redirect("/rooms?error=save-failed");
  }

  revalidatePath("/rooms");
  revalidatePath("/dashboard");
  redirect("/rooms?message=status-updated");
}

export async function updateHousekeepingStatus(formData: FormData) {
  const roomId = value(formData, "roomId");
  const status = value(formData, "housekeepingStatus");
  if (!roomId || !["clean", "dirty", "cleaning"].includes(status)) {
    redirect("/rooms?error=invalid-room");
  }

  const { supabase } = await getCurrentHotel();
  const { error } = await supabase.rpc("set_room_housekeeping_status", {
    p_room_id: roomId,
    p_status: status,
  });

  if (error) {
    console.error("Housekeeping status update failed", { code: error.code });
    if (error.code === "42883" || error.code === "PGRST202") {
      redirect("/rooms?error=database-not-ready");
    }
    redirect("/rooms?error=save-failed");
  }

  revalidatePath("/rooms");
  revalidatePath("/dashboard");
  redirect("/rooms?message=housekeeping-updated");
}

export async function updateRoomRate(formData: FormData) {
  const roomId = value(formData, "roomId");
  const rawRate = value(formData, "nightlyRate");
  const nightlyRate = Number(rawRate);
  if (!roomId || rawRate === "" || !Number.isFinite(nightlyRate) || nightlyRate < 0 || nightlyRate > 9_999_999_999.99) {
    redirect("/rooms?error=invalid-room");
  }

  const { supabase, hotel } = await getCurrentHotel();
  const { error } = await supabase.from("rooms")
    .update({ nightly_rate: nightlyRate })
    .eq("id", roomId)
    .eq("hotel_id", hotel.id);

  if (error) {
    console.error("Room rate update failed", { code: error.code });
    redirect("/rooms?error=save-failed");
  }

  revalidatePath("/rooms");
  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  redirect("/rooms?message=rate-updated");
}
