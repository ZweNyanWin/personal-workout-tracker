"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, WorkoutLogFull, SessionExerciseWithExercise } from "@/types";
import { bodyweightSchema, workoutSetUpdateSchema } from "@/lib/validations";
import { workoutCompletionSetsSchema, type WorkoutCompletionSet } from "@/lib/workout-completion";

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
    const idx = assignment!.is_finite ? assignment!.current_session_index : assignment!.current_session_index % sessionsResult.data.length;
    nextSession = sessionsResult.data[idx] ?? null;
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

  // Streak: count consecutive days (most recent first) that have a completed workout
  const { data: allLogDates } = await supabase
    .from("workout_logs")
    .select("date")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("date", { ascending: false });

  let currentStreak = 0;
  if (allLogDates && allLogDates.length > 0) {
    const uniqueDates = [...new Set(allLogDates.map((log) => log.date))];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let cursor = new Date(today);
    // Allow today or yesterday as the starting point (don't break streak if not yet worked out today)
    const mostRecent = new Date(uniqueDates[0]);
    mostRecent.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - mostRecent.getTime()) / 86400000);
    if (diffDays <= 1) {
      cursor = mostRecent;
      for (const dateStr of uniqueDates) {
        const d = new Date(dateStr);
        d.setHours(0, 0, 0, 0);
        const gap = Math.round((cursor.getTime() - d.getTime()) / 86400000);
        if (gap > 1) break;
        if (gap === 0 || gap === 1) { currentStreak++; cursor = d; }
      }
    }
  }

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
    currentStreak,
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

  const { data, error } = await supabase.rpc("start_workout_atomically", {
    p_session_id: sessionId,
    p_quick_complete: false,
  });
  if (error || !data) return { success: false, error: error?.message ?? "Failed to start workout" };
  return { success: true, data };
}

// ─── Get active workout log ───────────────────────────────────
export async function getWorkoutLog(logId: string): Promise<(WorkoutLogFull & { canEdit: boolean }) | null> {
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
    .select("*, exercise:exercises(*), planned:session_exercises(*, exercise:exercises(*))")
    .eq("workout_log_id", logId)
    .order("order_index", { ascending: true });

  if (!logExercises) return { ...log, exercises: [], canEdit: false } as WorkoutLogFull & { canEdit: boolean };

  // Older quick completions stored only the session marker. Show its plan as a
  // clearly labelled outline; these rows are display data, never measured sets.
  if (!logExercises.length && log.session_id) {
    const plannedSession = await getSessionWithExercises(log.session_id, log.user_id);
    const exercises = (plannedSession?.exercises ?? []).map((planned) => ({
      id: `planned-${planned.id}`, workout_log_id: log.id,
      exercise_id: planned.exercise_id, session_exercise_id: planned.id,
      order_index: planned.order_index, notes: null, created_at: log.created_at,
      exercise: planned.exercise, planned, planned_snapshot: null, sets: [],
    }));
    return { ...log, exercises, canEdit: false } as WorkoutLogFull & { canEdit: boolean };
  }

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

  // Keep the exact approved dose available while logging holds and repetitions.
  const exercises = logExercises.map((ex) => {
    const snapshot = ex.planned_snapshot;
    const recordedPlan = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? snapshot as unknown as SessionExerciseWithExercise : null;
    return { ...ex, planned: recordedPlan ?? ex.planned,
      exercise: recordedPlan?.exercise ?? ex.exercise, sets: setsMap.get(ex.id) ?? [] };
  });

  return { ...log, exercises, canEdit: log.user_id === user.id && log.status === "in_progress" } as WorkoutLogFull & { canEdit: boolean };
}

// ─── Update a single set ──────────────────────────────────────
export async function updateSet(
  setId: string,
  data: { weight_kg?: number | null; reps?: number | null; hold_seconds?: number | null; rpe?: number | null; is_completed?: boolean }
): Promise<ActionResult> {
  const supabase = await createClient();
  const parsed = workoutSetUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid set values",
    };
  }

  const { error } = await supabase
    .from("workout_log_sets")
    .update({
      ...parsed.data,
      ...(parsed.data.hold_seconds != null ? { reps: null } : {}),
      ...(parsed.data.reps != null ? { hold_seconds: null } : {}),
    })
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
  bodyweight?: number,
  energyRating?: number,
  completionSets?: WorkoutCompletionSet[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const cleanNotes = notes?.trim() || undefined;
  if (cleanNotes && cleanNotes.length > 1000) {
    return { success: false, error: "Notes must be 1,000 characters or fewer" };
  }

  if (bodyweight !== undefined) {
    const parsed = bodyweightSchema.safeParse({ bodyweight_kg: bodyweight });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid bodyweight" };
    }
    bodyweight = parsed.data.bodyweight_kg;
  }

  if (
    energyRating !== undefined &&
    (!Number.isInteger(energyRating) || energyRating < 1 || energyRating > 5)
  ) {
    return { success: false, error: "Energy rating must be between 1 and 5" };
  }

  const parsedSets = workoutCompletionSetsSchema.safeParse(completionSets ?? []);
  if (!parsedSets.success) return { success: false, error: parsedSets.error.issues[0]?.message ?? "Check your entered set values" };
  const { error } = await supabase.rpc("complete_workout_atomically", {
    p_log_id: logId,
    p_sets: parsedSets.data,
    p_notes: cleanNotes ?? null,
    p_bodyweight: bodyweight ?? null,
    p_energy: energyRating ?? null,
  });
  if (error) return { success: false, error: error.message };

  // PRs use only completed measured sets, never planned targets or quick completion.
  await checkAndRecordPRs(logId, user.id);
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/workout");
  revalidatePath(`/log/${logId}`);
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
    const completedSets = ex.sets.filter(
      (set): set is typeof set & { weight_kg: number; reps: number } =>
        set.is_completed && set.hold_seconds === null && set.weight_kg !== null && set.reps !== null
    );
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

// ─── Delete workout log ───────────────────────────────────────
export async function deleteWorkoutLog(logId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const { error } = await supabase
    .from("workout_logs")
    .delete()
    .eq("id", logId)
    .eq("user_id", user.id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/history");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
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
    const { data: allowed, error } = await supabase.rpc("can_coach_member", { p_member_id: targetUserId });
    if (error || allowed !== true) {
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

// ─── Mark session done (without full logging) ────────────────
export async function markSessionDone(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase.rpc("start_workout_atomically", {
    p_session_id: sessionId,
    p_quick_complete: true,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/workout");
  revalidatePath("/dashboard");
  revalidatePath("/history");
  return { success: true, data: undefined };
}

// ─── Unmark session done ──────────────────────────────────────
export async function unmarkSessionDone(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase.rpc("reopen_quick_workout_atomically", {
    p_session_id: sessionId,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/workout");
  revalidatePath("/dashboard");
  revalidatePath("/history");
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

  const parsed = bodyweightSchema.safeParse({ bodyweight_kg: weight, date });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid bodyweight",
    };
  }

  const targetDate = parsed.data.date ?? new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("body_metrics")
    .upsert(
      { user_id: user.id, date: targetDate, bodyweight_kg: parsed.data.bodyweight_kg },
      { onConflict: "user_id,date" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/analytics");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
