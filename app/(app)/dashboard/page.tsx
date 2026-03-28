import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/actions/workout";
import { Header } from "@/components/layout/header";
import { NextSessionCard } from "@/components/dashboard/next-session-card";
import { StatsRow } from "@/components/dashboard/stats-row";
import { RecentWorkouts } from "@/components/dashboard/recent-workouts";
import { Dumbbell, Scale } from "lucide-react";
import { formatWeight, relativeDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DashboardPage() {
  const data = await getDashboardData();
  if (!data || !data.profile) redirect("/login");

  const { profile } = data;

  // Total sessions count (already fetched in getDashboardData via sessions array)
  const totalSessions = data.totalSessions ?? 4;

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="Dashboard" />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-2xl mx-auto w-full">
        {/* Greeting */}
        <div>
          <h2 className="text-2xl font-bold">
            Hey, {profile.full_name?.split(" ")[0] ?? "Athlete"} 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.nextSession
              ? `Next up: ${data.nextSession.title}`
              : "No session scheduled"}
          </p>
        </div>

        {/* Next session card */}
        <NextSessionCard
          session={data.nextSession}
          assignment={data.activeAssignment}
          totalSessions={totalSessions}
        />

        {/* Stats row */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Performance
          </h3>
          <StatsRow e1rmCards={data.e1rmCards} weeklyVolume={data.weeklyVolume} />
        </div>

        {/* Bodyweight + recent PR row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Scale className="h-3.5 w-3.5" />
              Bodyweight
            </div>
            {data.bodyweight ? (
              <>
                <p className="text-2xl font-bold font-num">
                  {formatWeight(data.bodyweight.bodyweight_kg)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">kg</span>
                </p>
                <p className="text-xs text-muted-foreground">{relativeDate(data.bodyweight.date)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not logged</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Dumbbell className="h-3.5 w-3.5" />
              Recent PRs
            </div>
            {data.recentPRs && data.recentPRs.length > 0 ? (
              <div className="space-y-1">
                {data.recentPRs.slice(0, 2).map((pr: any) => (
                  <div key={pr.id} className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground truncate">
                      {pr.exercise?.name?.split(" ")[0]}
                    </span>
                    <span className="text-sm font-bold font-num text-primary">
                      {formatWeight(pr.value)}kg
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None yet</p>
            )}
          </div>
        </div>

        {/* Recent workouts */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Recent Workouts
          </h3>
          <RecentWorkouts logs={data.recentLogs} />
        </div>
      </div>
    </div>
  );
}
