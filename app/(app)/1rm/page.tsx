import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOneRmHistory } from "@/lib/actions/one-rep-max";
import { Header } from "@/components/layout/header";
import { OneRmCalculator } from "@/components/one-rep-max/one-rm-calculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateLong, formatWeight } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "1RM" };
export const dynamic = "force-dynamic";

const LIFT_LABELS = { bench: "Bench press", squat: "Squat", deadlift: "Deadlift" };

export default async function OneRmPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, history] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, username, avatar_url, role, created_at, updated_at")
      .eq("id", user.id)
      .single(),
    getOneRmHistory(),
  ]);
  if (!profile) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <Header profile={profile} title="1RM" />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 p-4 md:p-6">
        <div>
          <h2 className="text-xl font-bold">One-rep max predictor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimate strength from a completed set. No AI call or token cost.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Calculate from a set</CardTitle></CardHeader>
          <CardContent><OneRmCalculator /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>From your workout logs</CardTitle>
            <p className="text-xs text-muted-foreground">
              Last 200 completed workouts: working sets only, up to 10 reps. Each exercise variation stays separate.
            </p>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No eligible logged sets yet. Planned weights and warm-ups are never counted as completed lifts.
              </p>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.exerciseId} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-primary">
                          {LIFT_LABELS[item.primaryLift]}
                        </p>
                        <h3 className="font-semibold">{item.exerciseName}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDateLong(item.latest.date)}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {([
                        ["Most recent", item.latest],
                        ["Best recent", item.best],
                      ] as const).map(([label, sample]) => (
                        <div key={label} className="rounded-lg bg-secondary/50 p-3">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="mt-1 text-lg font-bold font-num">
                            {formatWeight(sample.estimateKg)} <span className="text-xs font-normal">kg</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            From {formatWeight(sample.weightKg)} kg × {sample.reps}
                            {sample.rpe !== null ? ` @ RPE ${sample.rpe}` : " · RPE unknown"}
                          </p>
                          <Link href={`/log/${sample.logId}`} className="mt-1 inline-block text-xs text-primary hover:underline">
                            View log
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Predictions use the Epley formula; recorded RPE adds an approximate reps-in-reserve adjustment.
          Estimates are less reliable for easy sets and high reps. A completed single without RPE is shown
          as a known lift, not proof that it was your maximum.
        </p>
      </div>
    </div>
  );
}
