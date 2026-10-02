"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateSet, deleteSet } from "@/lib/actions/workout";
import { formatWeight, parseFloatOrNull } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { WorkoutLogSet } from "@/types";
import { readPrescription } from "./prescription";

interface SetRowProps {
  set: WorkoutLogSet;
  planned?: {
    target_reps?: string | null;
    target_weight_kg?: number | null;
    target_rpe?: number | null;
    prescription?: unknown;
  } | null;
  previousBest?: { weight_kg: number | null; reps: number | null } | null;
  onUpdate: (setId: string, data: Partial<WorkoutLogSet>) => void;
  onDelete: (setId: string) => void;
}

export function SetRow({
  set,
  planned,
  previousBest,
  onUpdate,
  onDelete,
}: SetRowProps) {
  const [weight, setWeight] = useState(set.weight_kg?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [seconds, setSeconds] = useState(set.hold_seconds?.toString() ?? "");
  const [rpe, setRpe] = useState(set.rpe?.toString() ?? "");
  const [completing, startComplete] = useTransition();
  const [deleting, startDelete] = useTransition();
  const prescription = readPrescription(planned?.prescription);
  const isHold = prescription?.dose.kind === "hold" || set.hold_seconds != null;

  function values() {
    return {
      weight_kg: parseFloatOrNull(weight),
      reps: isHold || !reps.trim() ? null : Number(reps),
      hold_seconds: isHold && seconds.trim() ? Number(seconds) : null,
      rpe: isHold ? null : parseFloatOrNull(rpe),
    };
  }

  function handleComplete() {
    const data = values();
    if (
      isHold
        ? data.hold_seconds === null ||
          !Number.isFinite(data.hold_seconds) ||
          data.hold_seconds <= 0 ||
          data.hold_seconds > 3600
        : (data.weight_kg !== null && data.weight_kg < 0) ||
          data.reps === null ||
          !Number.isInteger(data.reps) ||
          data.reps <= 0
    ) {
      toast.error(
        isHold
          ? "Enter completed hold seconds before marking complete"
          : "Enter completed reps; weight is optional for bodyweight work",
      );
      return;
    }
    if (data.weight_kg !== null && data.weight_kg < 0) {
      toast.error("Weight cannot be negative");
      return;
    }
    if (data.rpe !== null && (data.rpe < 5 || data.rpe > 10)) {
      toast.error("RPE must be between 5 and 10");
      return;
    }

    startComplete(async () => {
      const newCompleted = !set.is_completed;
      const result = await updateSet(set.id, {
        ...data,
        is_completed: newCompleted,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      onUpdate(set.id, {
        ...data,
        is_completed: newCompleted,
      });
    });
  }

  async function handleBlurSave() {
    const data = values();
    if (
      data.weight_kg === null &&
      data.reps === null &&
      data.rpe === null &&
      data.hold_seconds === null
    )
      return;
    if (
      (data.weight_kg !== null && data.weight_kg < 0) ||
      (data.reps !== null && (!Number.isInteger(data.reps) || data.reps <= 0)) ||
      (data.hold_seconds !== null &&
        (!Number.isFinite(data.hold_seconds) ||
          data.hold_seconds <= 0 ||
          data.hold_seconds > 3600)) ||
      (data.rpe !== null && (data.rpe < 5 || data.rpe > 10))
    ) {
      toast.error("Check the set values before saving");
      return;
    }
    const result = await updateSet(set.id, data);
    if (!result.success) toast.error(result.error);
    else onUpdate(set.id, data);
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deleteSet(set.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onDelete(set.id);
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-1 rounded-lg transition-colors",
        set.is_completed && "bg-success/5",
      )}
    >
      {/* Set number */}
      <span
        className={cn(
          "w-6 text-center text-sm font-bold shrink-0",
          set.is_warmup ? "text-muted-foreground" : "text-foreground",
        )}
      >
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
        placeholder={
          planned?.target_weight_kg
            ? formatWeight(planned.target_weight_kg)
            : isHold
              ? "kg (opt)"
              : "kg (opt)"
        }
        min="0"
        step="0.5"
        aria-label={`Weight for set ${set.set_number}`}
        className={cn(
          "min-w-0 flex-1 h-10 rounded-lg border bg-background px-2 text-center text-base md:text-sm font-bold font-num",
          "focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50",
          set.is_completed ? "border-success/30 bg-success/5" : "border-input",
        )}
      />

      {/* Reps input */}
      <input
        type="number"
        inputMode="numeric"
        value={isHold ? seconds : reps}
        onChange={(e) =>
          isHold ? setSeconds(e.target.value) : setReps(e.target.value)
        }
        onBlur={handleBlurSave}
        placeholder={isHold ? "sec" : (planned?.target_reps ?? "reps")}
        min="1"
        aria-label={`${isHold ? "Hold seconds" : "Repetitions"} for set ${set.set_number}`}
        className={cn(
          "w-16 h-10 rounded-lg border bg-background px-2 text-center text-base md:text-sm font-bold font-num",
          "focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50",
          set.is_completed ? "border-success/30 bg-success/5" : "border-input",
        )}
      />

      {/* RPE input */}
      {!isHold && (
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
          aria-label={`RPE for set ${set.set_number}`}
          className={cn(
            "w-14 h-10 rounded-lg border bg-background px-2 text-center text-base md:text-xs font-num",
            "focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50",
            set.is_completed
              ? "border-success/30 bg-success/5"
              : "border-input",
          )}
        />
      )}

      {/* Complete toggle */}
      <button
        onClick={handleComplete}
        disabled={completing}
        aria-label={
          set.is_completed
            ? `Reopen set ${set.set_number}`
            : `Complete set ${set.set_number}`
        }
        title={set.is_completed ? "Reopen set" : "Complete set"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors tap-none",
          set.is_completed
            ? "bg-success border-success text-success-foreground"
            : "border-border hover:border-success/60 hover:bg-success/10 text-muted-foreground hover:text-success",
        )}
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </button>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete set ${set.set_number}`}
        title="Delete set"
        className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors tap-none"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
