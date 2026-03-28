import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWorkoutHistory } from "@/lib/actions/workout";
import { Header } from "@/components/layout/header";
import { CheckCircle2, ChevronRight, Calendar } from "lucide-react";
import { relativeDate, formatMinutes, SESSION_BG_COLORS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const logs = await getWorkoutHistory();

  // Group by month
  const grouped = logs.reduce((acc: Record<string, typeof logs>, log) => {
    const month = new Date(log.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    if (!acc[month]) acc[month] = [];
    acc[month].push(log);
    return acc;
  }, {});

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="History" />

      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-6">
        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No workouts yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Complete a session to see it here.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([month, monthLogs]) => (
            <div key={month}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
                {month}
              </h3>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {monthLogs.map((log) => {
                  const sessionTitle = (log as any).session?.title;
                  const colorClass = SESSION_BG_COLORS[sessionTitle ?? ""] ?? "";
                  return (
                    <Link
                      key={log.id}
                      href={`/log/${log.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent transition-colors tap-none"
                    >
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{log.title ?? "Workout"}</p>
                          {sessionTitle && (
                            <Badge className={`${colorClass} text-[10px] py-0`} variant="outline">
                              {sessionTitle}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {relativeDate(log.date)}
                          {log.duration_minutes ? ` · ${formatMinutes(log.duration_minutes)}` : ""}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
