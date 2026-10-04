"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

export async function createReservation(formData: FormData) {
  const roomId = value(formData, "roomId");
  const guestName = value(formData, "guestName");
  const guestEmail = value(formData, "guestEmail");
  const guestPhone = value(formData, "guestPhone");
  const checkIn = value(formData, "checkIn");
  const checkOut = value(formData, "checkOut");
  const adults = Number(value(formData, "adults"));
  const children = Number(value(formData, "children") || "0");
  const enteredTotal = value(formData, "totalAmount");
  const totalAmount = enteredTotal === "" ? null : Number(enteredTotal);
  const checkInDate = new Date(`${checkIn}T00:00:00Z`);
  const checkOutDate = new Date(`${checkOut}T00:00:00Z`);

  if (
    !roomId ||
    guestName.length < 2 ||
    guestName.length > 120 ||
    guestEmail.length > 254 ||
    guestPhone.length > 30 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) ||
    Number.isNaN(checkInDate.getTime()) ||
    Number.isNaN(checkOutDate.getTime()) ||
    checkInDate.toISOString().slice(0, 10) !== checkIn ||
    checkOutDate.toISOString().slice(0, 10) !== checkOut ||
    checkOut <= checkIn ||
    !Number.isInteger(adults) ||
    adults < 1 ||
    adults > 20 ||
    !Number.isInteger(children) ||
    children < 0 ||
    children > 20 ||
    (totalAmount !== null && (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 9_999_999_999.99))
  ) {
    redirect("/reservations?error=invalid-details");
  }

  const { supabase, hotel, userId } = await getCurrentHotel();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, max_guests, nightly_rate")
    .eq("id", roomId)
    .eq("hotel_id", hotel.id)
    .eq("status", "active")
    .maybeSingle();

  if (roomError || !room) redirect("/reservations?error=invalid-room");
  if (adults + children > room.max_guests) {
    redirect("/reservations?error=over-capacity");
  }
  const nights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 86_400_000);
  const { data: rateOverrides, error: ratesError } = await supabase.from("room_rate_overrides")
    .select("stay_date, nightly_rate")
    .eq("hotel_id", hotel.id)
    .eq("room_id", room.id)
    .gte("stay_date", checkIn)
    .lt("stay_date", checkOut);
  if (ratesError) {
    console.error("Reservation rate lookup failed", { code: ratesError.code });
    if (["42P01", "PGRST205"].includes(ratesError.code)) {
      redirect("/reservations?error=daily-rate-database-not-ready");
    }
    redirect("/reservations?error=save-failed");
  }
  const overrideAdjustment = (rateOverrides ?? []).reduce(
    (sum, item) => sum + Number(item.nightly_rate) - Number(room.nightly_rate),
    0,
  );
  const calculatedTotal = Math.round((Number(room.nightly_rate) * nights + overrideAdjustment) * 100) / 100;
  if (!Number.isFinite(calculatedTotal) || calculatedTotal > 9_999_999_999.99) {
    redirect("/reservations?error=invalid-details");
  }

  const { error } = await supabase.from("reservations").insert({
    hotel_id: hotel.id,
    room_id: room.id,
    guest_name: guestName,
    guest_email: guestEmail || null,
    guest_phone: guestPhone || null,
    check_in: checkIn,
    check_out: checkOut,
    adults,
    children,
    total_amount: totalAmount ?? calculatedTotal,
    created_by: userId,
  });

  if (error) {
    console.error("Reservation creation failed", { code: error.code });
    if (error.code === "23P01") redirect("/reservations?error=dates-unavailable");
    if (error.code === "23503") redirect("/reservations?error=invalid-room");
    if (error.code === "42P01" || error.code === "PGRST205") {
      redirect("/reservations?error=database-not-ready");
    }
    redirect("/reservations?error=save-failed");
  }

  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  redirect("/reservations?message=reservation-created");
}

export async function cancelReservation(formData: FormData) {
  const reservationId = value(formData, "reservationId");
  if (!reservationId) redirect("/reservations?error=invalid-details");

  const { supabase, hotel } = await getCurrentHotel();
  const { data: transactions, error: transactionError } = await supabase
    .from("reservation_payments")
    .select("kind, amount")
    .eq("reservation_id", reservationId)
    .eq("hotel_id", hotel.id);
  if (transactionError) {
    if (["42P01", "PGRST205"].includes(transactionError.code)) {
      redirect("/reservations?error=payment-database-not-ready");
    }
    redirect("/reservations?error=save-failed");
  }
  const netPaid = (transactions ?? []).reduce(
    (sum, item) => sum + (item.kind === "refund" ? -Number(item.amount) : Number(item.amount)),
    0,
  );
  if (netPaid > 0) redirect("/reservations?error=refund-before-cancel");

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId)
    .eq("hotel_id", hotel.id)
    .in("status", ["confirmed", "checked_in"]);

  if (error) {
    console.error("Reservation cancellation failed", { code: error.code });
    redirect("/reservations?error=save-failed");
  }

  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  redirect("/reservations?message=reservation-cancelled");
}

export async function recordReservationTransaction(formData: FormData) {
  const reservationId = value(formData, "reservationId");
  const kind = value(formData, "kind");
  const paymentMethod = value(formData, "paymentMethod");
  const reference = value(formData, "reference");
  const amountText = value(formData, "amount");
  const amount = Number(amountText);

  if (
    !reservationId || !["payment", "refund"].includes(kind) ||
    !["cash", "card", "mobile_money", "bank_transfer"].includes(paymentMethod) ||
    reference.length > 120 || amountText === "" || !Number.isFinite(amount) ||
    amount <= 0 || amount > 9_999_999_999.99
  ) redirect("/reservations?error=invalid-payment");

  const { supabase, hotel } = await getCurrentHotel();
  const { error } = await supabase.rpc("record_reservation_transaction", {
    p_hotel_id: hotel.id,
    p_reservation_id: reservationId,
    p_kind: kind,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_reference: reference || null,
  });

  if (error) {
    console.error("Reservation payment entry failed", { code: error.code });
    if (["42883", "42P01", "PGRST202", "PGRST205"].includes(error.code)) {
      redirect("/reservations?error=payment-database-not-ready");
    }
    if (error.code === "42501") redirect("/reservations?error=refund-access-denied");
    if (error.code === "22023") redirect("/reservations?error=payment-balance");
    redirect("/reservations?error=save-failed");
  }

  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  redirect(`/reservations?message=${kind === "refund" ? "refund-recorded" : "payment-recorded"}`);
}

function hotelToday(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function checkInReservation(formData: FormData) {
  const reservationId = value(formData, "reservationId");
  if (!reservationId) redirect("/reservations?error=invalid-details");

  const { supabase, hotel } = await getCurrentHotel();
  const today = hotelToday(hotel.timezone);
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "checked_in" })
    .eq("id", reservationId)
    .eq("hotel_id", hotel.id)
    .eq("status", "confirmed")
    .lte("check_in", today)
    .gt("check_out", today)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Guest check-in failed", { code: error.code });
    redirect("/reservations?error=save-failed");
  }
  if (!data) redirect("/reservations?error=check-in-unavailable");

  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  redirect("/reservations?message=guest-checked-in");
}

export async function checkOutReservation(formData: FormData) {
  const reservationId = value(formData, "reservationId");
  if (!reservationId) redirect("/reservations?error=invalid-details");

  const { supabase, hotel } = await getCurrentHotel();
  const today = hotelToday(hotel.timezone);
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "checked_out" })
    .eq("id", reservationId)
    .eq("hotel_id", hotel.id)
    .eq("status", "checked_in")
    .lte("check_out", today)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Guest check-out failed", { code: error.code });
    redirect("/reservations?error=save-failed");
  }
  if (!data) redirect("/reservations?error=check-out-unavailable");

  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  redirect("/reservations?message=guest-checked-out");
}
