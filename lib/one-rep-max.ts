export type PrimaryLift = "bench" | "squat" | "deadlift";

export type OneRmSample = {
  logId: string;
  date: string;
  performedAt: string;
  setNumber: number;
  exerciseId: string;
  exerciseName: string;
  primaryLift: PrimaryLift;
  weightKg: number;
  reps: number;
  rpe: number | null;
  estimateKg: number;
};

export type OneRmExerciseHistory = {
  exerciseId: string;
  exerciseName: string;
  primaryLift: PrimaryLift;
  latest: OneRmSample;
  best: OneRmSample;
};

/**
 * Epley estimate from a completed set. When RPE is known, 10 - RPE is used
 * as an approximate reps-in-reserve adjustment. This is not a measured max.
 */
export function predictOneRm(
  weightKg: number,
  reps: number,
  rpe: number | null = null
): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 2000) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 7 || rpe > 10)) return null;

  const effectiveReps = reps + (rpe === null ? 0 : 10 - rpe);
  if (effectiveReps > 10) return null;
  if (effectiveReps === 1) return weightKg;
  return Math.round(weightKg * (1 + effectiveReps / 30) * 10) / 10;
}

export function roundToPlates(weightKg: number): number {
  return Math.round(weightKg / 2.5) * 2.5;
}

export function summarizeOneRmSamples(samples: OneRmSample[]): OneRmExerciseHistory[] {
  const byExercise = new Map<string, OneRmExerciseHistory>();

  for (const sample of samples) {
    const current = byExercise.get(sample.exerciseId);
    if (!current) {
      byExercise.set(sample.exerciseId, {
        exerciseId: sample.exerciseId,
        exerciseName: sample.exerciseName,
        primaryLift: sample.primaryLift,
        latest: sample,
        best: sample,
      });
      continue;
    }

    if (sample.performedAt > current.latest.performedAt
      || sample.performedAt === current.latest.performedAt
        && sample.setNumber > current.latest.setNumber) {
      current.latest = sample;
    }
    if (sample.estimateKg > current.best.estimateKg) current.best = sample;
  }

  const order: Record<PrimaryLift, number> = { bench: 0, squat: 1, deadlift: 2 };
  return Array.from(byExercise.values()).sort(
    (a, b) => order[a.primaryLift] - order[b.primaryLift] || a.exerciseName.localeCompare(b.exerciseName)
  );
}
