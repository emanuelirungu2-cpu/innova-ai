import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { inviteTeamMember, removeTeamMember, revokeTeamInvitation } from "@/app/team/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const errors: Record<string, string> = {
  "invalid-invite": "Check the invitee’s email and role.",
  "team-access-denied": "Only an owner, admin, or manager can manage team access.",
  "role-access-denied": "Only an owner or admin can invite another admin.",
  "invite-exists": "There is already a pending invitation for that email.",
  "team-database-not-ready": "Run the Innova AI and billing database migration, then refresh this page.",
  "invite-email-failed": "The invitation couldn’t be emailed. Check Supabase email settings and try again.",
  "invite-failed": "We couldn’t update the invitation. Refresh and try again.",
  "invalid-member": "Choose a valid team member.",
  "remove-self": "You can’t remove your own access from here.",
  "member-remove-failed": "We couldn’t remove that member. An owner cannot be removed.",
};
const messages: Record<string, string> = {
  "invite-sent": "Invitation email sent. It expires in seven days.",
  "invite-revoked": "Invitation revoked.",
  "member-removed": "Team member removed from this property.",
};

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel, userId, userRole } = await getCurrentHotel();
  if (!["owner", "admin", "manager"].includes(userRole)) {
    return <main className="setup-shell"><section className="setup-card"><h1>Team access is limited</h1><p className="setup-intro">Ask a property owner, admin, or manager to manage workspace access.</p><Link className="text-action" href="/dashboard">Return to overview →</Link></section></main>;
  }
  const [{ data: members, error: membersError }, { data: invitations, error: invitesError }] = await Promise.all([
    supabase.from("hotel_members").select("user_id, email, role, created_at").eq("hotel_id", hotel.id).order("created_at"),
    supabase.from("hotel_invitations").select("id, email, role, created_at, expires_at").eq("hotel_id", hotel.id).eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  const formatDate = (date: string) => displayDate(date);

  return <main className="module-shell">
    <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/reservations">Reservations</Link><Link href="/workspaces">Properties</Link><Link className="selected" href="/team">Team</Link><Link href="/billing">Billing</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
    <section className="module-content team-content"><div className="module-title-row"><div><p className="eyebrow">WORKSPACE ACCESS</p><h1>Team</h1><p className="module-subtitle">Invite people and choose what they can do in {hotel.name}.</p></div><span className="module-count">{members?.length ?? 0} members</span></div>
      {params.error && errors[params.error] && <p className="form-message error-message" role="alert">{errors[params.error]}</p>}
      {params.message && messages[params.message] && <p className="form-message success-message" role="status">{messages[params.message]}</p>}
      {(membersError || invitesError) ? <div className="module-card"><h2>Team tools need one database setup step</h2><p>Run the latest Innova AI and billing migration in Supabase SQL Editor, then refresh this page.</p></div> : <div className="team-grid">
        <section className="module-card team-invite-card"><div className="module-card-heading"><h2>Invite a team member</h2><p>They’ll receive an email link to sign in and join this property.</p></div><form className="module-form" action={inviteTeamMember}><label htmlFor="teamEmail">Email address</label><input id="teamEmail" name="email" type="email" maxLength={254} placeholder="name@example.com" required /><label htmlFor="teamRole">Role</label><select id="teamRole" name="role" defaultValue="staff"><option value="staff">Staff · day-to-day operations</option><option value="manager">Manager · operations and expenses</option>{["owner", "admin"].includes(userRole) && <option value="admin">Admin · workspace administration</option>}</select><button className="primary-button module-submit" type="submit">＋ Send invitation</button><small className="field-hint">Managers can invite staff or managers. Only owners and admins can invite admins.</small></form></section>
        <div className="team-lists"><section className="module-card"><div className="module-card-heading"><h2>Members</h2><p>People with access to this property.</p></div>{!members?.length ? <p className="report-hint">No members found.</p> : <div className="team-member-list">{members.map((member) => { const mayRemove = member.user_id !== userId && member.role !== "owner" && (["owner", "admin"].includes(userRole) || member.role === "staff"); return <article className="team-row" key={member.user_id}><span className="guest-avatar blue">{(member.email ?? "?").slice(0, 1).toUpperCase()}</span><div className="room-main"><strong>{member.email ?? "Workspace member"}{member.user_id === userId ? " · You" : ""}</strong><small>{member.role} · joined {formatDate(member.created_at)}</small></div>{mayRemove && <form action={removeTeamMember}><input type="hidden" name="memberId" value={member.user_id} /><button className="text-action cancel-action" type="submit">Remove</button></form>}</article>; })}</div>}</section>
          <section className="module-card"><div className="module-card-heading"><h2>Pending invitations</h2><p>Links are valid for seven days.</p></div>{!invitations?.length ? <p className="report-hint">No pending invitations.</p> : <div className="team-member-list">{invitations.map((invite) => <article className="team-row" key={invite.id}><span className="room-icon">✉</span><div className="room-main"><strong>{invite.email}</strong><small>{invite.role} · sent {formatDate(invite.created_at)} · expires {formatDate(invite.expires_at)}</small></div><form action={revokeTeamInvitation}><input type="hidden" name="invitationId" value={invite.id} /><button className="text-action cancel-action" type="submit">Revoke</button></form></article>)}</div>}</section>
        </div>
      </div>}
      <p className="report-footnote">Roles are enforced on the server and in Supabase row-level security for this property.</p>
    </section>
  </main>;
}
