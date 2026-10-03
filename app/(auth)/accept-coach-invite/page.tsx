"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { withDeadline } from "@/lib/async/deadline";
import { coachInviteFragment } from "@/lib/business/invitations";
import { acceptCoachBusinessInvitation } from "@/lib/actions/business";
import { updatePasswordSchema } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const invitationView = z.object({ name: z.string(), status: z.string(), expiresAt: z.string(), businessId: z.string().uuid().nullable() }).strict();

export default function AcceptCoachInvitePage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [checking, setChecking] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // StrictMode's setup/cleanup replay must not consume a one-use link twice.
  const sessionSetup = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    if (!sessionSetup.current) {
      sessionSetup.current = (async () => {
        const query = new URLSearchParams(window.location.search);
        const fragment = coachInviteFragment(window.location.hash);
        // Strip credentials before any navigation or rendering of their values.
        if (window.location.hash || query.has("error")) window.history.replaceState(null, "", "/accept-coach-invite");
        if (fragment.state === "invalid" || query.has("error")) throw new Error("This invitation link is unavailable. Ask the PowerBuild owner to resend it and open the newest email link.");
        if (fragment.state === "session") {
          const { error: sessionError } = await withDeadline(() => supabase.auth.setSession({ access_token: fragment.access_token, refresh_token: fragment.refresh_token }), 12_000);
          if (sessionError) throw new Error("This invitation link is unavailable. Ask the PowerBuild owner to resend it.");
        }
      })();
    }
    async function check() {
      let safeMessage = "Could not check your invitation. Check your connection and reload.";
      try {
        await sessionSetup.current;
        safeMessage = "Open the newest coach invitation email link to verify your account first.";
        const { data: { user }, error: authError } = await withDeadline(() => supabase.auth.getUser(), 12_000);
        if (authError || !user) throw new Error("Open the newest coach invitation email link to verify your account first.");
        safeMessage = "No active coach invitation is available for this account. Ask the PowerBuild owner to check or resend it.";
        const { data, error: invitationError } = await withDeadline(async () => await supabase.rpc("get_my_coach_business_invitation"), 12_000);
        if (invitationError || !data) throw new Error("No active coach invitation is available for this account. Ask the PowerBuild owner to check or resend it.");
        const invitation = invitationView.parse(data);
        if (active) { setBusinessName(invitation.name); setAccepted(invitation.status === "accepted"); setReady(true); }
      } catch {
        if (active) setError(safeMessage);
      } finally { if (active) setChecking(false); }
    }
    void check();
    return () => { active = false; };
  }, [supabase]);

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    const parsed = updatePasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your password"); return; }
    setBusy(true); setError("");
    try {
      const { error: passwordError } = await withDeadline(() => supabase.auth.updateUser({ password: parsed.data.password }), 12_000);
      // A retry after a successful password write and interrupted membership
      // completion should continue with that already-set password.
      if (passwordError && passwordError.code !== "same_password") { setError(passwordError.code === "weak_password" ? "Choose a stronger password." : "Could not set your password. Check the invitation session and try again."); return; }
      const result = await acceptCoachBusinessInvitation();
      if (!result.success) { setError(result.error); return; }
      setPassword(""); setConfirmPassword("");
      router.replace("/admin/business"); router.refresh();
    } catch { setError("Could not complete coach setup. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (checking) return <p className="py-6 text-center text-sm text-muted-foreground" role="status">Checking your coach invitation…</p>;
  if (!ready) return <div className="space-y-4"><h2 className="text-xl font-bold">Coach invitation unavailable</h2><p role="alert" className="text-sm leading-relaxed text-muted-foreground">{error}</p><Button asChild variant="outline" className="w-full"><Link href="/login">Back to sign in</Link></Button></div>;
  if (accepted) return <div className="space-y-4"><h2 className="text-xl font-bold">Your coach business is ready</h2><p className="text-sm text-muted-foreground">{businessName}</p><Button asChild className="w-full"><Link href="/admin/business">Open your business</Link></Button></div>;
  return <div className="space-y-5"><header><h2 className="text-xl font-bold">Set up your coach account</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Choose a password to open {businessName}. Your business uses the free testing plan.</p></header><form onSubmit={finish} className="space-y-4">
    <label className="block space-y-1.5 text-sm font-medium">Password<Input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} required /></label>
    <label className="block space-y-1.5 text-sm font-medium">Confirm password<Input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={busy} required /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" loading={busy}>Accept and open my business</Button>
  </form></div>;
}
