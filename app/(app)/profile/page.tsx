"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateProfile, logout } from "@/lib/actions/auth";
import { profileSchema, type ProfileInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";
import type { Profile } from "@/types";
import { Header } from "@/components/layout/header";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoadError(true);
        return;
      }
      supabase
        .from("profiles")
        .select("id, email, full_name, username, avatar_url, role, created_at, updated_at")
        .eq("id", user.id)
        .single()
        .then(({ data, error }) => {
          if (data) {
            setProfile(data);
            reset({ full_name: data.full_name ?? "", username: data.username ?? "" });
          } else if (error) {
            setLoadError(true);
          }
        });
    });
  }, [reset]);

  async function onSubmit(values: ProfileInput) {
    setSaving(true);
    const fd = new FormData();
    fd.set("full_name", values.full_name);
    fd.set("username", values.username);
    const result = await updateProfile(fd);
    if (result.success) {
      toast.success("Profile updated");
      setProfile((p) => p ? { ...p, ...values } : p);
    } else {
      toast.error(result.error);
    }
    setSaving(false);
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div>
          <h1 className="font-semibold">Profile unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your account details could not be loaded.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="Profile" />

      <div className="p-4 md:p-6 space-y-6 max-w-lg mx-auto w-full">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl bg-primary/20 text-primary">
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-lg">{profile.full_name ?? "Athlete"}</p>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <Badge
              variant={profile.role === "admin" ? "brand" : "secondary"}
              className="mt-1 capitalize text-[10px]"
            >
              {profile.role}
            </Badge>
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Edit Profile</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input placeholder="Alex M" error={!!errors.full_name} {...register("full_name")} />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input
                placeholder="alex_m"
                autoCapitalize="none"
                error={!!errors.username}
                {...register("username")}
              />
              {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
            </div>
            <Button type="submit" className="w-full" loading={saving}>
              Save changes
            </Button>
          </form>
        </div>

        {/* Sign out */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Account</h2>
          <form action={logout}>
            <Button type="submit" variant="destructive" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
