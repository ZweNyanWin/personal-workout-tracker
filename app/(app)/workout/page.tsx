import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkDoneButton } from "@/components/workout/mark-done-button";
import { SESSION_BG_COLORS } from "@/lib/utils";
import { CheckCircle2, Eye, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import type { Tables } from "@/types/database";

type SessionRow = Tables<"program_sessions"> & {
  block: Pick<Tables<"program_blocks">, "title" | "order_index"> | null;
  exercises: Pick<Tables<"session_exercises">, "id">[] | null;
};

export const metadata: Metadata = { title: "Workout" };
export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, username, avatar_url, role, created_at, updated_at",
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const { data: assignment } = await supabase
    .from("user_program_assignments")
    .select(
      "id, user_id, program_id, is_active, is_finite, status, current_session_index, program:programs(id, title, description)",
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  let sessions: SessionRow[] = [];
  let latestCompletion: {
    session_id: string | null;
    duration_minutes: number | null;
  } | null = null;

  if (assignment) {
    const [sessionsResult, completionResult] = await Promise.all([
      supabase
        .from("program_sessions")
        .select(
          "*, block:program_blocks(title, order_index), exercises:session_exercises(id)",
        )
        .eq("program_id", assignment.program_id)
        .order("session_order", { ascending: true }),
      supabase
        .from("workout_logs")
        .select("session_id, duration_minutes")
        .eq("user_id", user.id)
        .eq("assignment_id", assignment.id)
        .eq("status", "completed")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    sessions = (sessionsResult.data ?? []) as SessionRow[];
    latestCompletion = completionResult.data;
  }

  const totalSessions = sessions.length;
  const currentIdx = assignment?.current_session_index ?? 0;
  const blockComplete = assignment?.status === "completed";
  const currentCycleIdx = assignment?.is_finite
    ? Math.min(currentIdx, totalSessions)
    : totalSessions > 0
      ? currentIdx % totalSessions
      : 0;
  const totalWeeks = new Set(
    sessions
      .map((session) => session.block?.order_index)
      .filter((weekIndex) => weekIndex != null),
  ).size;

  function weekLabel(session: SessionRow) {
    if (!session.block) return "Week";
    const weekNumber =
      session.block.order_index != null ? session.block.order_index + 1 : null;
    return weekNumber ? `Week ${weekNumber}` : session.block.title;
  }

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="Your Program" />

      <div className="flex-1 p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
        {!assignment ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">No program assigned yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your coach will assign one soon.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  {assignment.program?.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {totalSessions} sessions
                  {totalWeeks ? ` across ${totalWeeks} weeks` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800 dark:bg-teal-950/30">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {blockComplete ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Block complete. Your coach can prepare the next block.
                  </span>
                ) : (
                  "Questions about sets, effort, or substitutions? Tommy can explain your assigned plan."
                )}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/coach">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Ask Tommy
                </Link>
              </Button>
            </div>

            <div className="space-y-3">
              {sessions.map((session, idx) => {
                const colorClass =
                  SESSION_BG_COLORS[session.title] ??
                  "bg-primary/20 text-primary border-primary/30";
                const week = weekLabel(session);
                const previousIdx = assignment.is_finite
                  ? currentCycleIdx - 1
                  : totalSessions > 0
                    ? (currentCycleIdx - 1 + totalSessions) % totalSessions
                    : -1;
                const isMostRecent =
                  idx === previousIdx &&
                  latestCompletion?.session_id === session.id;
                const isDone = idx < currentCycleIdx || isMostRecent;
                const canMarkDone = !blockComplete && idx === currentCycleIdx;
                const canUndo =
                  isMostRecent && latestCompletion?.duration_minutes === 0;

                return (
                  <div
                    key={session.id}
                    className={`rounded-xl border p-4 transition-colors hover:border-primary/30 ${
                      isDone
                        ? "border-success/35 bg-success/8"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">
                            {week}
                          </Badge>
                          <Badge className={colorClass} variant="outline">
                            {session.title}
                          </Badge>
                          {isDone && (
                            <Badge variant="success" className="text-[10px]">
                              Done
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {session.exercises?.length ?? 0} exercises
                          {session.block?.title
                            ? ` · ${session.block.title}`
                            : ""}
                        </p>
                        {session.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {session.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(canMarkDone || canUndo) && (
                          <MarkDoneButton
                            sessionId={session.id}
                            isDone={isDone}
                          />
                        )}
                        <Button asChild variant="ghost" size="icon-sm">
                          <Link
                            href={`/workout/${session.id}`}
                            aria-label={`View ${session.title}`}
                            title="View session"
                          >
                            <Eye className="h-5 w-5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
