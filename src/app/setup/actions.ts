"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createHotel(formData: FormData) {
  const returnTo = formValue(formData, "returnTo") === "/workspaces" ? "/workspaces" : "/setup";
  const name = formValue(formData, "name");
  const city = formValue(formData, "city");
  const country = formValue(formData, "country");
  const timezone = formValue(formData, "timezone");
  const currency = formValue(formData, "currency").toUpperCase();

  if (!name || !city || !country || !timezone || !currency) {
    redirect(`${returnTo}?error=missing-fields`);
  }
  if (name.length < 2 || name.length > 120 || city.length > 100 || country.length > 100) {
    redirect(`${returnTo}?error=invalid-details`);
  }
  if (!/^[A-Z]{3}$/.test(currency)) redirect(`${returnTo}?error=invalid-details`);
  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/login");
  let billingHotelId: string | null = null;
  if (returnTo === "/workspaces") {
    if (typeof authData.claims.sub !== "string") redirect("/login");
    const { data: memberships, error: membershipError } = await supabase.from("hotel_members")
      .select("hotel_id, role").eq("user_id", authData.claims.sub);
    const membershipRows = memberships ?? [];
    if (membershipError || !membershipRows.some((membership) => ["owner", "admin"].includes(membership.role))) redirect("/workspaces?error=workspace-access-denied");
    if (process.env.ENFORCE_SUBSCRIPTIONS === "true" && membershipRows.length > 0) {
      const { data: subscriptions, error: billingError } = await supabase.from("hotel_subscriptions")
        .select("hotel_id, plan_key, status").in("hotel_id", membershipRows.map((membership) => membership.hotel_id));
      const portfolioSubscription = !billingError ? (subscriptions ?? []).find((subscription) =>
        subscription.plan_key === "multi_property" && ["active", "trialing"].includes(subscription.status),
      ) : undefined;
      if (!portfolioSubscription) redirect("/workspaces?error=multi-property-plan-required");
      billingHotelId = portfolioSubscription.hotel_id;
    }
  }

  const { data: hotelId, error } = billingHotelId
    ? await supabase.rpc("create_portfolio_hotel_workspace", {
      p_name: name,
      p_city: city,
      p_country: country,
      p_timezone: timezone,
      p_currency: currency,
      p_billing_hotel_id: billingHotelId,
    })
    : await supabase.rpc("create_hotel_workspace", {
      p_name: name,
      p_city: city,
      p_country: country,
      p_timezone: timezone,
      p_currency: currency,
    });

  if (error) {
    console.error("Hotel workspace creation failed", { code: error.code });
    if (error.code === "42P17") redirect(`${returnTo}?error=rls-recursion`);
    if (error.code === "PGRST202" || error.code === "42P01") {
      redirect(`${returnTo}?error=database-not-ready`);
    }
    if (billingHotelId && error.code === "42501") redirect("/workspaces?error=multi-property-plan-required");
    redirect(`${returnTo}?error=save-failed`);
  }

  if (hotelId) {
    (await cookies()).set("innova_workspace_id", hotelId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect("/dashboard");
}
export async function updateHotelSettings(formData: FormData) {
  const name = formValue(formData, "name");
  const city = formValue(formData, "city");
  const country = formValue(formData, "country");
  const timezone = formValue(formData, "timezone");
  const currency = formValue(formData, "currency").toUpperCase();

  if (
    name.length < 2 || name.length > 120 ||
    city.length < 2 || city.length > 100 ||
    country.length < 2 || country.length > 100 ||
    !timezone || !/^[A-Z]{3}$/.test(currency)
  ) {
    redirect("/dashboard/settings?error=invalid-details");
  }

  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const supabase = await createClient();
const { data: authData } = await supabase.auth.getClaims();

if (!authData?.claims || typeof authData.claims.sub !== "string") {
  redirect("/login");
}

let workspaceId = (await cookies()).get("innova_workspace_id")?.value;

if (!workspaceId) {
  const { data: memberships } = await supabase
    .from("hotel_members")
    .select("hotel_id, role")
    .eq("user_id", authData.claims.sub);

  workspaceId = (memberships ?? []).find(
    (membership) => ["owner", "admin"].includes(membership.role),
  )?.hotel_id;
}

if (!workspaceId) redirect("/setup");

  const { data, error } = await supabase
    .from("hotels")
    .update({ name, city, country, timezone, currency })
    .eq("id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Hotel settings update failed", { code: error?.code });
    redirect("/dashboard/settings?error=save-failed");
  }

  redirect("/dashboard/settings?saved=1");
}
export async function updateAccountSettings(formData: FormData) {
  const fullName = formValue(formData, "full_name");
  const email = formValue(formData, "email").toLowerCase();

  if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/dashboard/settings?error=invalid-account");
  }

  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/login");

  const currentEmail =
    typeof authData.claims.email === "string"
      ? authData.claims.email.toLowerCase()
      : "";
  const changingEmail = email !== currentEmail;

  const result = changingEmail
    ? await supabase.auth.updateUser({ email, data: { full_name: fullName } })
    : await supabase.auth.updateUser({ data: { full_name: fullName } });

  if (result.error) {
    console.error("Account settings update failed", { status: result.error.status });
    redirect("/dashboard/settings?error=account-save-failed");
  }

  redirect(
    changingEmail
      ? "/dashboard/settings?email=confirmation"
      : "/dashboard/settings?accountSaved=1",
  );
}