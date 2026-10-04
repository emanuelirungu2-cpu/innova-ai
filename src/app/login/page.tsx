import Link from "next/link";
import { sendSignInLink, signIn } from "@/app/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const errorMessages: Record<string, string> = {
  "missing-fields": "Enter your email and password to continue.",
  "sign-in": "We couldn’t sign you in with those details. Check them and try again.",
  "email-not-confirmed": "Confirm your email using the link Supabase sent you, then try signing in again.",
  "account-disabled": "This account is currently disabled. Contact the project administrator.",
  "rate-limited": "There have been too many sign-in attempts. Wait a few minutes, then try again.",
  connection: "Innova AI couldn’t reach Supabase. Check your internet connection and that the VS Code development server is running.",
  confirmation: "That confirmation link may have expired. Please sign in or create a new account.",
  setup: "Connect your Supabase project to enable sign-in. Add the project URL and publishable key to .env.local, then restart the app.",
  "invalid-email": "Enter a valid email address.",
  "sign-in-link": "We couldn’t send a sign-in link. Check your email settings and try again.",
  "invite-link-invalid": "That invitation link has expired or has already been used. Ask the workspace owner for a new invitation.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="Innova AI home"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <p className="eyebrow auth-eyebrow">HOSPITALITY, IN HARMONY</p>
        <h1>Welcome back</h1>
        <p className="auth-intro">Sign in to manage your property and welcome your guests.</p>
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        {params.message === "check-email" && <p className="form-message success-message" role="status">Check your inbox to confirm your email, then sign in.</p>}
        {params.message === "sign-in-link-sent" && <p className="form-message success-message" role="status">If an account exists for that email, a secure sign-in link is on its way.</p>}
        {!isSupabaseConfigured() && !error && <p className="form-message setup-message">Connect your Supabase project to turn on sign-in.</p>}
        <form className="auth-form" action={signIn}>
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@yourhotel.com" required />
          <div className="password-label"><label htmlFor="password">Password</label><span>Use your account password</span></div>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
          <button className="primary-button auth-submit" type="submit">Sign in <span>→</span></button>
        </form>
        <div className="auth-divider"><span>OR</span></div>
        <form className="auth-form magic-link-form" action={sendSignInLink}>
          <label htmlFor="linkEmail">Sign in with an email link</label>
          <input id="linkEmail" name="email" type="email" autoComplete="email" placeholder="you@yourhotel.com" required />
          <button className="secondary-button auth-submit" type="submit">Email me a sign-in link</button>
        </form>
        <p className="auth-switch">New to Innova AI? <Link href="/signup">Create an account</Link></p>
        <p className="auth-footnote">Secure access for your hospitality team.</p>
      </section>
    </main>
  );
}
