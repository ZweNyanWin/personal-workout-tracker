import { z } from "zod";

/** Measured values only. Planned targets are never copied into this payload. */
export const workoutCompletionSetsSchema = z.array(z.object({
  id: z.string().uuid(),
  weight_kg: z.number().finite().min(0).max(2000).nullable(),
  reps: z.number().int().min(1).max(1000).nullable(),
  hold_seconds: z.number().finite().min(0.01).max(3600).nullable(),
  rpe: z.number().finite().min(5).max(10).nullable(),
}).strict().refine((set) => set.reps === null || set.hold_seconds === null,
  "Use repetitions or hold seconds for a set")).max(500)
  .refine((sets) => new Set(sets.map((set) => set.id)).size === sets.length, "Duplicate workout set");

export type WorkoutCompletionSet = z.infer<typeof workoutCompletionSetsSchema>[number];

export function completionSets(exercises: Array<{ sets: Array<WorkoutCompletionSet> }>): WorkoutCompletionSet[] {
  return exercises.flatMap((exercise) => exercise.sets.map(({ id, weight_kg, reps, hold_seconds, rpe }) => ({
    id, weight_kg, reps, hold_seconds, rpe,
  })));
}

export function workoutReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/history";
  try {
    const url = new URL(value, "https://powerbuild.invalid");
    if (url.origin !== "https://powerbuild.invalid") return "/history";
    if (url.pathname !== "/history" && !/^\/admin\/members\/[0-9a-f-]{36}$/i.test(url.pathname)) return "/history";
    return url.pathname + url.search;
  } catch { return "/history"; }
}
