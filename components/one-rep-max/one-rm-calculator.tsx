"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { predictOneRm, roundToPlates } from "@/lib/one-rep-max";
import { formatWeight } from "@/lib/utils";

const RPE_OPTIONS = [7, 7.5, 8, 8.5, 9, 9.5, 10];
const PERCENTAGES = [60, 65, 70, 75, 80, 85, 90, 95];

export function OneRmCalculator() {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("1");
  const [rpe, setRpe] = useState("");

  const weightKg = Number(weight);
  const repCount = Number(reps);
  const effort = rpe ? Number(rpe) : null;
  const estimate = weight.trim() && reps.trim()
    ? predictOneRm(weightKg, repCount, effort)
    : null;
  const tooManyEffectiveReps = Number.isFinite(repCount) && effort !== null
    && repCount + 10 - effort > 10;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="one-rm-weight">Weight (kg)</Label>
          <Input
            id="one-rm-weight"
            type="number"
            min="0.1"
            max="2000"
            step="0.5"
            inputMode="decimal"
            placeholder="e.g. 115"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="one-rm-reps">Completed reps</Label>
          <Input
            id="one-rm-reps"
            type="number"
            min="1"
            max="10"
            step="1"
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor="one-rm-rpe">Set RPE (optional)</Label>
          <select
            id="one-rm-rpe"
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Not recorded</option>
            {RPE_OPTIONS.map((option) => (
              <option key={option} value={option}>RPE {option}</option>
            ))}
          </select>
        </div>
      </div>

      {estimate !== null ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {repCount === 1 && effort === null ? "Completed single — minimum known strength" : "Estimated 1RM"}
          </p>
          <p className="mt-1 text-4xl font-bold font-num text-primary">
            {formatWeight(estimate)} <span className="text-lg font-medium">kg</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {effort === null
              ? "No RPE supplied. A set with reps left may understate your potential max."
              : "RPE adjusts for estimated reps left; this is a rough prediction, not a tested max."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tooManyEffectiveReps
            ? "This set is too far from a max for a useful estimate. Use fewer reps or a harder set."
            : "Enter a completed set of 1–10 reps to see an estimate."}
        </p>
      )}

      {estimate !== null && (
        <div>
          <p className="mb-2 text-sm font-semibold">Loading guide</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PERCENTAGES.map((percent) => (
              <div key={percent} className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">{percent}%</p>
                <p className="font-semibold font-num">{formatWeight(roundToPlates(estimate * percent / 100))} kg</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Rounded to the nearest 2.5 kg. These are reference loads, not a prescribed workout.
          </p>
        </div>
      )}
    </div>
  );
}
