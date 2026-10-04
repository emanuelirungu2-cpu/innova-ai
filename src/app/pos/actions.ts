"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

export async function createPosSale(formData: FormData) {
  const paymentMethod = value(formData, "paymentMethod");
  const lines: Array<{ menu_item_id: string; quantity: number }> = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("quantity_")) continue;
    const itemId = key.slice("quantity_".length);
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) {
      redirect("/pos?error=invalid-sale");
    }
    if (quantity > 0) lines.push({ menu_item_id: itemId, quantity });
  }

  if (!lines.length || lines.length > 50 || !["cash", "card", "mobile_money"].includes(paymentMethod)) {
    redirect("/pos?error=invalid-sale");
  }

  const { supabase, hotel } = await getCurrentHotel();
  const { error } = await supabase.rpc("create_pos_sale", {
    p_hotel_id: hotel.id,
    p_lines: lines,
    p_payment_method: paymentMethod,
  });

  if (error) {
    console.error("POS sale creation failed", { code: error.code });
    if (["42883", "42P01", "PGRST202", "PGRST205"].includes(error.code)) {
      redirect("/pos?error=database-not-ready");
    }
    if (error.code === "22023") redirect("/pos?error=unavailable-item");
    redirect("/pos?error=save-failed");
  }

  revalidatePath("/pos");
  revalidatePath("/dashboard");
  redirect("/pos?message=sale-created");
}
