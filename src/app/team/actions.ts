"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHotel } from "@/lib/hotels/current";
import { getSiteUrl } from "@/lib/site-url";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectError(error: string): never {
  redirect(`/team?error=${error}`);
}

export async function inviteTeamMember(formData: FormData) {
  const email = field(formData, "email").toLowerCase();
  const role = field(formData, "role");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !["admin", "manager", "staff"].includes(role)) {
    redirectError("invalid-invite");
  }
  const { supabase, hotel, userId, userRole } = await getCurrentHotel();
  if (!["owner", "admin", "manager"].includes(userRole)) redirectError("team-access-denied");
  if (role === "admin" && !["owner", "admin"].includes(userRole)) redirectError("role-access-denied");

  const { data: invite, error: insertError } = await supabase.from("hotel_invitations").insert({
    hotel_id: hotel.id,
    email,
    role,
    invited_by: userId,
  }).select("id").single();
  if (insertError || !invite) {
    console.error("Team invitation record failed", { code: insertError?.code ?? "unknown" });
    if (insertError?.code === "23505") redirectError("invite-exists");
    if (["42P01", "PGRST205"].includes(insertError?.code ?? "")) redirectError("team-database-not-ready");
    redirectError("invite-failed");
  }

  const siteUrl = getSiteUrl();
  const { error: emailError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl}/auth/callback?invitation=${encodeURIComponent(invite.id)}`,
    },
  });
  if (emailError) {
    await supabase.from("hotel_invitations").update({ status: "revoked" }).eq("id", invite.id).eq("hotel_id", hotel.id);
    console.error("Team invitation email failed", { code: emailError.code ?? "unknown", status: emailError.status });
    redirectError("invite-email-failed");
  }

  revalidatePath("/team");
  redirect("/team?message=invite-sent");
}

export async function revokeTeamInvitation(formData: FormData) {
  const invitationId = field(formData, "invitationId");
  if (!invitationId) redirectError("invalid-invite");
  const { supabase, hotel, userRole } = await getCurrentHotel();
  if (!["owner", "admin", "manager"].includes(userRole)) redirectError("team-access-denied");
  const { error } = await supabase.from("hotel_invitations")
    .update({ status: "revoked" }).eq("id", invitationId).eq("hotel_id", hotel.id).eq("status", "pending");
  if (error) {
    console.error("Invitation revocation failed", { code: error.code });
    redirectError("invite-failed");
  }
  revalidatePath("/team");
  redirect("/team?message=invite-revoked");
}

export async function removeTeamMember(formData: FormData) {
  const memberId = field(formData, "memberId");
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) redirectError("invalid-member");
  const { supabase, hotel, userRole, userId } = await getCurrentHotel();
  if (!["owner", "admin", "manager"].includes(userRole)) redirectError("team-access-denied");
  if (memberId === userId) redirectError("remove-self");
  const { error } = await supabase.from("hotel_members")
    .delete().eq("hotel_id", hotel.id).eq("user_id", memberId);
  if (error) {
    console.error("Team member removal failed", { code: error.code });
    redirectError("member-remove-failed");
  }
  revalidatePath("/team");
  redirect("/team?message=member-removed");
}
