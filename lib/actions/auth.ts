"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, profileSchema } from "@/lib/validations";
import { safeRedirectPath } from "@/lib/utils";
import type { ActionResult } from "@/types";

type LoginResult = ActionResult | { success: false; error: string; needsConfirmation: true };

export async function login(formData: FormData): Promise<LoginResult> {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };
  const nextPath = safeRedirectPath(formData.get("next") as string | null);

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  try {
    signInResult = await supabase.auth.signInWithPassword(parsed.data);
  } catch {
    return { success: false, error: "Could not reach the sign-in service. Try again in a moment." };
  }
  const { error } = signInResult;

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        success: false,
        error: "Confirm your email before signing in. You can resend the confirmation below.",
        needsConfirmation: true,
      };
    }
    if (error.code === "invalid_credentials") {
      return { success: false, error: "Invalid email or password" };
    }
    return { success: false, error: `Sign-in failed: ${error.message}` };
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function getProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { full_name, username } = parsed.data;

  // Check username uniqueness (exclude self)
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", user.id)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "Username already taken" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, username })
    .eq("id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/profile");
  return { success: true, data: undefined };
}
