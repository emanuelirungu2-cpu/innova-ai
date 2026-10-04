import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createHotel } from "@/app/setup/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const messages: Record<string, string> = {
  "missing-fields": "Please complete each field.",
  "invalid-details": "Check the hotel details and try again.",
  "database-not-ready": "The hotel database setup is not finished yet. Run the SQL setup from the project’s Supabase migration file, then refresh this page.",
  "rls-recursion": "The database access rules need an update. Run the corrective SQL migration from the project’s supabase/migrations folder, then try again.",
  database: "We couldn’t load your hotel workspace. Confirm the Supabase database setup has finished, then try again.",
  "save-failed": "We couldn’t save the hotel. Check the details and try again.",
};

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("hotel_members")
    .select("hotel_id")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <main className="setup-shell">
        <section className="setup-card setup-message-card">
          <Link className="brand setup-brand" href="/"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
          <span className="setup-step">DATABASE SETUP</span>
          <h1>One quick setup step</h1>
          <p className="setup-intro">Your account is ready. Run the hotel workspace SQL in Supabase so Innova AI can safely save and separate each property&apos;s data.</p>
          <div className="database-instructions"><strong>In your Supabase project</strong><ol><li>Open <b>SQL Editor</b>.</li><li>Choose <b>New query</b>.</li><li>Copy and run the SQL from <code>supabase/migrations/20261004120000_create_hotel_workspaces.sql</code>.</li></ol></div>
          <p className="setup-footnote">Your hotel information stays private to the members of its workspace.</p>
          <form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
        </section>
      </main>
    );
  }

  if (membership) redirect("/dashboard");

  const error = params.error ? messages[params.error] : undefined;

  return (
    <main className="setup-shell">
      <section className="setup-card">
        <Link className="brand setup-brand" href="/"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="setup-step">YOUR WORKSPACE · STEP 1 OF 1</span>
        <h1>Tell us about your hotel</h1>
        <p className="setup-intro">We&apos;ll tailor your Innova workspace to your property and local settings.</p>
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        <form className="auth-form setup-form" action={createHotel}>
          <input type="hidden" name="returnTo" value="/setup" />
          <label htmlFor="name">Hotel or business name</label>
          <input id="name" name="name" type="text" placeholder="e.g. Haven House" minLength={2} maxLength={120} required />
          <div className="setup-fields-row">
            <div><label htmlFor="city">City</label><input id="city" name="city" type="text" placeholder="Nairobi" maxLength={100} required /></div>
            <div><label htmlFor="country">Country</label><input id="country" name="country" type="text" placeholder="Kenya" maxLength={100} required /></div>
          </div>
          <div className="setup-fields-row">
            <div><label htmlFor="timezone">Time zone</label><select id="timezone" name="timezone" defaultValue="Africa/Nairobi"><option value="Africa/Nairobi">East Africa Time (Nairobi)</option><option value="Africa/Kampala">East Africa Time (Kampala)</option><option value="Africa/Dar_es_Salaam">East Africa Time (Dar es Salaam)</option><option value="Africa/Kigali">Central Africa Time (Kigali)</option><option value="Africa/Johannesburg">South Africa Standard Time</option><option value="Europe/London">United Kingdom (London)</option><option value="America/New_York">Eastern Time (New York)</option><option value="UTC">UTC</option></select></div>
            <div><label htmlFor="currency">Currency</label><select id="currency" name="currency" defaultValue="KES"><option value="KES">KES · Kenyan shilling</option><option value="UGX">UGX · Ugandan shilling</option><option value="TZS">TZS · Tanzanian shilling</option><option value="RWF">RWF · Rwandan franc</option><option value="ZAR">ZAR · South African rand</option><option value="NGN">NGN · Nigerian naira</option><option value="GHS">GHS · Ghanaian cedi</option><option value="USD">USD · US dollar</option><option value="GBP">GBP · British pound</option><option value="EUR">EUR · Euro</option></select></div>
          </div>
          <button className="primary-button auth-submit" type="submit">Create hotel workspace <span>→</span></button>
        </form>
        <p className="setup-footnote">You can invite your team and add more properties later.</p>
        <form className="setup-signout" action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
      </section>
    </main>
  );
}
