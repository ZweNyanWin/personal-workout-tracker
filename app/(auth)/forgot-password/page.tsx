"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [secondsUntilResend, setSecondsUntilResend] = useState(0);

  useEffect(() => {
    if (!lastSentAt) return;
    const update = () => setSecondsUntilResend(
      Math.max(0, Math.ceil((lastSentAt + 60_000 - Date.now()) / 1000))
    );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [lastSentAt]);

  async function sendResetLink() {
    if (loading || secondsUntilResend > 0) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setSent(true);
        setLastSentAt(Date.now());
        toast.success("Password reset link requested");
      }
    } catch {
      toast.error("Could not reach the email service. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendResetLink();
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 text-success">
          <MailCheck className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a password reset link to <strong>{email}</strong>
        </p>
        <Button type="button" variant="outline" className="w-full" loading={loading}
          disabled={secondsUntilResend > 0} onClick={sendResetLink}>
          {secondsUntilResend > 0 ? `Resend reset link in ${secondsUntilResend}s` : "Resend reset link"}
        </Button>
        <Link href="/login" className="text-sm text-primary hover:underline block">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Reset password</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your email and we&apos;ll send a reset link
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
