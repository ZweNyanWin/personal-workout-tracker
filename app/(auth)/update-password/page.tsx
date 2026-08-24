"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
  });

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (active) {
        setHasSession(!!user);
        setCheckingSession(false);
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function onSubmit(values: UpdatePasswordInput) {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Password updated");
    router.replace("/dashboard");
    router.refresh();
  }

  if (checkingSession) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">Checking reset link...</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="text-center space-y-5">
        <div>
          <h2 className="text-xl font-bold">Reset link unavailable</h2>
          <p className="text-sm text-muted-foreground mt-2">
            This link is invalid or expired. Request a fresh link on this device.
          </p>
        </div>
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
