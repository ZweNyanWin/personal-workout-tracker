import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CoachWorkspace } from "@/components/coach/coach-workspace";

export const metadata: Metadata = { title: "Tommy · AI Coach" };

export default async function CoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  return <div className="flex flex-col"><Header profile={profile} title="Tommy · AI Coach" /><CoachWorkspace /></div>;
}
