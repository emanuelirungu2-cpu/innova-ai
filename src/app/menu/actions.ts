"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

export async function createMenuItem(formData: FormData) {
  const name = value(formData, "name");
  const category = value(formData, "category");
  const description = value(formData, "description");
  const price = Number(value(formData, "price"));

  if (
    name.length < 2 || name.length > 120 ||
    !["food", "beverage", "other"].includes(category) ||
    description.length > 500 || !Number.isFinite(price) || price < 0
  ) redirect("/menu?error=invalid-item");

  const { supabase, hotel } = await getCurrentHotel();
  const { error } = await supabase.from("menu_items").insert({
    hotel_id: hotel.id,
    name,
    category,
    description: description || null,
    price,
  });

  if (error) {
    console.error("Menu item creation failed", { code: error.code });
    if (error.code === "23505") redirect("/menu?error=duplicate-item");
    if (["42P01", "PGRST205"].includes(error.code)) redirect("/menu?error=database-not-ready");
    redirect("/menu?error=save-failed");
  }

  revalidatePath("/menu");
  redirect("/menu?message=item-created");
}

export async function updateMenuItemAvailability(formData: FormData) {
  const itemId = value(formData, "itemId");
  const available = value(formData, "available");
  if (!itemId || !["true", "false"].includes(available)) redirect("/menu?error=invalid-item");

  const { supabase, hotel } = await getCurrentHotel();
  const { error } = await supabase
    .from("menu_items")
    .update({ is_available: available === "true" })
    .eq("id", itemId)
    .eq("hotel_id", hotel.id);

  if (error) {
    console.error("Menu item availability update failed", { code: error.code });
    redirect("/menu?error=save-failed");
  }

  revalidatePath("/menu");
  redirect("/menu?message=availability-updated");
}
