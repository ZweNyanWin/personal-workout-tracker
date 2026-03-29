"use client";

import { useState, useTransition, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, X, Clock, ArrowLeft, Dumbbell } from "lucide-react";
import { finishWorkout, getWorkoutLog } from "@/lib/actions/workout";
import { useWorkoutTimer } from "@/lib/hooks/use-workout-timer";
import { ExerciseCard } from "@/components/logging/exercise-card";
import { RestTimer } from "@/components/logging/rest-timer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SESSION_BG_COLORS, formatWeight, formatMinutes, relativeDate } from "@/lib/utils";
import type { WorkoutLogFull, WorkoutLogSet } from "@/types";

export default function WorkoutLogPage({ params }: { params: Promise<{ logId: string }> }) {
  const { logId } = use(params);
  const router = useRouter();
  const [log, setLog] = useState<WorkoutLogFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishOpen, setFinishOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [bodyweight, setBodyweight] = useState("");
  const [finishing, startFinish] = useTransition();

  const { formatted: elapsed } = useWorkoutTimer(log?.started_at ?? null);

  useEffect(() => {
    getWorkoutLog(logId).then((data) => {
      setLog(data);
      setLoading(false);
    });
  }, [logId]);

  function handleSetsChange(exerciseId: string, sets: WorkoutLogSet[]) {
    if (!log) return;
    setLog({
      ...log,
      exercises: log.exercises.map((ex) =>
        ex.id === exerciseId ? { ...ex, sets } : ex
      ),
    });
  }

  function handleFinish() {
    if (!log) return;
    startFinish(async () => {
      const bw = bodyweight ? parseFloat(bodyweight) : undefined;
      const result = await finishWorkout(logId, notes, bw);
      if (result.success) {
        toast.success("Workout completed! 💪");
        router.push("/dashboard");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Workout not found.</p>
        <Button onClick={() => router.push("/history")} variant="outline">Back to History</Button>
      </div>
    );
  }

  const sessionTitle = (log.session as any)?.title ?? log.title;
  const colorClass = SESSION_BG_COLORS[sessionTitle ?? ""] ?? "bg-primary/20 text-primary border-primary/30";

  // ─── Read-only view for completed workouts ────────────────────
  if ((log as any).status === "completed") {
    const totalSets = log.exercises.reduce((acc, ex) => acc + (ex.sets?.length ?? 0), 0);
    const completedSets = log.exercises.reduce(
      (acc, ex) => acc + (ex.sets?.filter((s) => s.is_completed).length ?? 0),
      0
    );
    const totalVolume = log.exercises.reduce(
      (acc, ex) =>
        acc +
        (ex.sets ?? []).reduce(
          (s, set) =>
            set.is_completed && set.weight_kg && set.reps
              ? s + set.weight_kg * set.reps
              : s,
          0
        ),
      0
    );

    return (
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-10 flex h-14 items-center gap-3 px-4 border-b border-border bg-background/95 backdrop-blur-sm">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors tap-none"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge className={colorClass} variant="outline">{sessionTitle}</Badge>
              <Badge variant="secondary" className="text-[10px] text-success border-success/30">Done</Badge>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-lg font-bold font-num">{relativeDate((log as any).date)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Date</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-lg font-bold font-num">
                {(log as any).duration_minutes ? formatMinutes((log as any).duration_minutes) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Duration</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-lg font-bold font-num">
                {totalVolume > 0 ? `${Math.round(totalVolume).toLocaleString()}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Vol (kg)</p>
            </div>
          </div>

          {/* Exercises */}
          {log.exercises.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Dumbbell className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No exercises logged for this session.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {log.exercises.map((ex) => {
                const completedSetsList = (ex.sets ?? []).filter((s) => s.is_completed);
                return (
                  <div key={ex.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm font-semibold mb-3">{(ex as any).exercise?.name ?? "Exercise"}</p>
                    {completedSetsList.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No sets completed</p>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-4 text-[10px] text-muted-foreground uppercase tracking-wide px-1">
                          <span>Set</span>
                          <span>Weight</span>
                          <span>Reps</span>
                          <span>RPE</span>
                        </div>
                        {(ex.sets ?? []).map((set, i) => (
                          <div
                            key={set.id}
                            className={`grid grid-cols-4 text-sm px-1 py-1 rounded-lg font-num ${
                              set.is_completed ? "" : "opacity-40"
                            }`}
                          >
                            <span className="text-muted-foreground">{i + 1}</span>
                            <span>{set.weight_kg != null ? formatWeight(set.weight_kg) : "—"}</span>
                            <span>{set.reps ?? "—"}</span>
                            <span>{set.rpe ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          {(log as any).notes && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm">{(log as any).notes}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Active workout view ───────────────────────────────────────
  const completedExercises = log.exercises.filter((ex) =>
    ex.sets.length > 0 && ex.sets.every((s) => s.is_completed)
  ).length;
  const totalExercises = log.exercises.length;
  const progressPct = totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0;

  return (
    <div className="flex flex-col min-h-screen pb-32">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-muted-foreground hover:text-foreground tap-none"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge className={colorClass} variant="outline">
                {sessionTitle}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-num shrink-0">
            <Clock className="h-3.5 w-3.5" />
            {elapsed}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Exercise list */}
      <div className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {completedExercises}/{totalExercises} exercises done
          </p>
        </div>

        {log.exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            logExercise={ex as any}
            onSetsChange={handleSetsChange}
          />
        ))}

        <RestTimer />
      </div>

      {/* Sticky finish button */}
      <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-background/95 backdrop-blur-sm border-t border-border safe-bottom">
        <Button
          onClick={() => setFinishOpen(true)}
          className="w-full max-w-2xl mx-auto flex"
          size="lg"
          variant="brand"
        >
          <CheckCircle2 className="h-5 w-5" />
          Finish Workout
        </Button>
      </div>

      {/* Finish dialog */}
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Finish Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bodyweight today (optional)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="82.5"
                  value={bodyweight}
                  onChange={(e) => setBodyweight(e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">kg</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Session notes (optional)</Label>
              <Textarea
                placeholder="How did it go? Any misses, PRs, cues to remember…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setFinishOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="brand"
              className="flex-1"
              loading={finishing}
              onClick={handleFinish}
            >
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
