"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { withDeadline } from "@/lib/async/deadline";
import { recoverySessionState, type RecoverySessionState } from "@/lib/auth/recovery";
import {
  updatePasswordSchema,
  type UpdatePasswordInput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionState, setSessionState] = useState<RecoverySessionState>("unavailable");
  const [callbackFailed, setCallbackFailed] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const saving = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function checkSession() {
      const callbackError = new URLSearchParams(window.location.search).get("error");
      const failed = callbackError === "invalid_link" || callbackError === "verification_unavailable";
      setCallbackFailed(failed);
      try {
        // This read-only UI check has a deadline even if the SDK is still
        // waiting for a session refresh. Late results cannot replace a retry.
        const result = failed
          ? { data: { user: null }, error: null }
          : await withDeadline(() => supabase.auth.getUser(), 12_000, controller.signal);
        if (active) setSessionState(recoverySessionState(result, callbackError));
      } catch {
        if (active) setSessionState("unavailable");
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    void checkSession();
    return () => {
      active = false;
      controller.abort();
    };
  }, [supabase, checkAttempt]);

  async function onSubmit(values: UpdatePasswordInput) {
    if (saving.current || sessionState !== "ready") return;
    saving.current = true;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });
      if (error) {
        if (recoverySessionState({ data: { user: null }, error }, null) === "invalid") {
          setSessionState("invalid");
          toast.error("Your reset session expired. Request a fresh link.");
        } else if (error.code === "same_password") {
          toast.error("Choose a password different from your current password.");
        } else if (error.code === "weak_password") {
          toast.error("Choose a stronger password with more characters and a mix of letters, numbers, and symbols.");
        } else {
          toast.error("Could not update your password. Try again, or request a fresh reset link.");
        }
        return;
      }

      toast.success("Password updated");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      toast.error("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      saving.current = false;
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">Checking reset link...</p>
      </div>
    );
  }

  if (sessionState !== "ready") {
    return (
      <div className="text-center space-y-5">
        <div>
          <h2 className="text-xl font-bold">
            {sessionState === "invalid" ? "Reset link unavailable" : "Could not check reset link"}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {sessionState === "invalid"
              ? "This link may be expired, already used, or opened in a different browser."
              : "The sign-in service did not finish verifying your reset session. Check your connection."}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Request a fresh link here and open only the newest email link in this same browser on this device.
          </p>
        </div>
        {sessionState === "unavailable" && !callbackFailed && (
          <Button type="button" variant="outline" className="w-full" onClick={() => {
            setCheckingSession(true);
            setCheckAttempt((attempt) => attempt + 1);
          }}>
            Check again
          </Button>
        )}
        <Button
          type="button"
          className="w-full"
          size="lg"
          onClick={() => router.replace("/forgot-password")}
        >
          Request another link
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Choose a new password</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Use at least 8 characters
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            error={!!errors.password}
            autoFocus
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            error={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Update password
        </Button>
      </form>
    </div>
  );
}
