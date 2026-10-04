"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function createExpense(formData: FormData) {
  const expenseDate = value(formData, "expenseDate");
  const category = value(formData, "category");
  const description = value(formData, "description");
  const vendor = value(formData, "vendor");
  const paymentMethod = value(formData, "paymentMethod");
  const amount = Number(value(formData, "amount"));

  if (
    !validDate(expenseDate) || !["food_supplies", "payroll", "rent", "utilities", "maintenance", "transport", "marketing", "other"].includes(category) ||
    description.length < 2 || description.length > 240 || vendor.length > 120 ||
    !Number.isFinite(amount) || amount <= 0 || amount > 9_999_999_999.99 ||
    !["cash", "card", "mobile_money", "bank_transfer"].includes(paymentMethod)
  ) redirect("/finance?error=invalid-expense");

  const { supabase, hotel, userId, userRole } = await getCurrentHotel();
  if (!["owner", "admin", "manager"].includes(userRole)) redirect("/finance?error=access-denied");
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: hotel.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const today = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
  if (expenseDate > today) redirect("/finance?error=invalid-expense");

  const { error } = await supabase.from("expenses").insert({
    hotel_id: hotel.id,
    expense_date: expenseDate,
    category,
    description,
    vendor: vendor || null,
    amount,
    payment_method: paymentMethod,
    created_by: userId,
  });

  if (error) {
    console.error("Expense creation failed", { code: error.code });
    if (["42P01", "PGRST205"].includes(error.code)) redirect("/finance?error=database-not-ready");
    redirect("/finance?error=save-failed");
  }

  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/finance?message=expense-created");
}
