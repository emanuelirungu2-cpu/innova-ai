import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: authData } = await supabase.auth.getClaims();
  if (process.env.ENFORCE_SUBSCRIPTIONS === "true" && authData?.claims && typeof authData.claims.sub === "string") {
    const path = request.nextUrl.pathname;
    const openPaths = ["/", "/login", "/signup", "/setup", "/billing", "/api/stripe/webhook"];
    if (!openPaths.includes(path) && !path.startsWith("/auth/")) {
      const { data: memberships } = await supabase.from("hotel_members")
        .select("hotel_id").eq("user_id", authData.claims.sub);
      if (memberships?.length) {
        const selectedId = request.cookies.get("innova_workspace_id")?.value;
        const workspace = memberships.find((item) => item.hotel_id === selectedId) ?? memberships[0];
        const { data: active } = await supabase.rpc("has_active_workspace_subscription", {
          p_hotel_id: workspace.hotel_id,
        });
        if (!active) {
          const billingResponse = NextResponse.redirect(new URL("/billing?required=1", request.url));
          response.cookies.getAll().forEach((cookie) => billingResponse.cookies.set(cookie));
          return billingResponse;
        }
      }
    }
  }
  return response;
}
