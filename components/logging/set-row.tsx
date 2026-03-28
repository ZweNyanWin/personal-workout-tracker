"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateSet, deleteSet } from "@/lib/actions/workout";
import { formatWeight, parseFloatOrNull, parseIntOrNull } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { WorkoutLogSet } from "@/types";

interface SetRowProps {
  set: WorkoutLogSet;
  planned?: { target_reps?: string | null; target_weight_kg?: number | null; target_rpe?: number | null } | null;
  previousBest?: { weight_kg: number | null; reps: number | null } | null;
  onUpdate: (setId: string, data: Partial<WorkoutLogSet>) => void;
  onDelete: (setId: string) => void;
}

export function SetRow({ set, planned, previousBest, onUpdate, onDelete }: SetRowProps) {
  const [weight, setWeight] = useState(set.weight_kg?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [rpe, setRpe] = useState(set.rpe?.toString() ?? "");
  const [completing, startComplete] = useTransition();
  const [deleting, startDelete] = useTransition();

  function handleComplete() {
    const weightVal = parseFloatOrNull(weight);
    const repsVal = parseIntOrNull(reps);
    if (!weightVal || !repsVal) {
      toast.error("Enter weight and reps before marking complete");
      return;
    }

    startComplete(async () => {
      const newCompleted = !set.is_completed;
      await updateSet(set.id, {
        weight_kg: weightVal,
        reps: repsVal,
        rpe: parseFloatOrNull(rpe),
        is_completed: newCompleted,
      });
      onUpdate(set.id, {
        weight_kg: weightVal,
        reps: repsVal,
        rpe: parseFloatOrNull(rpe),
        is_completed: newCompleted,
      });
    });
  }

  function handleBlurSave() {
    const weightVal = parseFloatOrNull(weight);
    const repsVal = parseIntOrNull(reps);
    if (!weightVal && !repsVal) return;
    updateSet(set.id, {
      weight_kg: weightVal,
      reps: repsVal,
      rpe: parseFloatOrNull(rpe),
    });
  }

  function handleDelete() {
    startDelete(async () => {
      await deleteSet(set.id);
      onDelete(set.id);
    });
  }

  return (
    <div className={cn(
      "flex items-center gap-2 py-1.5 px-1 rounded-lg transition-colors",
      set.is_completed && "bg-success/5"
    )}>
      {/* Set number */}
      <span className={cn(
        "w-6 text-center text-sm font-bold shrink-0",
        set.is_warmup ? "text-muted-foreground" : "text-foreground"
      )}>
        {set.is_warmup ? "W" : set.set_number}
      </span>

      {/* Previous best hint */}
      <span className="w-16 text-center text-xs text-muted-foreground font-num shrink-0 hidden sm:block">
        {previousBest?.weight_kg
          ? `${formatWeight(previousBest.weight_kg)}×${previousBest.reps}`
          : planned?.target_weight_kg
          ? `~${formatWeight(planned.target_weight_kg)}`
          : "—"}
      </span>

      {/* Weight input */}
      <input
        type="number"
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={handleBlurSave}
        placeholder={planned?.target_weight_kg ? formatWeight(planned.target_weight_kg) : "kg"}
        className={cn(
          "flex-1 h-10 rounded-lg border bg-background px-2 text-center text-sm font-bold font-num",
          "focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50",
          set.is_completed ? "border-success/30 bg-success/5" : "border-input"
        )}
      />

      {/* Reps input */}
      <input
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={handleBlurSave}
        placeholder={planned?.target_reps ?? "reps"}
        className={cn(
          "w-16 h-10 rounded-lg border bg-background px-2 text-center text-sm font-bold font-num",
          "focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50",
          set.is_completed ? "border-success/30 bg-success/5" : "border-input"
        )}
      />

      {/* RPE input */}
      <input
        type="number"
        inputMode="decimal"
        value={rpe}
        onChange={(e) => setRpe(e.target.value)}
        onBlur={handleBlurSave}
        placeholder="RPE"
        min="5"
        max="10"
        step="0.5"
        className={cn(
          "w-14 h-10 rounded-lg border bg-background px-2 text-center text-xs font-num",
          "focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50",
          set.is_completed ? "border-success/30 bg-success/5" : "border-input"
        )}
      />

      {/* Complete toggle */}
      <button
        onClick={handleComplete}
        disabled={completing}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors tap-none",
          set.is_completed
            ? "bg-success border-success text-success-foreground"
            : "border-border hover:border-success/60 hover:bg-success/10 text-muted-foreground hover:text-success"
        )}
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </button>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors tap-none"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
