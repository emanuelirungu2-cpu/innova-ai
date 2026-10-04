import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = request.nextUrl.searchParams.get("type");
  const invitationId = request.nextUrl.searchParams.get("invitation");

  if ((code || tokenHash) && isSupabaseConfigured()) {
    const supabase = await createClient();
    const authResult = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : otpType && ["signup", "magiclink", "invite", "recovery", "email", "email_change"].includes(otpType)
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType as EmailOtpType })
        : { error: new Error("Invalid authentication link") };
    const { error } = authResult;
    if (!error) {
      if (invitationId && /^[0-9a-f-]{36}$/i.test(invitationId)) {
        const { data: hotelId, error: invitationError } = await supabase.rpc("claim_hotel_invitation", {
          p_invitation_id: invitationId,
        });
        if (invitationError || !hotelId) {
          console.error("Hotel invitation claim failed", { code: invitationError?.code ?? "unknown" });
          return NextResponse.redirect(new URL("/login?error=invite-link-invalid", request.url));
        }
        const response = NextResponse.redirect(new URL("/dashboard", request.url));
        response.cookies.set("innova_workspace_id", hotelId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
        return response;
      }
      return NextResponse.redirect(new URL("/setup", request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
}
