import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { updateHotelSettings } from "@/app/setup/actions";
import { updateAccountSettings } from "@/app/setup/actions";

type SettingsPageProps = {
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
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

  const { data: hotel, error } = await supabase
    .from("hotels")
    .select("id, name, city, country, timezone, currency")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !hotel) redirect("/dashboard");

  const params = await searchParams;
  const metadata = authData.claims.user_metadata as
  | Record<string, unknown>
  | undefined;

const accountName =
  (typeof metadata?.full_name === "string" && metadata.full_name) ||
  (typeof authData.claims.email === "string"
    ? authData.claims.email.split("@")[0]
    : "");

const accountEmail =
  typeof authData.claims.email === "string" ? authData.claims.email : "";
  const message = params.saved
    ? "Property settings saved."
    : params.error === "invalid-details"
      ? "Please check the details and try again."
      : params.error === "save-failed"
        ? "Could not save the settings. Check that you are an owner or admin."
        : null;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <a
          href="/dashboard"
          className="text-sm text-emerald-700 hover:underline"
        >
          ← Back to dashboard
        </a>

        <h1 className="mt-6 text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">
          Update the details and local preferences for this property.
        </p>

        {message && (
          <p className="mt-5 rounded-lg bg-white p-4 text-gray-800" role="status">
            {message}
          </p>
        )}

        <form
          action={updateHotelSettings}
          className="mt-6 space-y-5 rounded-xl border border-gray-200 bg-white p-6"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            Property settings
          </h2>

          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Hotel or business name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={hotel.name}
              required
              minLength={2}
              maxLength={120}
              className="w-full rounded-lg border border-gray-300 p-3"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="mb-1 block text-sm font-medium">
                City
              </label>
              <input
                id="city"
                name="city"
                defaultValue={hotel.city}
                required
                minLength={2}
                maxLength={100}
                className="w-full rounded-lg border border-gray-300 p-3"
              />
            </div>

            <div>
              <label
                htmlFor="country"
                className="mb-1 block text-sm font-medium"
              >
                Country
              </label>
              <input
                id="country"
                name="country"
                defaultValue={hotel.country}
                required
                minLength={2}
                maxLength={100}
                className="w-full rounded-lg border border-gray-300 p-3"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="timezone"
                className="mb-1 block text-sm font-medium"
              >
                Time zone
              </label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={hotel.timezone}
                required
                className="w-full rounded-lg border border-gray-300 bg-white p-3"
              >
                <option value="Africa/Nairobi">Nairobi</option>
                <option value="Africa/Kampala">Kampala</option>
                <option value="Africa/Dar_es_Salaam">Dar es Salaam</option>
                <option value="Africa/Kigali">Kigali</option>
                <option value="Africa/Johannesburg">Johannesburg</option>
                <option value="Europe/London">London</option>
                <option value="America/New_York">New York</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="currency"
                className="mb-1 block text-sm font-medium"
              >
                Currency
              </label>
              <select
                id="currency"
                name="currency"
                defaultValue={hotel.currency}
                required
                className="w-full rounded-lg border border-gray-300 bg-white p-3"
              >
                <option value="KES">KES · Kenyan shilling</option>
                <option value="UGX">UGX · Ugandan shilling</option>
                <option value="TZS">TZS · Tanzanian shilling</option>
                <option value="RWF">RWF · Rwandan franc</option>
                <option value="ZAR">ZAR · South African rand</option>
                <option value="NGN">NGN · Nigerian naira</option>
                <option value="GHS">GHS · Ghanaian cedi</option>
                <option value="USD">USD · US dollar</option>
                <option value="GBP">GBP · British pound</option>
                <option value="EUR">EUR · Euro</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-5 py-3 font-medium text-white hover:bg-emerald-800"
          >
            Save property settings
          </button>
        </form>

        <form
  action={updateAccountSettings}
  className="mt-5 space-y-5 rounded-xl border border-gray-200 bg-white p-6"
>
  <h2 className="text-lg font-semibold text-gray-900">Account settings</h2>

  <div>
    <label htmlFor="full_name" className="mb-1 block text-sm font-medium">
      Your name
    </label>
    <input
      id="full_name"
      name="full_name"
      defaultValue={accountName}
      required
      minLength={2}
      maxLength={120}
      className="w-full rounded-lg border border-gray-300 p-3"
    />
  </div>

  <div>
    <label htmlFor="account_email" className="mb-1 block text-sm font-medium">
      Email address
    </label>
    <input
      id="account_email"
      name="email"
      type="email"
      defaultValue={accountEmail}
      required
      className="w-full rounded-lg border border-gray-300 p-3"
    />
    <p className="mt-2 text-sm text-gray-500">
      Changing your email requires confirmation.
    </p>
  </div>

  <button
    type="submit"
    className="rounded-lg bg-emerald-700 px-5 py-3 font-medium text-white hover:bg-emerald-800"
  >
    Save account settings
  </button>
</form>
      </div>
    </main>
  );
}