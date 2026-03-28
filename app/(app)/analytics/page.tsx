import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAnalyticsData } from "@/lib/actions/analytics";
import { Header } from "@/components/layout/header";
import { E1rmChart } from "@/components/analytics/e1rm-chart";
import { VolumeChart } from "@/components/analytics/volume-chart";
import { BodyweightChart } from "@/components/analytics/bodyweight-chart";
import { FrequencyHeatmap } from "@/components/analytics/frequency-heatmap";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatWeight } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const LIFT_LABELS: Record<string, string> = {
  bench: "Bench Press",
  squat: "Squat",
  deadlift: "Deadlift",
};

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const analyticsData = await getAnalyticsData();

  if (!analyticsData) {
    return (
      <div className="flex flex-col">
        <Header profile={profile} title="Analytics" />
        <div className="p-8 text-center text-muted-foreground">Could not load analytics.</div>
      </div>
    );
  }

  // Latest e1RM per lift
  const latestE1RM: Record<string, number> = {};
  for (const [lift, points] of Object.entries(analyticsData.e1rmByLift)) {
    if (points.length > 0) {
      latestE1RM[lift] = points[points.length - 1].value;
    }
  }

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="Analytics" />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-3xl mx-auto w-full">
        {/* Big 3 e1RM summary */}
        <div className="grid grid-cols-3 gap-3">
          {["bench", "squat", "deadlift"].map((lift) => (
            <div key={lift} className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {LIFT_LABELS[lift]}
              </p>
              <p className="text-xl font-bold font-num mt-1">
                {latestE1RM[lift] ? `${formatWeight(latestE1RM[lift])}` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">e1RM kg</p>
            </div>
          ))}
        </div>

        {/* e1RM trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Estimated 1RM — Big 3</CardTitle>
          </CardHeader>
          <CardContent>
            <E1rmChart data={analyticsData.e1rmByLift} />
          </CardContent>
        </Card>

        {/* Weekly volume */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Weekly Volume (kg)</CardTitle>
          </CardHeader>
          <CardContent>
            <VolumeChart data={analyticsData.volumeByWeek} />
          </CardContent>
        </Card>

        {/* Bodyweight trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bodyweight Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <BodyweightChart data={analyticsData.bodyweightData} />
          </CardContent>
        </Card>

        {/* Training frequency heatmap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Training Frequency — Last 12 Weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <FrequencyHeatmap data={analyticsData.frequency} />
          </CardContent>
        </Card>

        {/* Recent PRs */}
        {analyticsData.prHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">PR Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analyticsData.prHistory.slice(-10).reverse().map((pr: any) => (
                  <div key={pr.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{pr.exercise?.name}</p>
                      <p className="text-xs text-muted-foreground">{pr.date}</p>
                    </div>
                    <p className="text-sm font-bold text-primary font-num">
                      {formatWeight(pr.value)} kg
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
