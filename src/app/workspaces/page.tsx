import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createHotel } from "@/app/setup/actions";
import { switchWorkspace } from "@/app/workspaces/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const errors: Record<string, string> = {
  "invalid-workspace": "That workspace isn’t available to your account.",
  "workspace-access-denied": "Only a workspace owner or admin can add another property.",
  "multi-property-plan-required": "An active Multi-property subscription is needed to add another property.",
  "missing-fields": "Please complete each field.",
  "invalid-details": "Check the property details and try again.",
  "database-not-ready": "The hotel workspace database setup isn’t complete yet.",
  "rls-recursion": "The database access rules need an update. Run the corrective SQL migration, then try again.",
  "save-failed": "We couldn’t save the workspace. Check the details and try again.",
};

export const dynamic = "force-dynamic";

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel, workspaces } = await getCurrentHotel();
  const mayCreate = workspaces.some((workspace) => ["owner", "admin"].includes(workspace.role));
  let hasPortfolioPlan = process.env.ENFORCE_SUBSCRIPTIONS !== "true" || workspaces.length === 0;
  if (process.env.ENFORCE_SUBSCRIPTIONS === "true" && workspaces.length) {
    const { data: subscriptions, error: subscriptionError } = await supabase.from("hotel_subscriptions")
      .select("plan_key, status").in("hotel_id", workspaces.map((workspace) => workspace.id));
    hasPortfolioPlan = !subscriptionError && (subscriptions ?? []).some((subscription) =>
      subscription.plan_key === "multi_property" && ["active", "trialing"].includes(subscription.status),
    );
  }
  return <main className="module-shell">
    <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/calendar">Calendar</Link><Link href="/reservations">Reservations</Link><Link href="/billing">Billing</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
    <section className="module-content workspace-content"><div className="module-title-row"><div><p className="eyebrow">YOUR BUSINESS</p><h1>Properties</h1><p className="module-subtitle">Switch between the hotel and restaurant workspaces you manage.</p></div><Link className="primary-button" href="/billing">Manage plan →</Link></div>
      {params.error && errors[params.error] && <p className="form-message error-message" role="alert">{errors[params.error]}</p>}
      <section className="module-card workspace-list-card"><div className="module-card-heading"><h2>Your workspaces</h2><p>{workspaces.length} {workspaces.length === 1 ? "property" : "properties"}</p></div><div className="workspace-list">{workspaces.map((workspace) => <article className={`workspace-row ${workspace.id === hotel.id ? "workspace-current" : ""}`} key={workspace.id}><span className="room-icon">⌂</span><div className="room-main"><strong>{workspace.name}</strong><small>{workspace.city} · {workspace.role}</small></div>{workspace.id === hotel.id ? <span className="module-count">Current</span> : <form action={switchWorkspace}><input type="hidden" name="workspaceId" value={workspace.id} /><button className="text-action" type="submit">Switch to this property →</button></form>}</article>)}</div></section>
      {mayCreate && hasPortfolioPlan ? <section className="module-card workspace-create-card"><div className="module-card-heading"><h2>Add another property</h2><p>Each property has its own rooms, bookings, restaurant sales, and financial records.</p></div><form className="module-form" action={createHotel}><input type="hidden" name="returnTo" value="/workspaces" /><label htmlFor="workspaceName">Property name</label><input id="workspaceName" name="name" type="text" minLength={2} maxLength={120} placeholder="e.g. Haven House" required /><div className="module-form-row"><div><label htmlFor="workspaceCity">City</label><input id="workspaceCity" name="city" type="text" maxLength={100} placeholder="Nairobi" required /></div><div><label htmlFor="workspaceCountry">Country</label><input id="workspaceCountry" name="country" type="text" maxLength={100} placeholder="Kenya" required /></div></div><div className="module-form-row"><div><label htmlFor="workspaceTimezone">Time zone</label><select id="workspaceTimezone" name="timezone" defaultValue="Africa/Nairobi"><option value="Africa/Nairobi">Nairobi</option><option value="Africa/Kampala">Kampala</option><option value="Africa/Dar_es_Salaam">Dar es Salaam</option><option value="Africa/Kigali">Kigali</option><option value="Africa/Johannesburg">Johannesburg</option><option value="Europe/London">London</option><option value="America/New_York">New York</option><option value="UTC">UTC</option></select></div><div><label htmlFor="workspaceCurrency">Currency</label><select id="workspaceCurrency" name="currency" defaultValue="KES"><option value="KES">KES</option><option value="UGX">UGX</option><option value="TZS">TZS</option><option value="RWF">RWF</option><option value="ZAR">ZAR</option><option value="NGN">NGN</option><option value="GHS">GHS</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option></select></div></div><button className="primary-button module-submit" type="submit">＋ Create property workspace</button></form></section> : mayCreate ? <section className="module-card workspace-create-card"><div className="module-card-heading"><h2>Upgrade to add properties</h2><p>An active Multi-property plan lets you create additional property workspaces.</p></div><Link className="primary-button" href="/billing">View subscription plans →</Link></section> : <p className="report-footnote">Only a workspace owner or admin can add another property.</p>}
    </section>
  </main>;
}
