"use client";

import { useState, useTransition, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, X, Clock } from "lucide-react";
import { finishWorkout } from "@/lib/actions/workout";
import { getWorkoutLog } from "@/lib/actions/workout";
import { useWorkoutTimer } from "@/lib/hooks/use-workout-timer";
import { ExerciseCard } from "@/components/logging/exercise-card";
import { RestTimer } from "@/components/logging/rest-timer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SESSION_BG_COLORS, formatWeight } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { WorkoutLogFull, WorkoutLogSet } from "@/types";
import { useEffect } from "react";

export default function ActiveWorkoutPage({ params }: { params: Promise<{ logId: string }> }) {
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
        <div className="animate-pulse text-muted-foreground text-sm">Loading workout…</div>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Workout not found.</p>
        <Button onClick={() => router.push("/dashboard")} variant="outline">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const completedExercises = log.exercises.filter((ex) =>
    ex.sets.length > 0 && ex.sets.every((s) => s.is_completed)
  ).length;
  const totalExercises = log.exercises.length;
  const progressPct = totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0;
  const sessionTitle = (log.session as any)?.title ?? log.title;
  const colorClass = SESSION_BG_COLORS[sessionTitle ?? ""] ?? "bg-primary/20 text-primary border-primary/30";

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

        {/* Rest timer */}
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
