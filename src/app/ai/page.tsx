import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { OperationsAssistant } from "@/app/ai/assistant";
import { getCurrentHotel } from "@/lib/hotels/current";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const { supabase, hotel, userRole, workspaces } = await getCurrentHotel();
  let dailyLimit = 20;
  let assistantAllowed = true;
  if (process.env.ENFORCE_SUBSCRIPTIONS === "true") {
    const { data: subscriptions, error } = await supabase.from("hotel_subscriptions")
      .select("hotel_id, plan_key, status").in("hotel_id", workspaces.map((workspace) => workspace.id));
    const subscription = (subscriptions ?? []).find((item) => item.hotel_id === hotel.id && ["active", "trialing"].includes(item.status))
      ?? (subscriptions ?? []).find((item) => item.plan_key === "multi_property" && ["active", "trialing"].includes(item.status));
    assistantAllowed = !error && ["growth", "multi_property"].includes(subscription?.plan_key ?? "");
    dailyLimit = subscription?.plan_key === "multi_property" ? 50 : 20;
  }
  return <main className="module-shell">
    <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/calendar">Calendar</Link><Link href="/reservations">Reservations</Link><Link className="selected" href="/ai">AI assistant</Link><Link href="/billing">Billing</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
    <section className="module-content ai-page-content"><div className="module-title-row"><div><p className="eyebrow">INNOVA INTELLIGENCE</p><h1>AI operations assistant</h1><p className="module-subtitle">Turn your property’s live operating figures into practical next steps.</p></div><span className="module-count">Private to your workspace</span></div>
      <div className="ai-safety-note"><span>✳</span><p>The assistant receives totals and counts only. Guest names, contact details, and payment references are kept out of its request.</p></div>
      {["owner", "admin", "manager"].includes(userRole) && assistantAllowed
        ? <><OperationsAssistant hotelName={hotel.name} currency={hotel.currency} dailyLimit={dailyLimit} /><p className="report-footnote">AI-generated suggestions can be incomplete. Review important business decisions against your own records.</p></>
        : <section className="module-card"><h2>Assistant access is limited</h2><p>{["owner", "admin", "manager"].includes(userRole) ? "Innova AI is included with the Growth and Multi-property plans. Choose a plan or ask the owner to change the subscription." : "Ask an owner, admin, or manager to use Innova AI. The assistant can see aggregate expense totals for this property."}</p>{["owner", "admin"].includes(userRole) && <Link className="text-action" href="/billing">View plans →</Link>}</section>}
    </section>
  </main>;
}
