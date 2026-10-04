import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeSubscription = {
  id: string;
  customer: string | { id: string } | null;
  status: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ current_period_end?: number; price?: { id?: string } }> };
};

function validSignature(payload: string, header: string, secret: string) {
  const fields = header.split(",").map((part) => part.split("=", 2));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest();
  return signatures.some((signature) => {
    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

async function getSubscription(secret: string, subscriptionId: string) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Stripe subscription lookup failed: ${response.status}`);
  return await response.json() as StripeSubscription;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return Response.json({ error: "Webhook is not configured." }, { status: 400 });
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000 || !validSignature(rawBody, signature, secret)) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  let event: { id?: string; type?: string; created?: number; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid webhook body." }, { status: 400 });
  }
  if (!event.id || !event.type || !event.data?.object) {
    return Response.json({ error: "Incomplete webhook event." }, { status: 400 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !process.env.STRIPE_SECRET_KEY) {
    console.error("Billing webhook server configuration is incomplete");
    return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: alreadyProcessed, error: lookupError } = await supabase.from("stripe_webhook_events")
    .select("event_id").eq("event_id", event.id).maybeSingle();
  if (lookupError) {
    console.error("Stripe event lookup failed", { code: lookupError.code });
    return Response.json({ error: "Could not process the event." }, { status: 503 });
  }
  if (alreadyProcessed) return Response.json({ received: true, duplicate: true });

  try {
    const object = event.data.object;
    let subscription: StripeSubscription | null = null;
    let hotelId: string | null = null;
    if (event.type === "checkout.session.completed" && object.mode === "subscription") {
      hotelId = typeof (object.metadata as Record<string, unknown> | undefined)?.hotel_id === "string"
        ? String((object.metadata as Record<string, unknown>).hotel_id)
        : null;
      if (hotelId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hotelId)) hotelId = null;
      const subscriptionField = object.subscription;
      const subscriptionId = typeof subscriptionField === "string"
        ? subscriptionField
        : subscriptionField && typeof subscriptionField === "object" && "id" in subscriptionField
          ? String(subscriptionField.id)
          : "";
      if (subscriptionId) subscription = await getSubscription(process.env.STRIPE_SECRET_KEY, subscriptionId);
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(event.type)) {
      subscription = object as unknown as StripeSubscription;
      hotelId = typeof subscription.metadata?.hotel_id === "string" ? subscription.metadata.hotel_id : null;
      if (hotelId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hotelId)) hotelId = null;
    }

    if (subscription) {
      if (!hotelId) {
        const { data: existing, error } = await supabase.from("hotel_subscriptions")
          .select("hotel_id").eq("stripe_subscription_id", subscription.id).maybeSingle();
        if (error) throw new Error("Could not find the subscription workspace");
        hotelId = existing?.hotel_id ?? null;
      }
      if (hotelId) {
        const allowedStatuses = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"];
        const item = subscription.items?.data?.[0];
        const periodEnd = subscription.current_period_end ?? item?.current_period_end;
        const customer = subscription.customer;
        const planKey = subscription.metadata?.plan;
        const { error } = await supabase.rpc("sync_hotel_subscription", {
          p_hotel_id: hotelId,
          p_customer_id: typeof customer === "string" ? customer : customer?.id ?? null,
          p_subscription_id: subscription.id,
          p_price_id: item?.price?.id ?? null,
          p_plan_key: ["starter", "growth", "multi_property"].includes(planKey ?? "") ? planKey : null,
          p_status: allowedStatuses.includes(subscription.status) ? subscription.status : "incomplete",
          p_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
          p_event_created: Number(event.created ?? 0),
        });
        if (error) throw new Error(`Subscription update failed: ${error.code}`);
      }
    }

    const { error: eventError } = await supabase.from("stripe_webhook_events").upsert({
      event_id: event.id,
      event_type: event.type,
    }, { onConflict: "event_id", ignoreDuplicates: true });
    if (eventError) throw new Error(`Event recording failed: ${eventError.code}`);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe event processing failed", { message: error instanceof Error ? error.message : "unknown error" });
    return Response.json({ error: "The billing event could not be processed yet." }, { status: 503 });
  }
}
