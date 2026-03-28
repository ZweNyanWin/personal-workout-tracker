"use client";

import { useState, useTransition } from "react";
import { Plus, ChevronDown, ChevronUp, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { addSet } from "@/lib/actions/workout";
import { SetRow } from "./set-row";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkoutLogExerciseWithSets, WorkoutLogSet } from "@/types";

interface ExerciseCardProps {
  logExercise: WorkoutLogExerciseWithSets;
  onSetsChange: (exerciseId: string, sets: WorkoutLogSet[]) => void;
}

export function ExerciseCard({ logExercise, onSetsChange }: ExerciseCardProps) {
  const [sets, setSets] = useState(logExercise.sets);
  const [collapsed, setCollapsed] = useState(false);
  const [adding, startAdd] = useTransition();

  const completedCount = sets.filter((s) => s.is_completed).length;
  const totalCount = sets.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  function handleSetUpdate(setId: string, data: Partial<WorkoutLogSet>) {
    const updated = sets.map((s) => (s.id === setId ? { ...s, ...data } : s));
    setSets(updated);
    onSetsChange(logExercise.id, updated);
  }

  function handleSetDelete(setId: string) {
    const updated = sets.filter((s) => s.id !== setId);
    setSets(updated);
    onSetsChange(logExercise.id, updated);
  }

  function handleAddSet() {
    startAdd(async () => {
      const result = await addSet(logExercise.id);
      if (result.success) {
        const newSet: WorkoutLogSet = {
          id: result.data,
          log_exercise_id: logExercise.id,
          set_number: sets.length + 1,
          weight_kg: null,
          reps: null,
          rpe: null,
          is_warmup: false,
          is_completed: false,
          notes: null,
          created_at: new Date().toISOString(),
        };
        const updated = [...sets, newSet];
        setSets(updated);
        onSetsChange(logExercise.id, updated);
      } else {
        toast.error(result.error);
      }
    });
  }

  const planned = logExercise.planned;
  const exercise = logExercise.exercise;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-colors",
      allDone ? "border-success/30 bg-success/5" : "border-border bg-card"
    )}>
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 p-4 tap-none text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{exercise.name}</h3>
            {planned && (
              <span className="text-xs text-muted-foreground">
                {planned.target_sets && planned.target_reps
                  ? `${planned.target_sets}×${planned.target_reps}`
                  : ""}
                {planned.target_rpe ? ` @RPE ${planned.target_rpe}` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn(
              "text-xs font-medium",
              allDone ? "text-success" : completedCount > 0 ? "text-primary" : "text-muted-foreground"
            )}>
              {completedCount}/{totalCount} sets
            </span>
            {planned?.rest_seconds && (
              <span className="text-xs text-muted-foreground">
                · {planned.rest_seconds >= 60
                  ? `${Math.round(planned.rest_seconds / 60)}m rest`
                  : `${planned.rest_seconds}s rest`}
              </span>
            )}
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-1">
          {/* Column headers */}
          <div className="flex items-center gap-2 px-1 mb-1">
            <span className="w-6 text-center text-[10px] text-muted-foreground">#</span>
            <span className="w-16 text-center text-[10px] text-muted-foreground hidden sm:block">PREV</span>
            <span className="flex-1 text-center text-[10px] text-muted-foreground">KG</span>
            <span className="w-16 text-center text-[10px] text-muted-foreground">REPS</span>
            <span className="w-14 text-center text-[10px] text-muted-foreground">RPE</span>
            <span className="w-10" />
            <span className="w-8" />
          </div>

          {/* Sets */}
          {sets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              planned={planned}
              onUpdate={handleSetUpdate}
              onDelete={handleSetDelete}
            />
          ))}

          {/* Add set */}
          <button
            onClick={handleAddSet}
            disabled={adding}
            className="flex items-center gap-1.5 w-full py-2 px-1 text-sm text-muted-foreground hover:text-primary transition-colors tap-none"
          >
            <Plus className="h-4 w-4" />
            Add set
          </button>

          {/* Exercise notes */}
          {planned?.notes && (
            <div className="flex gap-2 p-2 rounded-lg bg-accent/50 text-xs text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {planned.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
