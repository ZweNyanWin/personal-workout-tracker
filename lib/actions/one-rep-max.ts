"use server";

import { createClient } from "@/lib/supabase/server";
import {
  predictOneRm,
  summarizeOneRmSamples,
  type OneRmSample,
  type PrimaryLift,
} from "@/lib/one-rep-max";

export async function getOneRmHistory() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: logs } = await supabase
    .from("workout_logs")
    .select(`
      id, date, finished_at, started_at, created_at,
      log_exercises:workout_log_exercises(
        exercise:exercises(id, name, primary_lift),
        sets:workout_log_sets(set_number, weight_kg, reps, rpe, is_completed, is_warmup)
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("date", { ascending: false })
    .limit(200);

  const samples: OneRmSample[] = [];
  for (const log of logs ?? []) {
    for (const logExercise of log.log_exercises ?? []) {
      const exercise = logExercise.exercise;
      if (!exercise?.primary_lift) continue;

      for (const set of logExercise.sets ?? []) {
        if (!set.is_completed || set.is_warmup || set.weight_kg === null || set.reps === null) {
          continue;
        }
        const estimateKg = predictOneRm(set.weight_kg, set.reps, set.rpe);
        if (estimateKg === null) continue;

        samples.push({
          logId: log.id,
          date: log.date,
          performedAt: log.finished_at ?? log.started_at ?? log.created_at,
          setNumber: set.set_number,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          primaryLift: exercise.primary_lift as PrimaryLift,
          weightKg: set.weight_kg,
          reps: set.reps,
          rpe: set.rpe,
          estimateKg,
        });
      }
    }
  }

  return summarizeOneRmSamples(samples);
}
