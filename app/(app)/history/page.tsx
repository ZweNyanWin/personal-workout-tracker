import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkoutHistoryPage } from "@/lib/actions/workout-history";
import { Header } from "@/components/layout/header";
import { WorkoutHistoryList } from "@/components/history/workout-history-list";
import { parseWorkoutHistoryFilters, workoutHistoryHref, type HistorySearchParams } from "@/lib/history/workout-history-query";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<HistorySearchParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles")
    .select("id,email,full_name,username,avatar_url,role,created_at,updated_at").eq("id", user.id).single();
  if (!profile) redirect("/login");
  const params = await searchParams;
  let history;
  let error;
  try {
    history = await getWorkoutHistoryPage(params);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Workout history could not load. Try again.";
  }
  if (!history && !error) redirect("/login");
  if (history && history.filters.page !== parseWorkoutHistoryFilters(params).page) redirect(workoutHistoryHref(history.filters));
  return (
    <div className="flex flex-col">
      <Header profile={profile} title="History" />
      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-5">
        {history && !history.isOwnHistory && <div className="space-y-2">
          <Link href={`/admin/members/${history.member.id}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Back to member</Link>
          <h1 className="text-lg font-semibold">{history.member.full_name ?? history.member.username ?? "Member"}&rsquo;s workouts</h1>
        </div>}
        {history ? <WorkoutHistoryList history={history} /> : <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm text-destructive" role="alert">{error}</p>
          <Link href="/history" className="text-sm font-medium text-primary hover:underline">Open my workout history</Link>
        </div>}
      </div>
    </div>
  );
}
