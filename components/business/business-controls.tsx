"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, UserPlus } from "lucide-react";
import { createCoachBusiness, changeCoachBusinessStatus, addCoachBusinessClient } from "@/lib/actions/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CoachBusinessMetric } from "@/lib/business/schema";

export function NewCoachBusiness({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault(); if (disabled) return; setBusy(true); setError(""); setSaved(false);
    try {
      const result = await createCoachBusiness({ name, email });
      if (!result.success) { setError(result.error); return; }
      setName(""); setEmail(""); setSaved(true); router.refresh();
    } catch { setError("Could not reach PowerBuild. Try again."); } finally { setBusy(false); }
  }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">Business name<Input disabled={disabled} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="Coach's business name" /></label>
      <label className="space-y-1.5 text-sm font-medium">Coach account email<Input disabled={disabled} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} required placeholder="coach@example.com" autoComplete="off" /></label>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">The coach signs up and verifies this email first. Onboarding gives that account its own business and coach workspace. No payment or temporary password is required.</p>
    <Button type="submit" disabled={busy || disabled}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add coach business</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">Business created on the free testing plan.</p>}
  </form>;
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
    <p className="text-xs leading-relaxed text-muted-foreground">Ask the client to sign up and verify their email first. Accounts that belong to another coach business cannot be moved here.</p>
    <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Add client</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
