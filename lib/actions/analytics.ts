"use server";

import { createClient } from "@/lib/supabase/server";
import { estimateE1RM } from "@/lib/utils";

export async function getAnalyticsData(userId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const targetId = userId ?? user.id;

  // If viewing another user's data, must be admin
  if (userId && userId !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") return null;
  }

  const [bodyMetrics, prs, recentLogs] = await Promise.all([
    supabase
      .from("body_metrics")
      .select("*")
      .eq("user_id", targetId)
      .order("date", { ascending: true })
      .limit(90),
    supabase
      .from("personal_records")
      .select("*, exercise:exercises(*)")
      .eq("user_id", targetId)
      .eq("record_type", "estimated_1rm")
      .order("date", { ascending: true }),
    supabase
      .from("workout_logs")
      .select("id, date, title, session:program_sessions(title)")
      .eq("user_id", targetId)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(100),
  ]);

  // Volume by week
  const { data: volumeData } = await supabase
    .from("workout_log_sets")
    .select(`
      weight_kg,
      reps,
      is_completed,
      workout_log_exercises!inner(
        workout_log_id,
        workout_logs!inner(user_id, date)
      )
    `)
    .eq("workout_log_exercises.workout_logs.user_id", targetId)
    .eq("is_completed", true)
    .gte(
      "workout_log_exercises.workout_logs.date",
      new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]
    );

  // Aggregate volume by week
  const weekMap = new Map<string, number>();
  for (const s of volumeData ?? []) {
    const logDate = (s as any).workout_log_exercises?.workout_logs?.date;
    if (!logDate || !s.weight_kg || !s.reps) continue;
    const d = new Date(logDate + "T00:00:00");
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().split("T")[0];
    weekMap.set(key, (weekMap.get(key) ?? 0) + s.weight_kg * s.reps);
  }

  const volumeByWeek = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, volume]) => ({ week, volume: Math.round(volume) }));

  // E1RM history per primary lift
  const e1rmByLift: Record<string, { date: string; value: number }[]> = {
    bench: [],
    squat: [],
    deadlift: [],
  };

  for (const pr of prs.data ?? []) {
    const lift = pr.exercise?.primary_lift;
    if (lift && e1rmByLift[lift]) {
      e1rmByLift[lift].push({ date: pr.date, value: Math.round(pr.value) });
    }
  }

  // Workout frequency by date (for heatmap)
  const freqMap = new Map<string, number>();
  for (const log of recentLogs.data ?? []) {
    freqMap.set(log.date, (freqMap.get(log.date) ?? 0) + 1);
  }
  const frequency = Array.from(freqMap.entries()).map(([date, count]) => ({ date, count }));

  return {
    bodyweightData: (bodyMetrics.data ?? []).map((m) => ({
      date: m.date,
      weight: m.bodyweight_kg ?? 0,
    })),
    volumeByWeek,
    e1rmByLift,
    frequency,
    recentLogs: recentLogs.data ?? [],
    prHistory: prs.data ?? [],
  };
}

export async function getExerciseHistory(exerciseId: string, userId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const targetId = userId ?? user.id;

  const { data } = await supabase
    .from("workout_log_exercises")
    .select(`
      *,
      exercise:exercises(*),
      sets:workout_log_sets(*),
      log:workout_logs(date, user_id)
    `)
    .eq("exercise_id", exerciseId)
    .eq("workout_logs.user_id", targetId)
    .eq("workout_logs.status", "completed")
    .order("created_at", { ascending: false })
    .limit(20);

  // Build e1RM history from sets
  return (data ?? []).map((entry: any) => {
    const completedSets = (entry.sets ?? []).filter(
      (s: any) => s.is_completed && s.weight_kg && s.reps
    );
    const bestE1RM = completedSets.reduce((best: number, s: any) => {
      const e = estimateE1RM(s.weight_kg, s.reps);
      return e > best ? e : best;
    }, 0);
    return {
      date: entry.log?.date ?? "",
      sets: entry.sets ?? [],
      bestE1RM,
    };
  });
}
