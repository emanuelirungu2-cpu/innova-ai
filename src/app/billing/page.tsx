import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { openCustomerPortal, startSubscriptionCheckout } from "@/app/billing/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const plans = [
  { id: "starter", name: "Starter", description: "Core tools for an independent property.", points: ["Rooms, reservations, and guest records", "Restaurant menu and point of sale", "Reports and recorded expenses"] },
  { id: "growth", name: "Growth", description: "For managers who want AI operating guidance.", points: ["Everything in Starter", "Innova AI assistant", "20 AI questions per manager each day"] },
  { id: "multi_property", name: "Multi-property", description: "For operators managing multiple venues.", points: ["Everything in Growth", "Create multiple property workspaces", "50 AI questions per manager each day"] },
] as const;

const priceEnv: Record<string, string> = {
  starter: "STRIPE_PRICE_ID_STARTER",
  growth: "STRIPE_PRICE_ID_GROWTH",
  multi_property: "STRIPE_PRICE_ID_MULTI_PROPERTY",
};

const messages: Record<string, string> = {
  "invalid-plan": "Choose one of the listed plans.",
  "billing-not-configured": "Connect Stripe and set plan prices before starting a subscription.",
  "billing-database-not-ready": "Run the Innova AI and billing SQL setup in Supabase first.",
  "billing-access-denied": "Only the hotel owner or an admin can manage billing.",
  "already-subscribed": "This property already has a subscription. Use Manage billing to change it.",
  "checkout-failed": "Stripe could not start checkout. Check the Stripe configuration and try again.",
  "no-customer": "A Stripe customer record is not available for this property yet.",
  "portal-failed": "Could not open the billing portal. Try again shortly.",
};

type StripePrice = {
  id: string;
  active: boolean;
  unit_amount: number | null;
  currency: string;
  recurring?: { interval: string; interval_count: number } | null;
};

async function getPrice(priceId: string): Promise<StripePrice | null> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  try {
    const response = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json() as StripePrice;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; cancelled?: string; required?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel, userRole, workspaces } = await getCurrentHotel();
  const canManage = ["owner", "admin"].includes(userRole);
  const { data: subscriptions, error: subscriptionError } = await supabase.from("hotel_subscriptions")
    .select("hotel_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_key, status, current_period_end, cancel_at_period_end")
    .in("hotel_id", workspaces.map((workspace) => workspace.id));
  const subscription = (subscriptions ?? []).find((item) => item.plan_key === "multi_property" && ["active", "trialing", "past_due", "unpaid"].includes(item.status))
    ?? (subscriptions ?? []).find((item) => item.hotel_id === hotel.id);
  const configuredPlans = plans.map((plan) => ({ ...plan, priceId: process.env[priceEnv[plan.id]] ?? "" }));
  const prices = await Promise.all(configuredPlans.map((plan) => plan.priceId ? getPrice(plan.priceId) : null));
  const formatPrice = (price: StripePrice | null) => {
    if (!price || !price.active || price.unit_amount === null) return null;
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: price.currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
    const amount = price.unit_amount / 10 ** digits;
    const value = new Intl.NumberFormat("en", { style: "currency", currency: price.currency.toUpperCase(), maximumFractionDigits: 2 }).format(amount);
    const interval = price.recurring ? ` / ${price.recurring.interval_count > 1 ? `${price.recurring.interval_count} ` : ""}${price.recurring.interval}` : "";
    return `${value}${interval}`;
  };
  const status = subscription?.status ?? "not subscribed";
  const currentPlan = configuredPlans.find((plan) => plan.id === subscription?.plan_key || (plan.priceId && plan.priceId === subscription?.stripe_price_id))?.name;
  const periodEnd = subscription?.current_period_end
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: hotel.timezone }).format(new Date(subscription.current_period_end))
    : null;

  return <main className="module-shell">
    <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/calendar">Calendar</Link><Link href="/reservations">Reservations</Link><Link href="/ai">AI assistant</Link><Link className="selected" href="/billing">Billing</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
    <section className="module-content billing-content"><div className="module-title-row"><div><p className="eyebrow">INNOVA AI SUBSCRIPTIONS</p><h1>Plan and billing</h1><p className="module-subtitle">Subscription settings for {hotel.name}.</p></div><span className="module-count">{status.replaceAll("_", " ")}</span></div>
      {params.error && messages[params.error] && <p className="form-message error-message" role="alert">{messages[params.error]}</p>}
      {params.required && <p className="form-message" role="status">Choose an active subscription to continue using Innova AI for this workspace.</p>}
      {params.success && <p className="form-message success-message" role="status">Checkout completed. Stripe will confirm and update the subscription here shortly.</p>}
      {params.cancelled && <p className="form-message" role="status">Checkout was cancelled. No subscription was started.</p>}
      {subscriptionError ? <div className="module-card billing-setup-note"><h2>Billing needs one database setup step</h2><p>Run the Innova AI and billing migration in Supabase SQL Editor, then refresh this page.</p></div> : <>
        {subscription && <section className="module-card current-plan-card"><div><p className="eyebrow">CURRENT SUBSCRIPTION</p><h2>{currentPlan ?? "Your subscription"}</h2><p>Status: <strong>{subscription.status.replaceAll("_", " ")}</strong>{periodEnd ? ` · ${subscription.cancel_at_period_end ? "Ends" : "Renews"} ${periodEnd}` : ""}</p></div>{canManage && subscription.stripe_customer_id && <form action={openCustomerPortal}><button className="primary-button" type="submit">Manage billing →</button></form>}</section>}
        <div className="billing-plan-grid">{plans.map((plan, index) => { const price = prices[index]; const displayPrice = formatPrice(price); const priceId = configuredPlans[index].priceId; return <article className={`module-card billing-plan-card ${plan.id === "growth" ? "featured-plan" : ""}`} key={plan.id}><p className="eyebrow">INNOVA AI</p><h2>{plan.name}</h2><p className="billing-plan-description">{plan.description}</p><strong className="billing-price">{displayPrice ?? (priceId ? "Price unavailable" : "Set your price in Stripe")}</strong><ul>{plan.points.map((point) => <li key={point}>{point}</li>)}</ul>{canManage ? <form action={startSubscriptionCheckout}><input type="hidden" name="plan" value={plan.id} /><button className="primary-button" type="submit" disabled={!priceId || !displayPrice || !process.env.STRIPE_SECRET_KEY}>{priceId && displayPrice && process.env.STRIPE_SECRET_KEY ? `Choose ${plan.name} →` : "Billing not connected"}</button></form> : <p className="report-hint">Ask the owner or an admin to manage plans.</p>}</article>; })}</div>
        {!process.env.STRIPE_SECRET_KEY && <div className="module-card billing-setup-note"><h2>Connect your billing account</h2><p>Set the private Stripe key and create recurring prices for each plan. The amount shown here is loaded from Stripe, so you control your pricing there.</p></div>}
        {canManage && subscription && !subscription.stripe_customer_id && <p className="report-hint">Stripe billing portal becomes available after the first subscription is confirmed.</p>}
      </>}
      <p className="report-footnote">Payments and card details are handled by Stripe. Innova AI stores the subscription status and renewal date needed for this workspace.</p>
    </section>
  </main>;
}
