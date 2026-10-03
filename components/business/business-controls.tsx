"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, RotateCcw, UserPlus, X } from "lucide-react";
import { onboardCoachBusiness, cancelCoachBusinessInvitation, changeCoachBusinessStatus, addCoachBusinessClient } from "@/lib/actions/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CoachBusinessMetric } from "@/lib/business/schema";
import { invitationFailureMessage, type CoachInvitation } from "@/lib/business/invitations";

export function NewCoachBusiness({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault(); if (disabled || busy) return; setBusy(true); setError(""); setSaved("");
    try {
      const result = await onboardCoachBusiness({ name, email });
      if (!result.success) { setError(result.error); return; }
      if (result.data.state === "email_failed") setError(invitationFailureMessage(result.data.failure));
      else {
        setName(""); setEmail("");
        setSaved(result.data.state === "created" ? "Verified coach added on the free testing plan. No invitation email was needed for this existing account." : "Invitation email requested. The coach must accept the link and finish setup before their business opens. Check the pending invitation below.");
      }
      router.refresh();
    } catch { setError("Could not reach PowerBuild. Try again."); } finally { setBusy(false); }
  }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">Business name<Input disabled={disabled || busy} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="Coach's business name" /></label>
      <label className="space-y-1.5 text-sm font-medium">Coach email<Input disabled={disabled || busy} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} required placeholder="coach@example.com" autoComplete="off" /></label>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">New coaches receive an email invitation and choose a password before their business opens. Existing verified accounts are added immediately. Public signup stays closed.</p>
    <details className="text-xs leading-relaxed text-muted-foreground"><summary className="cursor-pointer font-medium">Email delivery during free testing</summary><p className="mt-2">If you use Supabase&apos;s default test sender, it only sends to Supabase project team addresses and has a small hourly limit. Inviting other coaches requires a custom SMTP sender; the app does not upgrade your plan. <a href="https://supabase.com/docs/guides/auth/auth-smtp" target="_blank" rel="noreferrer" className="underline underline-offset-2">Email setup guide</a></p></details>
    <Button type="submit" disabled={busy || disabled}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Invite or add coach</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{saved}</p>}
  </form>;
}

function PendingInvitation({ invitation, disabled }: { invitation: CoachInvitation; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const expired = new Date(invitation.expires_at).getTime() <= Date.now();
  const label = expired ? "Invitation expired" : invitation.status === "email_failed" ? "Email not sent" : invitation.status === "sending" ? "Sending status unconfirmed" : "Awaiting acceptance";
  async function act(cancel: boolean) {
    if (disabled || busy) return;
    setBusy(true); setMessage("");
    try {
      if (cancel) {
        const result = await cancelCoachBusinessInvitation(invitation.id);
        setMessage(result.success ? "Invitation cancelled. This account cannot open a coach business with it." : result.error);
      } else {
        const result = await onboardCoachBusiness({ name: invitation.name, email: invitation.email });
        setMessage(!result.success ? result.error : result.data.state === "email_failed" ? invitationFailureMessage(result.data.failure)
          : result.data.state === "created" ? "Verified coach added. Their business is ready." : "Invitation email requested again. Have the coach open only the newest invitation link.");
      }
      router.refresh();
    } catch { setMessage("Could not reach PowerBuild. Try again."); } finally { setBusy(false); }
  }
  return <article className="space-y-3 rounded-xl border border-border bg-background/50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-medium">{invitation.name}</h3><p className="break-all text-xs text-muted-foreground">{invitation.email}</p></div><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">{label}</span></div>
    {invitation.failure_code && <p className="text-xs leading-relaxed text-muted-foreground">{invitationFailureMessage(invitation.failure_code)}</p>}
    <p className="text-xs text-muted-foreground">No business access until the verified coach accepts. Email links expire independently; resend if a link no longer works.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => void act(false)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Resend invitation</Button><Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void act(true)}><X className="h-3.5 w-3.5" />Cancel</Button></div>
    {message && <p role="status" className="text-xs leading-relaxed">{message}</p>}
  </article>;
}

export function PendingCoachInvitations({ invitations, disabled = false }: { invitations: CoachInvitation[]; disabled?: boolean }) {
  if (!invitations.length) return null;
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Pending coach invitations <span className="ml-1 text-sm font-normal text-muted-foreground">{invitations.length}</span></h2><div className="grid gap-3 md:grid-cols-2">{invitations.map((invitation) => <PendingInvitation key={`${invitation.id}-${invitation.last_attempt_at}`} invitation={invitation} disabled={disabled} />)}</div></section>;
}

export function BusinessStatusControl({ business, disabled = false }: { business: CoachBusinessMetric; disabled?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(business.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form onSubmit={async (event) => {
    event.preventDefault(); if (disabled) return; setBusy(true); setMessage("");
    try {
      const result = await changeCoachBusinessStatus(business.id, status);
      if (!result.success) { setMessage(result.error); return; }
      setMessage("Business access updated."); router.refresh();
    } catch { setMessage("Could not reach PowerBuild. Try again."); } finally { setBusy(false); }
  }} className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm font-medium" htmlFor={`status-${business.id}`}>Business access</label>
      <select disabled={disabled} id={`status-${business.id}`} value={status} onChange={(e) => setStatus(e.target.value as CoachBusinessMetric["status"])} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
        <option value="trial">Testing</option><option value="active">Active</option><option value="paused">Paused</option>
      </select>
      <Button type="submit" variant="outline" disabled={disabled || busy || status === business.status}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save access</Button>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">Pausing stops coach changes and Tommy requests. Clients keep their saved plans and workout history. Every status uses the free testing plan.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}

export function AddBusinessClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form className="space-y-3" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await addCoachBusinessClient(email);
      if (!result.success) { setMessage(result.error); return; }
      setEmail(""); setMessage("Client added. You can now build and assign their program."); router.refresh();
    } catch { setMessage("Could not reach PowerBuild. Try again."); } finally { setBusy(false); }
  }}>
    <label className="block space-y-1.5 text-sm font-medium">Client account email<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} placeholder="client@example.com" autoComplete="off" /></label>
    <p className="text-xs leading-relaxed text-muted-foreground">Ask the PowerBuild owner to invite this client first. After they accept the email invitation, add their verified account here. Accounts that belong to another coach business cannot be moved here.</p>
    <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Add client</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
