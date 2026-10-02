import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { WorkoutHistoryList } from "@/components/history/workout-history-list";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { parseWorkoutHistoryFilters, WORKOUT_HISTORY_PAGE_SIZE, workoutHistoryHref, type HistorySearchParams, type WorkoutHistoryLog } from "@/lib/history/workout-history-query";

export const metadata: Metadata = { title: "Workout history preview", robots: { index: false, follow: false } };

export default async function HistoryPreview({ searchParams }: { searchParams: Promise<HistorySearchParams> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const filters = parseWorkoutHistoryFilters(await searchParams);
  delete filters.memberId;
  const titles = ["Bench day", "Squat day", "Deadlift day", "Upper body"];
  const sessions = ["Upper A", "Lower A", "Lower B", "Upper B"];
  const fixtures: WorkoutHistoryLog[] = Array.from({ length: 128 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: titles[index % titles.length],
    date: new Date(Date.UTC(2026, 9, 2 - index)).toISOString().slice(0, 10),
    duration_minutes: 45 + index % 4 * 5,
    energy_rating: 4, notes: "Fictional layout fixture", status: "completed",
    session: { title: sessions[index % sessions.length] },
  }));
  const matching = fixtures.filter((log) => (!filters.from || log.date >= filters.from) && (!filters.to || log.date <= filters.to)
    && (!filters.q || `${log.title} ${log.session?.title}`.toLowerCase().includes(filters.q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const pageCount = Math.max(1, Math.ceil(matching.length / WORKOUT_HISTORY_PAGE_SIZE));
  if (filters.page > pageCount) redirect(workoutHistoryHref(filters, pageCount, "/preview/history"));
  const first = (filters.page - 1) * WORKOUT_HISTORY_PAGE_SIZE;
  return <main className="min-h-dvh bg-background safe-top safe-left safe-right">
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-8">
      <div className="flex items-center gap-3"><Link href="/preview/coaching" aria-label="Back to coaching preview" className="rounded-lg p-2 hover:bg-accent"><ArrowLeft className="h-4 w-4" /></Link><h1 className="text-base font-semibold">Workout history preview</h1></div><ThemeToggle />
    </header>
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-5">
      <p className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">Development preview with 128 fictional workouts. Filters and pagination work here; workout details and deletion are disabled.</p>
      <WorkoutHistoryList preview basePath="/preview/history" history={{
        logs: matching.slice(first, first + WORKOUT_HISTORY_PAGE_SIZE), totalCount: matching.length, pageCount, filters, isOwnHistory: false,
        member: { id: "00000000-0000-4000-8000-000000000000", full_name: "Preview athlete", username: "preview" },
      }} />
    </div>
  </main>;
}
