"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { login } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/utils";
import { Mail, MailCheck } from "lucide-react";
import { QrDesktopLogin } from "@/components/auth/qr-desktop-login";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);
  const [confirmationLoading, setConfirmationLoading] = useState(false);
  const [showQrLogin, setShowQrLogin] = useState(false);
  const [lastEmailSentAt, setLastEmailSentAt] = useState(0);
  const [secondsUntilResend, setSecondsUntilResend] = useState(0);

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });
  const emailField = register("email");

  useEffect(() => {
    const callbackError = new URLSearchParams(window.location.search).get("error");
    if (callbackError === "invalid_link") {
      toast.error("That sign-in link is unavailable. Request a new one and open the newest link in this same browser.");
    } else if (callbackError === "verification_unavailable") {
      toast.error("The sign-in service did not finish checking that link. Check your connection and request a fresh link in this browser.");
    }
  }, []);

  useEffect(() => {
    if (!lastEmailSentAt) return;
    const update = () => setSecondsUntilResend(
      Math.max(0, Math.ceil((lastEmailSentAt + 60_000 - Date.now()) / 1000))
    );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [lastEmailSentAt]);

  function callbackUrl() {
    const nextPath = safeRedirectPath(
      new URLSearchParams(window.location.search).get("next")
    );
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", nextPath);
    return url.toString();
  }

  async function onSubmit(values: LoginInput) {
    setLoading(true);
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set(
      "next",
      safeRedirectPath(new URLSearchParams(window.location.search).get("next"))
    );

    try {
      const result = await login(formData);
      if (result && !result.success) {
        toast.error(result.error);
        setConfirmationNeeded("needsConfirmation" in result && result.needsConfirmation === true);
        setLoading(false);
      }
    } catch {
      toast.error("Could not reach the sign-in service. Try again in a moment.");
      setLoading(false);
    }
    // On success, server action redirects → no need to do anything
  }

  async function sendMagicLink() {
    if (secondsUntilResend > 0) return;
    const emailIsValid = await trigger("email");
    if (!emailIsValid) return;

    setMagicLinkLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: getValues("email"),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: callbackUrl(),
        },
      });
      if (error) {
        toast.error(error.message);
      } else {
        setMagicLinkSent(true);
        setLastEmailSentAt(Date.now());
        toast.success("Sign-in link sent");
      }
    } catch {
      toast.error("Could not reach the email service. Try again in a moment.");
    } finally {
      setMagicLinkLoading(false);
    }
  }

  async function resendConfirmation() {
    if (secondsUntilResend > 0) return;
    const emailIsValid = await trigger("email");
    if (!emailIsValid) return;

    setConfirmationLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: getValues("email"),
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) {
        toast.error(`Could not resend confirmation: ${error.message}`);
      } else {
        setLastEmailSentAt(Date.now());
        toast.success("Confirmation email requested. Check your inbox and spam folder.");
      }
    } catch {
      toast.error("Could not reach the email service. Try again in a moment.");
    } finally {
      setConfirmationLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Welcome back</h2>
        <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            error={!!errors.email}
            {...emailField}
            onChange={(event) => {
              emailField.onChange(event);
              setMagicLinkSent(false);
              setConfirmationNeeded(false);
            }}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={!!errors.password}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {magicLinkSent ? (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm space-y-2">
          <div className="flex items-start gap-2">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p>Check your email and open the sign-in link on this device.</p>
          </div>
          <Button type="button" variant="outline" className="w-full" loading={magicLinkLoading}
            disabled={secondsUntilResend > 0} onClick={sendMagicLink}>
            {secondsUntilResend > 0 ? `Resend sign-in link in ${secondsUntilResend}s` : "Resend sign-in link"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          size="lg"
          loading={magicLinkLoading}
          onClick={sendMagicLink}
        >
          <Mail className="h-4 w-4" />
          Email me a sign-in link
        </Button>
      )}

      {confirmationNeeded && (
        <Button type="button" variant="outline" className="mt-3 w-full"
          loading={confirmationLoading} disabled={secondsUntilResend > 0}
          onClick={resendConfirmation}>
          {secondsUntilResend > 0 ? `Resend confirmation in ${secondsUntilResend}s` : "Resend confirmation email"}
        </Button>
      )}

      <Button type="button" variant="ghost" className="mt-3 w-full"
        onClick={() => setShowQrLogin((value) => !value)}>
        {showQrLogin ? "Hide phone sign-in" : "Sign in with phone QR"}
      </Button>
      {showQrLogin && <QrDesktopLogin />}

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Access is managed by your administrator.
      </p>
    </div>
  );
}
