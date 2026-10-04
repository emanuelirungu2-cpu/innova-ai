"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";

export async function switchWorkspace(formData: FormData) {
  const workspaceId = formData.get("workspaceId");
  if (typeof workspaceId !== "string" || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    redirect("/workspaces?error=invalid-workspace");
  }
  const { supabase, userId } = await getCurrentHotel();
  const { data: membership, error } = await supabase.from("hotel_members")
    .select("hotel_id").eq("hotel_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error || !membership) redirect("/workspaces?error=invalid-workspace");

  const cookieStore = await cookies();
  cookieStore.set("innova_workspace_id", membership.hotel_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
