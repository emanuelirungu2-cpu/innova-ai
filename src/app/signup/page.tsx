import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const errorMessages: Record<string, string> = {
  "missing-fields": "Complete each field to create your account.",
  "weak-password": "That password doesn’t meet your project’s security requirements. Try a longer password with a mix of letters, numbers, and symbols.",
  "email-exists": "An account may already exist for this email. Try signing in instead.",
  "email-delivery": "Supabase’s default email service only sends to addresses in your Supabase organization. Try an organization member’s email, or configure custom SMTP before inviting other users.",
  "invalid-email": "Supabase rejected that email address. Check the address and avoid example or test domains.",
  "signups-disabled": "New sign-ups are disabled in Supabase. Enable sign-ups in your project’s authentication settings.",
  connection: "This app could not reach Supabase. Start the app from the VS Code terminal and use the URL it prints. Check that your computer is online and that the Supabase project is active.",
  "email-limited": "Supabase is temporarily limiting confirmation emails. Wait a minute, check your inbox, then try again.",
  "email-disabled": "Email sign-up is disabled in Supabase. Enable the Email provider in your project’s authentication settings.",
  "project-key": "Supabase rejected the project key. Check that .env.local contains the Publishable key from this same project, then restart the app.",
  "sign-up": "We couldn’t create your account. Check your details and try again.",
  setup: "Connect your Supabase project to enable account creation. Add the project URL and publishable key to .env.local, then restart the app.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="Innova AI home"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <p className="eyebrow auth-eyebrow">YOUR HOSPITALITY, CONNECTED</p>
        <h1>Create your account</h1>
        <p className="auth-intro">Start bringing your hotel operations together.</p>
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        {!isSupabaseConfigured() && !error && <p className="form-message setup-message">Connect your Supabase project to turn on account creation.</p>}
        <form className="auth-form" action={signUp}>
          <label htmlFor="fullName">Your name</label>
          <input id="fullName" name="fullName" type="text" autoComplete="name" placeholder="Nia Kamau" minLength={2} required />
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@yourhotel.com" required />
          <label htmlFor="password">Create a password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required />
          <button className="primary-button auth-submit" type="submit">Create account <span>→</span></button>
        </form>
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
        <p className="auth-footnote">By continuing, you agree to use Innova AI for your hospitality business.</p>
      </section>
    </main>
  );
}
