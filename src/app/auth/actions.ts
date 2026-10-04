"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signIn(formData: FormData) {
  const email = formString(formData, "email").trim();
  const password = formString(formData, "password");

  if (!email || !password) redirect("/login?error=missing-fields");
  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const code = error.code?.toLowerCase() ?? "unknown";
    console.error("Supabase sign-in failed", { code, status: error.status });
    if (code.includes("email_not_confirmed")) redirect("/login?error=email-not-confirmed");
    if (code.includes("user_banned")) redirect("/login?error=account-disabled");
    if (code.includes("rate") || error.status === 429) redirect("/login?error=rate-limited");
    if (error.status === 0) redirect("/login?error=connection");
    redirect("/login?error=sign-in");
  }
  redirect("/setup");
}

export async function sendSignInLink(formData: FormData) {
  const email = formString(formData, "email").trim();
  if (!email || email.length > 254) redirect("/login?error=invalid-email");
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const supabase = await createClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl}/auth/callback` },
  });
  if (error) {
    console.error("Supabase sign-in link request failed", { code: error.code ?? "unknown", status: error.status });
    if (error.status === 0) redirect("/login?error=connection");
    if (error.status === 429 || error.code?.toLowerCase().includes("rate")) redirect("/login?error=rate-limited");
    redirect("/login?error=sign-in-link");
  }
  redirect("/login?message=sign-in-link-sent");
}

export async function signUp(formData: FormData) {
  const fullName = formString(formData, "fullName").trim();
  const email = formString(formData, "email").trim();
  const password = formString(formData, "password");

  if (!fullName || !email || !password) redirect("/signup?error=missing-fields");
  if (password.length < 8) redirect("/signup?error=weak-password");
  if (!isSupabaseConfigured()) redirect("/signup?error=setup");

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    console.error("Supabase sign-up failed", {
      code: error.code ?? "unknown",
      status: error.status,
    });

    const code = error.code?.toLowerCase() ?? "";
    if (code.includes("weak_password") || code.includes("password_too_short")) {
      redirect("/signup?error=weak-password");
    }
    if (
      code.includes("already") ||
      code.includes("registered") ||
      code === "email_exists"
    ) {
      redirect("/signup?error=email-exists");
    }
    if (code === "email_address_not_authorized") {
      redirect("/signup?error=email-delivery");
    }
    if (code === "email_address_invalid") redirect("/signup?error=invalid-email");
    if (code === "signup_disabled") redirect("/signup?error=signups-disabled");
    if (code.includes("rate") || error.status === 429) {
      redirect("/signup?error=email-limited");
    }
    if (code.includes("provider_disabled")) {
      redirect("/signup?error=email-disabled");
    }
    if (error.status === 0) redirect("/signup?error=connection");
    if (error.status === 401) redirect("/signup?error=project-key");
    redirect("/signup?error=sign-up");
  }
  if (!data.session) redirect("/login?message=check-email");
  redirect("/setup");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
