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

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "invalid_link") {
      toast.error("That sign-in link is invalid or expired. Request a new one.");
    }
  }, []);

  async function onSubmit(values: LoginInput) {
    setLoading(true);
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set(
      "next",
      safeRedirectPath(new URLSearchParams(window.location.search).get("next"))
    );

    const result = await login(formData);
    if (result && !result.success) {
      toast.error(result.error);
      setLoading(false);
    }
    // On success, server action redirects → no need to do anything
  }

  async function sendMagicLink() {
    const emailIsValid = await trigger("email");
    if (!emailIsValid) return;

    setMagicLinkLoading(true);
    const nextPath = safeRedirectPath(
      new URLSearchParams(window.location.search).get("next")
    );
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: getValues("email"),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      toast.error(error.message);
    } else {
      setMagicLinkSent(true);
      toast.success("Sign-in link sent");
    }
    setMagicLinkLoading(false);
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
            {...register("email")}
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
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p>Check your email and open the sign-in link on this device.</p>
          </div>
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

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Access is managed by your administrator.
      </p>
    </div>
  );
}
