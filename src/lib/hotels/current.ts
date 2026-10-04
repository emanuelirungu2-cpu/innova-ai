import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentHotel() {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/login");

  if (typeof authData.claims.sub !== "string") redirect("/login");

  const { data: memberships, error: membershipError } = await supabase
    .from("hotel_members")
    .select("hotel_id, role")
    .eq("user_id", authData.claims.sub);

  if (membershipError) redirect("/setup?error=database");
  if (!memberships?.length) redirect("/setup");

  const activeWorkspaceId = (await cookies()).get("innova_workspace_id")?.value;
  const membership = memberships.find((item) => item.hotel_id === activeWorkspaceId) ?? memberships[0];

  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select("id, name, city, country, timezone, currency")
    .eq("id", membership.hotel_id)
    .single();

  if (hotelError || !hotel) redirect("/setup?error=database");
  const { data: workspaceHotels, error: workspaceError } = await supabase
    .from("hotels")
    .select("id, name, city")
    .in("id", memberships.map((item) => item.hotel_id))
    .order("created_at");
  if (workspaceError) redirect("/setup?error=database");
  const workspaces = memberships.flatMap((item) => {
    const workspace = (workspaceHotels ?? []).find((hotelItem) => hotelItem.id === item.hotel_id);
    return workspace ? [{ ...workspace, role: item.role }] : [];
  });

  return { supabase, hotel, userId: authData.claims.sub, userRole: membership.role, claims: authData.claims, workspaces };
}
