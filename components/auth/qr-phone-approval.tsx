"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ApprovalData = { id: string; approvalSecret: string };

export function QrPhoneApproval({ email }: { email: string }) {
  const [requestData, setRequestData] = useState<ApprovalData | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const id = params.get("id");
    const approvalSecret = params.get("secret");
    window.history.replaceState(null, "", window.location.pathname);
    if (!id || !approvalSecret) {
      setError("This QR code is incomplete. Scan a new one.");
      return;
    }

    let cancelled = false;
    const credentials = { id, approvalSecret };
    async function inspect() {
      try {
        const response = await fetch("/api/qr-login/inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Could not read this QR code.");
        setRequestData(credentials);
        setVerificationCode(data.verificationCode);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not read this QR code.");
      }
    }
    void inspect();
    return () => { cancelled = true; };
  }, []);

  async function approve() {
    if (!requestData || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/qr-login/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Approval failed.");
      setApproved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval failed.");
    } finally {
      setLoading(false);
    }
  }

  if (approved) return <p className="mt-4 text-sm text-success">Desktop sign-in approved. You can close this page.</p>;

  return (
    <div className="mt-4 space-y-4 text-sm">
      {error ? <p role="alert" className="text-destructive">{error}</p> : !requestData ? (
        <p className="text-muted-foreground">Checking the QR code…</p>
      ) : (
        <>
          <p>Signed in as <strong>{email}</strong>.</p>
          <p>Only approve if you started sign-in on a desktop in front of you. Check that its code matches:</p>
          <p className="rounded-lg border border-border bg-secondary/50 py-3 text-center text-2xl font-bold font-mono tracking-widest">
            {verificationCode}
          </p>
          <Button type="button" className="w-full" loading={loading} onClick={approve}>
            Approve desktop sign-in
          </Button>
        </>
      )}
    </div>
  );
}
