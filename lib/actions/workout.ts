"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, WorkoutLogFull } from "@/types";

// ─── Get dashboard data ───────────────────────────────────────
export async function getDashboardData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, assignmentResult, recentLogsResult, bodyweightResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("user_program_assignments")
        .select("*, program:programs(*)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("workout_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("date", { ascending: false })
        .limit(5),
      supabase
        .from("body_metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const assignment = assignmentResult.data;

  // Run sessions fetch and PRs fetch in parallel
  const [sessionsResult, prsResult] = await Promise.all([
    assignment
      ? supabase
          .from("program_sessions")
          .select("*")
          .eq("program_id", assignment.program_id)
          .order("session_order", { ascending: true })
      : Promise.resolve({ data: null }),
    supabase
      .from("personal_records")
      .select("*, exercise:exercises(*)")
      .eq("user_id", user.id)
      .eq("record_type", "estimated_1rm")
      .in("exercise.primary_lift", ["bench", "squat", "deadlift"])
      .order("date", { ascending: false }),
  ]);

  let nextSession = null;
  if (sessionsResult.data && sessionsResult.data.length > 0) {
    const idx = (assignment!.current_session_index) % sessionsResult.data.length;
    nextSession = sessionsResult.data[idx];
  }

  const prs = prsResult.data;

  // Latest PR per lift
  const e1rmMap: Record<string, NonNullable<typeof prs>[0]> = {};
  if (prs) {
    for (const pr of prs) {
      if (pr.exercise?.primary_lift && !e1rmMap[pr.exercise.primary_lift]) {
        e1rmMap[pr.exercise.primary_lift] = pr;
      }
    }
  }

  // Weekly volume
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekSets } = await supabase
    .from("workout_log_sets")
    .select("weight_kg, reps, is_completed, workout_log_exercises!inner(workout_log_id, workout_logs!inner(user_id, date))")
    .eq("workout_log_exercises.workout_logs.user_id", user.id)
    .eq("is_completed", true)
    .gte("workout_log_exercises.workout_logs.date", weekAgo.toISOString().split("T")[0]);

  const weeklyVolume = weekSets?.reduce((acc, s) => {
    return acc + ((s.weight_kg ?? 0) * (s.reps ?? 0));
  }, 0) ?? 0;

  return {
    profile: profileResult.data,
    activeAssignment: assignment,
    nextSession,
    totalSessions: sessionsResult.data?.length ?? 4,
    recentLogs: recentLogsResult.data ?? [],
    weeklyVolume,
    e1rmCards: Object.values(e1rmMap),
    recentPRs: prs ?? [],
    bodyweight: bodyweightResult.data,
  };
}

// ─── Get session with exercises (for logging/editing) ─────────
export async function getSessionWithExercises(sessionId: string, userId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const targetUserId = userId ?? user.id;

  const { data: session } = await supabase
    .from("program_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return null;

  const { data: sessionExercises } = await supabase
    .from("session_exercises")
    .select("*, exercise:exercises(*)")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  if (!sessionExercises) return { ...session, exercises: [] };

  // Get user overrides for this session's exercises
  const seIds = sessionExercises.map((se) => se.id);
  const { data: overrides } = await supabase
    .from("user_exercise_overrides")
    .select("*")
    .eq("user_id", targetUserId)
    .in("session_exercise_id", seIds);

  const overrideMap = new Map((overrides ?? []).map((o) => [o.session_exercise_id, o]));

  // Merge override data
  const exercises = sessionExercises
    .filter((se) => {
      const override = overrideMap.get(se.id);
      return !override?.is_deleted;
    })
    .map((se) => ({
      ...se,
      user_override: overrideMap.get(se.id) ?? null,
    }));

  return { ...session, exercises };
}

// ─── Start a new workout log ──────────────────────────────────
export async function startWorkout(sessionId: string): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Check if there's an existing in-progress workout for this session today
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("workout_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("session_id", sessionId)
    .eq("status", "in_progress")
    .gte("date", today)
    .maybeSingle();

  if (existing) {
    return { success: true, data: existing.id };
  }

  const session = await getSessionWithExercises(sessionId);
  if (!session) return { success: false, error: "Session not found" };

  const { data: assignment } = await supabase
    .from("user_program_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  // Create workout log
  const { data: log, error: logError } = await supabase
    .from("workout_logs")
    .insert({
      user_id: user.id,
      session_id: sessionId,
      assignment_id: assignment?.id ?? null,
      title: session.title,
      date: today,
      started_at: new Date().toISOString(),
      status: "in_progress",
    })
    .select("id")
    .single();

  if (logError || !log) {
    return { success: false, error: logError?.message ?? "Failed to create workout" };
  }

  // Pre-populate exercises from session template — batch inserts
  const sessionExercises = (session as any).exercises as any[];
  if (sessionExercises.length > 0) {
    const exerciseRows = sessionExercises.map((se) => ({
      workout_log_id: log.id,
      exercise_id: se.user_override?.override_exercise_id ?? se.exercise.id,
      session_exercise_id: se.id,
      order_index: se.order_index,
    }));

    const { data: logExercises } = await supabase
      .from("workout_log_exercises")
      .insert(exerciseRows)
      .select("id, session_exercise_id");

    if (logExercises) {
      const seMap = new Map(sessionExercises.map((se) => [se.id, se]));
      const allSetRows = logExercises.flatMap((logEx) => {
        const se = seMap.get(logEx.session_exercise_id);
        const sets = se?.user_override?.target_sets ?? se?.target_sets ?? 3;
        return Array.from({ length: sets }, (_, i) => ({
          log_exercise_id: logEx.id,
          set_number: i + 1,
          is_warmup: se?.is_warmup ?? false,
          is_completed: false,
        }));
      });
      if (allSetRows.length > 0) {
        await supabase.from("workout_log_sets").insert(allSetRows);
      }
    }
  }

  return { success: true, data: log.id };
}

// ─── Get active workout log ───────────────────────────────────
export async function getWorkoutLog(logId: string): Promise<WorkoutLogFull | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: log } = await supabase
    .from("workout_logs")
    .select("*, session:program_sessions(*)")
    .eq("id", logId)
    .single();

  if (!log) return null;

  const { data: logExercises } = await supabase
    .from("workout_log_exercises")
    .select("*, exercise:exercises(*)")
    .eq("workout_log_id", logId)
    .order("order_index", { ascending: true });

  if (!logExercises) return { ...log, exercises: [] } as WorkoutLogFull;

  // Fetch sets for all exercises
  const exerciseIds = logExercises.map((e) => e.id);
  const { data: sets } = await supabase
    .from("workout_log_sets")
    .select("*")
    .in("log_exercise_id", exerciseIds)
    .order("set_number", { ascending: true });

  const setsMap = new Map<string, typeof sets>();
  for (const set of sets ?? []) {
    const arr = setsMap.get(set.log_exercise_id) ?? [];
    arr.push(set);
    setsMap.set(set.log_exercise_id, arr);
  }

  // Attach planned data for previous-session comparison
  const exercises = logExercises.map((ex) => ({
    ...ex,
    sets: setsMap.get(ex.id) ?? [],
  }));

  return { ...log, exercises } as WorkoutLogFull;
}

// ─── Update a single set ──────────────────────────────────────
export async function updateSet(
  setId: string,
  data: { weight_kg?: number | null; reps?: number | null; rpe?: number | null; is_completed?: boolean }
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workout_log_sets")
    .update(data)
    .eq("id", setId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─── Add extra set ────────────────────────────────────────────
export async function addSet(logExerciseId: string): Promise<ActionResult<string>> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("workout_log_sets")
    .select("set_number")
    .eq("log_exercise_id", logExerciseId)
    .order("set_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSetNumber = (existing?.set_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("workout_log_sets")
    .insert({ log_exercise_id: logExerciseId, set_number: nextSetNumber, is_completed: false })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data.id };
}

// ─── Delete a set ─────────────────────────────────────────────
export async function deleteSet(setId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_log_sets").delete().eq("id", setId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─── Finish workout ───────────────────────────────────────────
export async function finishWorkout(
  logId: string,
  notes?: string,
  bodyweight?: number
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: log } = await supabase
    .from("workout_logs")
    .select("started_at, session_id, assignment_id")
    .eq("id", logId)
    .single();

  if (!log) return { success: false, error: "Workout not found" };

  const finishedAt = new Date().toISOString();
  const startedAt = log.started_at ? new Date(log.started_at) : new Date();
  const durationMinutes = Math.round((new Date(finishedAt).getTime() - startedAt.getTime()) / 60000);

  const { error } = await supabase
    .from("workout_logs")
    .update({
      status: "completed",
      finished_at: finishedAt,
      duration_minutes: durationMinutes,
      notes: notes ?? null,
      bodyweight_kg: bodyweight ?? null,
    })
    .eq("id", logId);

  if (error) return { success: false, error: error.message };

  // Advance session index
  if (log.assignment_id) {
    const { data: assignment } = await supabase
      .from("user_program_assignments")
      .select("current_session_index, program_id")
      .eq("id", log.assignment_id)
      .single();

    if (assignment) {
      const { data: sessions } = await supabase
        .from("program_sessions")
        .select("id")
        .eq("program_id", assignment.program_id);

      const total = sessions?.length ?? 4;
      const nextIndex = (assignment.current_session_index + 1) % total;

      await supabase
        .from("user_program_assignments")
        .update({ current_session_index: nextIndex })
        .eq("id", log.assignment_id);
    }
  }

  // Save bodyweight metric if provided
  if (bodyweight) {
    const today = new Date().toISOString().split("T")[0];
    await supabase
      .from("body_metrics")
      .upsert({ user_id: user.id, date: today, bodyweight_kg: bodyweight }, { onConflict: "user_id,date" });
  }

  // Check for PRs and record them
  await checkAndRecordPRs(logId, user.id);

  revalidatePath("/dashboard");
  revalidatePath("/history");
  return { success: true, data: undefined };
}

// ─── PR detection ─────────────────────────────────────────────
async function checkAndRecordPRs(logId: string, userId: string) {
  const supabase = await createClient();

  const { data: logExercises } = await supabase
    .from("workout_log_exercises")
    .select("*, sets:workout_log_sets(*)")
    .eq("workout_log_id", logId);

  if (!logExercises) return;

  const today = new Date().toISOString().split("T")[0];

  for (const ex of logExercises) {
    const completedSets = (ex.sets as any[]).filter((s) => s.is_completed && s.weight_kg && s.reps);
    if (!completedSets.length) continue;

    // Best estimated 1RM from this session
    let bestE1RM = 0;
    for (const s of completedSets) {
      const e1rm = s.weight_kg * (1 + s.reps / 30);
      if (e1rm > bestE1RM) bestE1RM = e1rm;
    }

    // Check existing PR
    const { data: existingPR } = await supabase
      .from("personal_records")
      .select("value")
      .eq("user_id", userId)
      .eq("exercise_id", ex.exercise_id)
      .eq("record_type", "estimated_1rm")
      .order("value", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingPR || bestE1RM > existingPR.value) {
      await supabase.from("personal_records").insert({
        user_id: userId,
        exercise_id: ex.exercise_id,
        record_type: "estimated_1rm",
        value: Math.round(bestE1RM * 10) / 10,
        date: today,
        workout_log_id: logId,
      });
    }
  }
}

// ─── Get workout history ──────────────────────────────────────
export async function getWorkoutHistory(userId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const targetId = userId ?? user.id;

  const { data } = await supabase
    .from("workout_logs")
    .select("*, session:program_sessions(title)")
    .eq("user_id", targetId)
    .eq("status", "completed")
    .order("date", { ascending: false })
    .limit(50);

  return data ?? [];
}

// ─── Get previous performance for an exercise ─────────────────
export async function getPreviousPerformance(exerciseId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workout_log_exercises")
    .select("*, sets:workout_log_sets(*), log:workout_logs(date)")
    .eq("exercise_id", exerciseId)
    .eq("workout_logs.user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

// ─── Update exercise override ─────────────────────────────────
export async function upsertExerciseOverride(
  sessionExerciseId: string,
  data: {
    override_exercise_id?: string | null;
    target_sets?: number | null;
    target_reps?: string | null;
    target_rpe?: number | null;
    target_weight_kg?: number | null;
    rest_seconds?: number | null;
    notes?: string | null;
    is_deleted?: boolean;
  },
  forUserId?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const targetUserId = forUserId ?? user.id;

  // Admin check if editing another user
  if (forUserId && forUserId !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return { success: false, error: "Not authorized" };
    }
  }

  const { error } = await supabase
    .from("user_exercise_overrides")
    .upsert(
      { user_id: targetUserId, session_exercise_id: sessionExerciseId, ...data },
      { onConflict: "user_id,session_exercise_id" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/workout");
  return { success: true, data: undefined };
}

// ─── Log bodyweight ───────────────────────────────────────────
export async function logBodyweight(
  weight: number,
  date?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const targetDate = date ?? new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("body_metrics")
    .upsert({ user_id: user.id, date: targetDate, bodyweight_kg: weight }, { onConflict: "user_id,date" });

  if (error) return { success: false, error: error.message };
  revalidatePath("/analytics");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
