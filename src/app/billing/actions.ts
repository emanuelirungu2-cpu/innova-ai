"use server";

import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";
import { getSiteUrl } from "@/lib/site-url";

const planPriceEnvironment: Record<string, string> = {
  starter: "STRIPE_PRICE_ID_STARTER",
  growth: "STRIPE_PRICE_ID_GROWTH",
  multi_property: "STRIPE_PRICE_ID_MULTI_PROPERTY",
};

async function stripePost(path: string, fields: URLSearchParams) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("billing_not_configured");
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: fields,
    cache: "no-store",
  });
}

export async function startSubscriptionCheckout(formData: FormData) {
  const plan = String(formData.get("plan") ?? "");
  const priceEnvironment = planPriceEnvironment[plan];
  if (!priceEnvironment) redirect("/billing?error=invalid-plan");
  const priceId = process.env[priceEnvironment];
  if (!priceId || !process.env.STRIPE_SECRET_KEY) redirect("/billing?error=billing-not-configured");

  const { supabase, hotel, claims, userRole, workspaces } = await getCurrentHotel();
  if (!["owner", "admin"].includes(userRole)) redirect("/billing?error=billing-access-denied");
  const { data: subscriptions, error: subscriptionError } = await supabase.from("hotel_subscriptions")
    .select("hotel_id, stripe_customer_id, status, plan_key").in("hotel_id", workspaces.map((workspace) => workspace.id));
  if (subscriptionError) redirect("/billing?error=billing-database-not-ready");
  const subscriptionRows = (subscriptions ?? []) as Array<{ hotel_id: string; stripe_customer_id: string | null; status: string; plan_key: string | null }>;
  const current = subscriptionRows.find((item) => item.hotel_id === hotel.id);
  const portfolioSubscription = subscriptionRows.find((item) => item.plan_key === "multi_property" && ["active", "trialing", "past_due", "unpaid"].includes(item.status));
  if ((current && ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(current.status)) || portfolioSubscription) {
    redirect("/billing?error=already-subscribed");
  }

  const fields = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${getSiteUrl()}/billing?success=1`,
    cancel_url: `${getSiteUrl()}/billing?cancelled=1`,
    "allow_promotion_codes": "true",
    "client_reference_id": hotel.id,
    "metadata[hotel_id]": hotel.id,
    "metadata[plan]": plan,
    "subscription_data[metadata][hotel_id]": hotel.id,
    "subscription_data[metadata][plan]": plan,
  });
  if (current?.stripe_customer_id) fields.set("customer", current.stripe_customer_id);
  else if (typeof claims.email === "string") fields.set("customer_email", claims.email);

  try {
    const response = await stripePost("checkout/sessions", fields);
    const result = await response.json() as { url?: string };
    if (!response.ok || !result.url) {
      console.error("Stripe Checkout session failed", { status: response.status });
      redirect("/billing?error=checkout-failed");
    }
    redirect(result.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Stripe Checkout is unavailable");
    redirect("/billing?error=checkout-failed");
  }
}

export async function openCustomerPortal() {
  const { supabase, hotel, userRole, workspaces } = await getCurrentHotel();
  if (!["owner", "admin"].includes(userRole)) redirect("/billing?error=billing-access-denied");
  if (!process.env.STRIPE_SECRET_KEY) redirect("/billing?error=billing-not-configured");
  const { data: subscriptions, error } = await supabase.from("hotel_subscriptions")
    .select("hotel_id, stripe_customer_id, plan_key, status").in("hotel_id", workspaces.map((workspace) => workspace.id));
  const subscriptionRows = (subscriptions ?? []) as Array<{ hotel_id: string; stripe_customer_id: string | null; plan_key: string | null; status: string }>;
  const subscription = subscriptionRows.find((item) => item.plan_key === "multi_property" && item.stripe_customer_id && ["active", "trialing", "past_due", "unpaid"].includes(item.status))
    ?? subscriptionRows.find((item) => item.hotel_id === hotel.id && item.stripe_customer_id);
  if (error || !subscription?.stripe_customer_id) redirect("/billing?error=no-customer");
  try {
    const response = await stripePost("billing_portal/sessions", new URLSearchParams({
      customer: subscription.stripe_customer_id,
      return_url: `${getSiteUrl()}/billing`,
    }));
    const result = await response.json() as { url?: string };
    if (!response.ok || !result.url) redirect("/billing?error=portal-failed");
    redirect(result.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/billing?error=portal-failed");
  }
}
