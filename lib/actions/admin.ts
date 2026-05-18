"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import {
  canonicalExerciseName,
  normalizeExerciseKey,
  parseProgramTemplateText,
  type ParsedProgramTemplate,
} from "@/lib/program-template-parser";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Not authorized");
  return { supabase, user };
}

// ─── Get all members ──────────────────────────────────────────
export async function getAllMembers() {
  const { supabase } = await requireAdmin();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, username, role, created_at")
    .order("created_at", { ascending: true });

  if (!profiles) return [];

  // Get active assignments for all users
  const { data: assignments } = await supabase
    .from("user_program_assignments")
    .select("id, user_id, program_id, is_active, current_session_index, program:programs(title)")
    .eq("is_active", true)
    .in("user_id", profiles.map((p) => p.id));

  const assignmentMap = new Map(
    (assignments ?? []).map((a) => [a.user_id, a])
  );

  // Get last workout date per user
  const { data: lastLogs } = await supabase
    .from("workout_logs")
    .select("user_id, date")
    .eq("status", "completed")
    .in("user_id", profiles.map((p) => p.id))
    .order("date", { ascending: false })
    .limit(200);

  const lastLogMap = new Map<string, string>();
  for (const log of lastLogs ?? []) {
    if (!lastLogMap.has(log.user_id)) lastLogMap.set(log.user_id, log.date);
  }

  return profiles.map((p) => ({
    ...p,
    active_assignment: assignmentMap.get(p.id) ?? null,
    last_workout: lastLogMap.get(p.id) ?? null,
  }));
}

// ─── Get member detail ────────────────────────────────────────
export async function getMemberDetail(memberId: string) {
  const { supabase } = await requireAdmin();

  const [profileResult, assignmentsResult, recentLogsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, username, avatar_url, role, created_at")
      .eq("id", memberId)
      .single(),
    supabase
      .from("user_program_assignments")
      .select("id, user_id, program_id, assigned_by, is_active, current_session_index, created_at, started_at, program:programs(id, title, description)")
      .eq("user_id", memberId)
      .order("created_at", { ascending: false }),
    supabase
      .from("workout_logs")
      .select("id, title, date, duration_minutes, energy_rating, notes, status, session:program_sessions(title)")
      .eq("user_id", memberId)
      .order("date", { ascending: false })
      .limit(20),
  ]);

  return {
    profile: profileResult.data,
    assignments: assignmentsResult.data ?? [],
    recentLogs: recentLogsResult.data ?? [],
  };
}

// ─── Update member role ───────────────────────────────────────
export async function updateMemberRole(
  memberId: string,
  role: "admin" | "member"
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", memberId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/members");
  return { success: true, data: undefined };
}

// ─── Assign program to member ─────────────────────────────────
export async function assignProgram(
  userId: string,
  programId: string
): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const result = await assignProgramForUser(supabase, user.id, userId, programId);
  if (!result.success) return result;
  revalidatePath(`/admin/members/${userId}`);
  return { success: true, data: undefined };
}

async function assignProgramForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminUserId: string,
  userId: string,
  programId: string
): Promise<ActionResult> {
  // Deactivate existing active assignments
  await supabase
    .from("user_program_assignments")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  // Create new assignment
  const { error } = await supabase
    .from("user_program_assignments")
    .upsert(
      {
        user_id: userId,
        program_id: programId,
        assigned_by: adminUserId,
        is_active: true,
        current_session_index: 0,
      },
      { onConflict: "user_id,program_id" }
    );

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─── Create block ─────────────────────────────────────────────
export async function createBlock(
  programId: string,
  title: string,
  durationWeeks?: number
): Promise<ActionResult<string>> {
  const { supabase } = await requireAdmin();

  const { data: last } = await supabase
    .from("program_blocks")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const order_index = (last?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("program_blocks")
    .insert({ program_id: programId, title, order_index, duration_weeks: durationWeeks ?? null })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: data.id };
}

// ─── Create session ───────────────────────────────────────────
export async function createSession(
  programId: string,
  blockId: string,
  title: string,
  notes?: string
): Promise<ActionResult<string>> {
  const { supabase } = await requireAdmin();

  const { data: last } = await supabase
    .from("program_sessions")
    .select("session_order")
    .eq("program_id", programId)
    .order("session_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const session_order = (last?.session_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("program_sessions")
    .insert({ program_id: programId, block_id: blockId, title, session_order, notes: notes ?? null })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: data.id };
}

// ─── Get single program detail ────────────────────────────────
export async function getProgramDetail(programId: string) {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("programs")
    .select("*, blocks:program_blocks(*, sessions:program_sessions(*, exercises:session_exercises(id)))")
    .eq("id", programId)
    .single();

  return data ?? null;
}

// ─── Get all programs ─────────────────────────────────────────
export async function getAllPrograms() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("programs")
    .select("id, title, description, is_template, created_at, blocks:program_blocks(id, title, order_index, duration_weeks, sessions:program_sessions(id, title, notes, session_order, exercises:session_exercises(id)))")
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getProgramOptions() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("programs")
    .select("id, title")
    .order("created_at", { ascending: false });

  return data ?? [];
}

// ─── Create program ───────────────────────────────────────────
export async function createProgram(
  title: string,
  description: string
): Promise<ActionResult<string>> {
  const { supabase, user } = await requireAdmin();

  const { data, error } = await supabase
    .from("programs")
    .insert({ title, description, created_by: user.id, is_template: true })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: data.id };
}

// ─── Import pasted mesocycle / program template ───────────────
export async function importProgramTemplate(
  payload: {
    title?: string;
    rawText: string;
    addStrengthExposureSingles?: boolean;
    strengthExposurePercent?: number;
  }
): Promise<ActionResult<string>> {
  const { supabase, user } = await requireAdmin();

  let parsed;
  try {
    parsed = parseProgramTemplateText(
      payload.rawText,
      payload.title,
      {
        enabled: Boolean(payload.addStrengthExposureSingles),
        percent1rm: payload.strengthExposurePercent ?? 82.5,
      }
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not parse template",
    };
  }

  try {
    const programId = await createProgramFromParsedTemplate(supabase, user.id, parsed);
    revalidatePath("/admin/programs");
    return { success: true, data: programId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create program",
    };
  }
}

// ─── Paste import and immediately assign to one member ────────
export async function importAndAssignProgramTemplate(
  userId: string,
  payload: {
    title?: string;
    rawText: string;
    addStrengthExposureSingles?: boolean;
    strengthExposurePercent?: number;
  }
): Promise<ActionResult<string>> {
  const { supabase, user } = await requireAdmin();

  let parsed;
  try {
    parsed = parseProgramTemplateText(
      payload.rawText,
      payload.title,
      {
        enabled: Boolean(payload.addStrengthExposureSingles),
        percent1rm: payload.strengthExposurePercent ?? 82.5,
      }
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not parse template",
    };
  }

  try {
    const programId = await createProgramFromParsedTemplate(supabase, user.id, parsed);
    const assigned = await assignProgramForUser(supabase, user.id, userId, programId);
    if (!assigned.success) return { success: false, error: assigned.error };

    revalidatePath(`/admin/members/${userId}`);
    revalidatePath("/admin/members");
    revalidatePath("/admin/programs");
    return { success: true, data: programId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to import and assign program",
    };
  }
}

// ─── Create coach starter templates ───────────────────────────
export async function createStarterTemplates(): Promise<ActionResult<{ created: number; skipped: number }>> {
  const { supabase, user } = await requireAdmin();

  let created = 0;
  let skipped = 0;

  for (const template of STARTER_TEMPLATE_TEXTS) {
    const { data: existing } = await supabase
      .from("programs")
      .select("id")
      .eq("title", template.title)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    try {
      const parsed = parseProgramTemplateText(template.text, template.title);
      await createProgramFromParsedTemplate(supabase, user.id, parsed);
      created += 1;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : `Failed to create ${template.title}`,
      };
    }
  }

  revalidatePath("/admin/programs");
  return { success: true, data: { created, skipped } };
}

async function createProgramFromParsedTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  parsed: ParsedProgramTemplate
) {
  const { data: program, error: programError } = await supabase
    .from("programs")
    .insert({
      title: parsed.title,
      description: parsed.description,
      created_by: userId,
      is_template: true,
    })
    .select("id")
    .single();

  if (programError || !program) {
    throw new Error(programError?.message ?? "Failed to create program");
  }

  const exerciseIdByName = await buildExerciseLookup(supabase);
  let sessionOrder = 0;

  for (const [weekIndex, week] of parsed.weeks.entries()) {
    const { data: block, error: blockError } = await supabase
      .from("program_blocks")
      .insert({
        program_id: program.id,
        title: week.title,
        order_index: weekIndex,
        duration_weeks: 1,
      })
      .select("id")
      .single();

    if (blockError || !block) {
      throw new Error(blockError?.message ?? `Failed to create ${week.title}`);
    }

    for (const session of week.sessions) {
      const { data: createdSession, error: sessionError } = await supabase
        .from("program_sessions")
        .insert({
          block_id: block.id,
          program_id: program.id,
          title: session.title,
          session_order: sessionOrder,
          notes: session.notes,
        })
        .select("id")
        .single();

      if (sessionError || !createdSession) {
        throw new Error(sessionError?.message ?? `Failed to create ${session.title}`);
      }

      const rows = [];
      for (const [exerciseIndex, exercise] of session.exercises.entries()) {
        const exerciseId = await getOrCreateExerciseId(
          supabase,
          userId,
          exercise.name,
          exerciseIdByName
        );

        rows.push({
          session_id: createdSession.id,
          exercise_id: exerciseId,
          order_index: exerciseIndex,
          target_sets: exercise.target_sets,
          target_reps: exercise.target_reps,
          target_rpe: exercise.target_rpe,
          target_weight_kg: exercise.target_weight_kg,
          percent_1rm: exercise.percent_1rm,
          rest_seconds: inferRestSeconds(exercise.name),
          notes: exercise.notes,
          is_warmup: false,
        });
      }

      if (rows.length > 0) {
        const { error: exerciseError } = await supabase.from("session_exercises").insert(rows);
        if (exerciseError) throw new Error(exerciseError.message);
      }

      sessionOrder += 1;
    }
  }

  return program.id;
}

// ─── Manage exercises ─────────────────────────────────────────
export async function getAllExercises(includePrivate = false) {
  const supabase = await createClient();

  const query = supabase
    .from("exercises")
    .select("*")
    .order("name", { ascending: true });

  if (!includePrivate) query.eq("is_public", true);

  const { data } = await query;
  return data ?? [];
}

export async function createExercise(
  payload: {
    name: string;
    description?: string;
    muscle_groups: string[];
    movement_type: string;
    equipment: string;
    is_compound: boolean;
    primary_lift?: string;
  }
): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      ...payload,
      created_by: user.id,
      primary_lift: payload.primary_lift as any || null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/exercises");
  return { success: true, data: data.id };
}

export async function updateExercise(
  id: string,
  payload: Partial<{
    name: string;
    description: string;
    muscle_groups: string[];
    movement_type: string;
    equipment: string;
    is_compound: boolean;
    primary_lift: "bench" | "squat" | "deadlift" | null;
  }>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("exercises")
    .update(payload)
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/exercises");
  revalidatePath("/admin/exercises");
  return { success: true, data: undefined };
}

// ─── Add session exercise (admin) ─────────────────────────────
export async function addSessionExercise(
  sessionId: string,
  exerciseId: string,
  prescription: {
    target_sets?: number;
    target_reps?: string;
    target_rpe?: number;
    target_weight_kg?: number;
    rest_seconds?: number;
    notes?: string;
    is_warmup?: boolean;
  }
): Promise<ActionResult<string>> {
  const { supabase } = await requireAdmin();

  // Get max order_index
  const { data: last } = await supabase
    .from("session_exercises")
    .select("order_index")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const order_index = (last?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("session_exercises")
    .insert({ session_id: sessionId, exercise_id: exerciseId, order_index, ...prescription })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: data.id };
}

// ─── Delete exercise ──────────────────────────────────────────
export async function deleteExercise(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("exercises").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/exercises");
  revalidatePath("/admin/exercises");
  return { success: true, data: undefined };
}

// ─── Delete program (admin) ──────────────────────────────────
export async function deleteProgram(programId: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  // Remove assignments first to satisfy the foreign key constraint
  await supabase.from("user_program_assignments").delete().eq("program_id", programId);
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  revalidatePath("/admin/members");
  return { success: true, data: undefined };
}

// ─── Delete block (admin) ────────────────────────────────────
export async function deleteBlock(blockId: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("program_blocks").delete().eq("id", blockId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: undefined };
}

// ─── Update session (admin) ───────────────────────────────────
export async function updateSession(sessionId: string, title: string, notes?: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("program_sessions")
    .update({ title: title.trim(), notes: notes?.trim() || null })
    .eq("id", sessionId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: undefined };
}

// ─── Delete session (admin) ───────────────────────────────────
export async function deleteSession(sessionId: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("program_sessions").delete().eq("id", sessionId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: undefined };
}

// ─── Remove session exercise (admin) ─────────────────────────
export async function removeSessionExercise(seId: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("session_exercises").delete().eq("id", seId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: undefined };
}

// ─── Get session with exercises (for detail view) ─────────────
export async function getSessionWithExercises(sessionId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [sessionResult, profileResult] = await Promise.all([
    supabase
    .from("program_sessions")
    .select("*, block:program_blocks(title, order_index)")
    .eq("id", sessionId)
      .single(),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const session = sessionResult.data;

  if (!session) return null;

  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("*, exercise:exercises(*)")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  return {
    ...session,
    exercises: exercises ?? [],
    viewer_role: profileResult.data?.role ?? "member",
  };
}

// ─── Update session exercise (admin) ──────────────────────────
export async function updateSessionExercise(
  seId: string,
  data: {
    target_sets?: number | null;
    target_reps?: string | null;
    target_rpe?: number | null;
    target_weight_kg?: number | null;
    rest_seconds?: number | null;
    notes?: string | null;
  }
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("session_exercises")
    .update(data)
    .eq("id", seId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/programs");
  return { success: true, data: undefined };
}

const STARTER_TEMPLATE_TEXTS = [
  {
    title: "4-Week Hypertrophy Template",
    text: `4-Week Hypertrophy Template
Focus: Hypertrophy, technique, rebuilding after heavy singles.
WEEK 1 (Hypertrophy Base) Day 1 - Upper A
1. Bench: 3x5 @ 72.5% (leave 1-2 reps in tank)
2. Weighted Pull-ups: 4x6 @ 1 RIR
3. Incline Smith Press: 2x8 @ RPE 8 (last set technical failure)
4. Chest-Supported Row: 2x8-12 (last set to failure)
5. Cable Fly / Pec Deck: 2x12-15 (last set to failure)
6. Tricep Pushdown: 2x10-15 (last set to failure)
Day 2 - Lower A
1. High-Bar Squat: 3x6 @ 70% (smooth, no grinding)
2. Paused High-Bar Squat: 2x4 @ 65%
3. RDL: 3x8 @ RPE 7
4. Leg Press: 2x10-15 (last set to failure)
5. Leg Extension: 2x12-15 (last set to failure)
Day 3 - Upper B
1. Larsen Press: 3x8 @ 70% (leave 1-2 reps in tank)
2. Pull-ups: 3x10 @ 1 RIR
3. Close-Grip Bench: 2x10 @ 67.5%
4. Lat Pulldown: 2x10-15 (last set to failure)
5. Lateral Raise: 2x12-20 (last set to failure)
6. Curls: 2x10-15 (last set to failure)
Day 4 - Lower B
1. Tempo High-Bar Squat: 3x5 @ 65%
2. RDL: 3x6 @ RPE 7.5
3. Hamstring Curl: 2x10-15 (last set to failure)
4. Bulgarian Split Squat: 2x8-12 (last set to failure)
5. Abs: 2x10-15 (last set to failure)
WEEK 2 (Small Step Up)
* Upper A: Bench: 3x5 @ 75% | Weighted Pull-ups: 4x6 @ RPE 8 | Incline Smith Press: 2x8 @ RPE 8.5 | Accessories: last set failure
* Lower A: High-Bar Squat: 3x6 @ 72.5% | Paused High-Bar Squat: 2x4 @ 67.5% | RDL: 3x8 @ RPE 7.5 | Accessories: last set failure
* Upper B: Larsen Press: 3x8 @ 72.5% | Pull-ups: 3x10 @ RPE 8 | Close-Grip Bench: 2x10 @ 70% | Accessories: last set failure
* Lower B: Tempo High-Bar Squat: 3x5 @ 67.5% | RDL: 3x6 @ RPE 8 | Accessories: last set failure
WEEK 3 (Safe Hard)
* Upper A: Bench: 3x5 @ 77.5% | Weighted Pull-ups: 4x6 @ RPE 8.5 | Incline Smith Press: 2x8 @ RPE 9 | Accessories: last set failure
* Lower A: High-Bar Squat: 3x6 @ 75% | Paused High-Bar Squat: 2x4 @ 70% | RDL: 3x8 @ RPE 8 | Accessories: last set failure
* Upper B: Larsen Press: 3x8 @ 75% | Pull-ups: 3x10 @ RPE 8.5 | Close-Grip Bench: 2x10 @ 72.5% | Accessories: last set failure
* Lower B: Tempo High-Bar Squat: 3x5 @ 70% | RDL: 3x6 @ RPE 8.5 | Accessories: last set failure
WEEK 4 (Deload)
* Upper A: Bench: 2x5 @ 67.5% | Weighted Pull-ups: 3x5 @ RPE 6 | Incline Smith Press: 2x8 @ RPE 6 | Accessories: 1 set, 2 RIR
* Lower A: High-Bar Squat: 2x6 @ 65% | Paused High-Bar Squat: 2x4 @ 60% | RDL: 2x8 @ RPE 6 | Accessories: 1 set, 2 RIR
* Upper B: Larsen Press: 2x8 @ 65% | Pull-ups: 3x8 @ RPE 6 | Close-Grip Bench: 2x8 @ 62.5% | Accessories: 1 set, 2 RIR
* Lower B: Tempo High-Bar Squat: 2x5 @ 60% | RDL: 2x6 @ RPE 6 | Accessories: 1 set, 2 RIR`,
  },
  {
    title: "4-Week Strength Base Template",
    text: `4-Week Strength Base Template
Focus: Heavy exposure singles at RPE 7-8 with 70-80% backdowns. If a single feels like RPE 9+, drop backdowns by 5%.
WEEK 1 (Intro to Heavy) Day 1 - Upper A
1. Bench Single: 1x1 @ 82.5% (Fast, RPE 7)
2. Bench Backdown: 3x4 @ 75%
3. Weighted Pull-ups: 4x5 @ RPE 8
4. Incline Smith Press: 2x8 @ RPE 8
5. Chest-Supported Row: 3x8-10 (1 RIR)
6. Tricep Pushdown: 3x10-12
Day 2 - Lower A
1. Squat Single: 1x1 @ 82.5% (Fast, RPE 7)
2. Squat Backdown: 3x4 @ 72.5%
3. Paused High-Bar Squat: 2x4 @ 67.5%
4. Leg Press: 3x10-12
5. Leg Extension: 2x12-15
Day 3 - Upper B
1. Larsen Press: 3x6 @ 75% (1-2 RIR)
2. Pull-ups: 3x10 @ RPE 8
3. Close-Grip Bench: 3x8 @ 70%
4. Lat Pulldown: 3x10-12
5. Lateral Raise: 3x12-15
6. Curls: 3x10-12
Day 4 - Lower B
1. Deadlift Single: 1x1 @ 82.5% (Smooth, RPE 7)
2. Deadlift Backdown: 3x4 @ 75%
3. Paused High-Bar Squat: 3x4 @ 67.5%
4. Hamstring Curl: 3x10-12
5. Abs: 3x10-15
WEEK 2 (Build Momentum)
* Upper A: Bench Single: 1x1 @ 85% | Bench Backdown: 4x4 @ 77.5% | Weighted Pull-ups: 4x5 @ RPE 8.5 | Incline Smith Press: 2x8 @ RPE 8.5 | Accessories: 1 RIR
* Lower A: Squat Single: 1x1 @ 85% | Squat Backdown: 4x4 @ 75% | Paused High-Bar Squat: 2x4 @ 70% | Accessories: 1 RIR
* Upper B: Larsen Press: 3x6 @ 77.5% | Pull-ups: 3x10 @ RPE 8.5 | Close-Grip Bench: 3x8 @ 72.5% | Accessories: 1 RIR
* Lower B: Deadlift Single: 1x1 @ 85% | Deadlift Backdown: 3x4 @ 77.5% | Paused High-Bar Squat: 3x4 @ 70% | Accessories: 1 RIR
WEEK 3 (Peak Single Week)
* Upper A: Bench Single: 1x1 @ 87.5% | Bench Backdown: 3x3 @ 80% | Weighted Pull-ups: 4x4 @ RPE 9 | Incline Smith Press: 2x8 @ RPE 9 | Accessories: 1 RIR
* Lower A: Squat Single: 1x1 @ 87.5% | Squat Backdown: 3x3 @ 77.5% | Paused High-Bar Squat: 2x3 @ 72.5% | Accessories: 1 RIR
* Upper B: Larsen Press: 3x5 @ 80% | Pull-ups: 3x8 @ RPE 8.5 | Close-Grip Bench: 3x6 @ 75% | Accessories: 1 RIR
* Lower B: Deadlift Single: 1x1 @ 87.5% | Deadlift Backdown: 3x3 @ 80% | Paused High-Bar Squat: 2x4 @ 72.5% | Accessories: 1 RIR
WEEK 4 (Deload)
* Upper A: Bench: 3x4 @ 70% | Weighted Pull-ups: 3x5 @ RPE 6 | Incline Smith Press: 2x8 @ RPE 6 | Accessories: 2 RIR
* Lower A: High-Bar Squat: 3x4 @ 67.5% | Leg Press: 2x10 @ RPE 6 | Leg Extension: 2x12 @ RPE 6 | Accessories: 2 RIR
* Upper B: Larsen Press: 2x6 @ 65% | Pull-ups: 3x8 @ RPE 6 | Close-Grip Bench: 2x6 @ 65% | Accessories: 2 RIR
* Lower B: Conventional Deadlift: 2x4 @ 70% | Paused High-Bar Squat: 2x4 @ 60% | Accessories: 2 RIR`,
  },
  {
    title: "4-Week Bench Specialization Template",
    text: `4-Week Bench Specialization Template
Focus: Peak bench while lower body stays on maintenance. Heavy bench exposure, triceps, lats, and low fatigue legs.
WEEK 1 (Heavy Primer) Day 1 - Upper A
1. Bench Single: 1x1 @ 85% (RPE 8)
2. Bench Backdown: 3x3 @ 77.5%
3. Weighted Pull-ups: 4x5 @ RPE 8
4. Incline Smith Press: 2x8 @ RPE 8
5. Chest-Supported Row: 3x8 (1 RIR)
6. Tricep Pushdown: 3x10
Day 2 - Lower A
1. High-Bar Squat: 3x5 @ 67.5% (RPE 6.5)
2. Leg Press: 2x10
3. Leg Extension: 2x12
4. Calf Raises: 2x15
Day 3 - Upper B
1. Pin Press / Slingshot Bench: 3x3 @ 82.5%
2. Larsen Press: 3x5 @ 77.5%
3. Pull-ups: 3x10 @ RPE 8
4. Lat Pulldown: 3x10
5. Lateral Raise: 3x12
6. Curls: 3x10
Day 4 - Lower B
1. Conventional Deadlift: 3x4 @ 70% (RPE 6.5)
2. Paused High-Bar Squat: 2x4 @ 60%
3. Hamstring Curl: 2x10
4. Abs: 3x15
WEEK 2 (Peak Intensity)
* Upper A: Bench Single: 1x1 @ 87.5% | Bench Backdown: 3x2 @ 80% | Weighted Pull-ups: 4x4 @ RPE 8.5 | Incline Smith Press: 2x6 @ RPE 8.5 | Accessories: 1 RIR
* Lower A: High-Bar Squat: 3x5 @ 70% | Leg Press: 2x10 @ RPE 6 | Leg Extension: 2x12 @ RPE 6 | Accessories: 2 RIR
* Upper B: Pin Press / Slingshot Bench: 3x2 @ 85% | Larsen Press: 3x4 @ 80% | Pull-ups: 3x10 @ RPE 8.5 | Accessories: 1 RIR
* Lower B: Conventional Deadlift: 3x3 @ 72.5% | Paused High-Bar Squat: 2x4 @ 62.5% | Accessories: 2 RIR
WEEK 3 (Taper)
* Upper A: Bench Single: 1x1 @ 82.5% | Bench Backdown: 2x3 @ 70% | Pull-ups: 3x8 @ RPE 6 | Chest-Supported Row: 2x10 @ RPE 6 | Accessories: light
* Lower A: High-Bar Squat: 2x4 @ 60% | Leg Press: 2x10 @ RPE 6
* Upper B: Bench: 3x3 @ 60% | Lat Pulldown: 2x12 @ RPE 6 | Lateral Raise: 2x15 @ RPE 6
* Lower B: Hamstring Curl: 2x10 @ RPE 6 | Abs: 2x15 @ RPE 6
WEEK 4 (Test / Reset)
* Upper A: Bench Single: 1x1 @ 90% | Bench Single: 1x1 @ 95% | Bench Single: 1x1 @ 100% | Chest-Supported Row: 2x10 @ RPE 6
* Lower A: High-Bar Squat: 2x5 @ 55% | Leg Extension: 2x12 @ RPE 6
* Upper B: Bench: 3x5 @ 55% | Pull-ups: 3x8 @ RPE 6 | Curls: 2x12 @ RPE 6
* Lower B: Conventional Deadlift: 2x4 @ 60% | Abs: 2x15 @ RPE 6`,
  },
  {
    title: "4-Week Squat Specialization Template",
    text: `4-Week Squat Specialization Template
Focus: Peak squat with frequent heavy exposure, paused work, and low-fatigue upper maintenance.
WEEK 1 (Heavy Primer) Day 1 - Upper A
1. Bench Single: 1x1 @ 80% (RPE 7)
2. Bench Backdown: 3x4 @ 72.5%
3. Weighted Pull-ups: 3x6 @ RPE 8
4. Incline Smith Press: 2x8 @ RPE 7
5. Chest-Supported Row: 2x10
Day 2 - Lower A
1. Squat Single: 1x1 @ 85% (RPE 7.5)
2. Squat Backdown: 4x3 @ 77.5%
3. Paused High-Bar Squat: 3x3 @ 70%
4. Leg Press: 2x10
5. Abs: 3x10-15
Day 3 - Upper B
1. Larsen Press: 3x6 @ 70%
2. Pull-ups: 3x8 @ RPE 7
3. Close-Grip Bench: 2x8 @ 67.5%
4. Lat Pulldown: 2x10
5. Lateral Raise: 2x12
Day 4 - Lower B
1. Tempo High-Bar Squat: 4x4 @ 70%
2. RDL: 3x6 @ RPE 7.5
3. Hamstring Curl: 3x10
4. Bulgarian Split Squat: 2x8
WEEK 2 (Build)
* Upper A: Bench Single: 1x1 @ 82.5% | Bench Backdown: 3x4 @ 75% | Accessories: 1-2 RIR
* Lower A: Squat Single: 1x1 @ 87.5% | Squat Backdown: 4x3 @ 80% | Paused High-Bar Squat: 3x2 @ 72.5% | Accessories: 1 RIR
* Upper B: Larsen Press: 3x6 @ 72.5% | Pull-ups: 3x8 @ RPE 7.5 | Close-Grip Bench: 2x8 @ 70% | Accessories: 1-2 RIR
* Lower B: Tempo High-Bar Squat: 4x3 @ 72.5% | RDL: 3x5 @ RPE 8 | Accessories: 1 RIR
WEEK 3 (Peak Single)
* Upper A: Bench Single: 1x1 @ 82.5% | Bench Backdown: 2x3 @ 72.5% | Accessories: 2 RIR
* Lower A: Squat Single: 1x1 @ 90% | Squat Backdown: 3x2 @ 82.5% | Paused High-Bar Squat: 2x2 @ 75% | Accessories: 1 RIR
* Upper B: Larsen Press: 2x5 @ 70% | Pull-ups: 3x8 @ RPE 7 | Accessories: 2 RIR
* Lower B: Tempo High-Bar Squat: 3x3 @ 75% | RDL: 2x5 @ RPE 7.5 | Accessories: 1-2 RIR
WEEK 4 (Deload)
* Upper A: Bench: 3x4 @ 65% | Weighted Pull-ups: 2x6 @ RPE 6 | Accessories: 2 RIR
* Lower A: High-Bar Squat: 3x3 @ 67.5% | Paused High-Bar Squat: 2x3 @ 60% | Leg Press: 2x10 @ RPE 6
* Upper B: Larsen Press: 2x6 @ 60% | Lat Pulldown: 2x10 @ RPE 6 | Lateral Raise: 2x12 @ RPE 6
* Lower B: Tempo High-Bar Squat: 2x4 @ 60% | Hamstring Curl: 2x10 @ RPE 6 | Abs: 2x15 @ RPE 6`,
  },
  {
    title: "4-Week Deadlift Specialization Template",
    text: `4-Week Deadlift Specialization Template
Focus: Peak conventional deadlift while bench and squat stay exposed but controlled. No grinding.
WEEK 1 (Heavy Primer) Day 1 - Upper A
1. Bench Single: 1x1 @ 80% (RPE 7)
2. Bench Backdown: 3x4 @ 72.5%
3. Weighted Pull-ups: 4x5 @ RPE 8
4. Chest-Supported Row: 3x8
5. Tricep Pushdown: 2x12
Day 2 - Lower A
1. Squat Single: 1x1 @ 80% (RPE 7)
2. Squat Backdown: 3x4 @ 72.5%
3. Paused High-Bar Squat: 2x4 @ 65%
4. Leg Press: 2x10
5. Abs: 3x10-15
Day 3 - Upper B
1. Larsen Press: 3x6 @ 72.5%
2. Pull-ups: 3x8 @ RPE 8
3. Close-Grip Bench: 2x8 @ 70%
4. Lat Pulldown: 3x10
5. Curls: 2x12
Day 4 - Lower B
1. Deadlift Single: 1x1 @ 85% (Smooth, RPE 7.5)
2. Deadlift Backdown: 4x3 @ 77.5%
3. RDL: 3x6 @ RPE 7
4. Hamstring Curl: 3x10
5. Abs: 3x15
WEEK 2 (Build)
* Upper A: Bench Single: 1x1 @ 82.5% | Bench Backdown: 3x3 @ 75% | Weighted Pull-ups: 4x5 @ RPE 8.5 | Accessories: 1 RIR
* Lower A: Squat Single: 1x1 @ 82.5% | Squat Backdown: 3x3 @ 75% | Paused High-Bar Squat: 2x3 @ 67.5% | Accessories: 2 RIR
* Upper B: Larsen Press: 3x6 @ 75% | Pull-ups: 3x8 @ RPE 8 | Close-Grip Bench: 2x8 @ 72.5% | Accessories: 1 RIR
* Lower B: Deadlift Single: 1x1 @ 87.5% | Deadlift Backdown: 4x3 @ 80% | RDL: 3x5 @ RPE 7.5 | Accessories: 1 RIR
WEEK 3 (Peak Pull)
* Upper A: Bench Single: 1x1 @ 82.5% | Bench Backdown: 2x3 @ 72.5% | Accessories: 2 RIR
* Lower A: Squat Single: 1x1 @ 82.5% | Squat Backdown: 2x3 @ 72.5% | Leg Press: 2x8 @ RPE 6 | Accessories: 2 RIR
* Upper B: Larsen Press: 2x5 @ 70% | Pull-ups: 3x8 @ RPE 7 | Lat Pulldown: 2x10 @ RPE 7
* Lower B: Deadlift Single: 1x1 @ 90% | Deadlift Backdown: 3x2 @ 82.5% | RDL: 2x5 @ RPE 7 | Hamstring Curl: 2x10
WEEK 4 (Deload)
* Upper A: Bench: 3x4 @ 65% | Weighted Pull-ups: 2x6 @ RPE 6 | Accessories: 2 RIR
* Lower A: High-Bar Squat: 2x4 @ 60% | Leg Press: 2x10 @ RPE 6 | Abs: 2x15
* Upper B: Larsen Press: 2x6 @ 60% | Lat Pulldown: 2x10 @ RPE 6 | Curls: 2x12 @ RPE 6
* Lower B: Conventional Deadlift: 3x3 @ 70% | RDL: 2x6 @ RPE 6 | Hamstring Curl: 2x10 @ RPE 6`,
  },
];

async function buildExerciseLookup(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("exercises").select("id, name");
  const map = new Map<string, string>();

  for (const exercise of data ?? []) {
    map.set(normalizeExerciseKey(exercise.name), exercise.id);
    map.set(normalizeExerciseKey(canonicalExerciseName(exercise.name)), exercise.id);
  }

  return map;
}

async function getOrCreateExerciseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rawName: string,
  exerciseIdByName: Map<string, string>
) {
  const canonicalName = canonicalExerciseName(rawName);
  const key = normalizeExerciseKey(canonicalName);
  const existing = exerciseIdByName.get(key);
  if (existing) return existing;

  const metadata = inferExerciseMetadata(canonicalName);
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      name: canonicalName,
      description: null,
      muscle_groups: metadata.muscle_groups,
      movement_type: metadata.movement_type,
      equipment: metadata.equipment,
      is_compound: metadata.is_compound,
      primary_lift: metadata.primary_lift,
      created_by: userId,
      is_public: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `Failed to create ${canonicalName}`);
  }

  exerciseIdByName.set(key, data.id);
  return data.id;
}

function inferExerciseMetadata(name: string): {
  muscle_groups: string[];
  movement_type: string;
  equipment: string;
  is_compound: boolean;
  primary_lift: "bench" | "squat" | "deadlift" | null;
} {
  const key = normalizeExerciseKey(name);

  if (/\bbench\b/.test(key) || /\bpress\b/.test(key) || /\bdips?\b/.test(key)) {
    return {
      muscle_groups: ["chest", "triceps", "front_delt"],
      movement_type: "push",
      equipment: /\bsmith\b/.test(key) ? "machine" : /\bdips?\b/.test(key) ? "bodyweight" : "barbell",
      is_compound: true,
      primary_lift: /\bbench\b/.test(key) ? "bench" : null,
    };
  }

  if (/\bsquat\b/.test(key) || /\bleg press\b/.test(key) || /\bleg extension\b/.test(key)) {
    return {
      muscle_groups: /\bleg extension\b/.test(key) ? ["quads"] : ["quads", "glutes"],
      movement_type: "squat",
      equipment: /\bleg\b/.test(key) ? "machine" : "barbell",
      is_compound: !/\bleg extension\b/.test(key),
      primary_lift: /\bsquat\b/.test(key) ? "squat" : null,
    };
  }

  if (/\brdl\b/.test(key) || /\bdeadlift\b/.test(key) || /\bcurl\b/.test(key) && /\bhamstring\b/.test(key)) {
    return {
      muscle_groups: ["hamstrings", "glutes"],
      movement_type: "hinge",
      equipment: /\bcurl\b/.test(key) ? "machine" : "barbell",
      is_compound: !/\bcurl\b/.test(key),
      primary_lift: /\bdeadlift\b/.test(key) || /\brdl\b/.test(key) ? "deadlift" : null,
    };
  }

  if (/\brow\b/.test(key) || /\bpull\b/.test(key) || /\bpulldown\b/.test(key)) {
    return {
      muscle_groups: ["lats", "biceps", "rear_delt"],
      movement_type: "pull",
      equipment: /\bpulldown\b/.test(key) ? "cable" : /\bpull\b/.test(key) ? "bodyweight" : "machine",
      is_compound: true,
      primary_lift: null,
    };
  }

  if (/\bfly\b/.test(key) || /\bpushdown\b/.test(key) || /\blateral raise\b/.test(key) || /\bcurl\b/.test(key)) {
    return {
      muscle_groups: /\bpushdown\b/.test(key)
        ? ["triceps"]
        : /\bcurl\b/.test(key)
        ? ["biceps"]
        : /\blateral raise\b/.test(key)
        ? ["side_delt"]
        : ["chest"],
      movement_type: "accessory",
      equipment: /\bcable\b/.test(key) || /\bfly\b/.test(key) || /\bpushdown\b/.test(key) ? "cable" : "dumbbell",
      is_compound: false,
      primary_lift: null,
    };
  }

  return {
    muscle_groups: ["other"],
    movement_type: "accessory",
    equipment: "other",
    is_compound: false,
    primary_lift: null,
  };
}

function inferRestSeconds(name: string) {
  const key = normalizeExerciseKey(name);
  if (/\bsingle\b/.test(key) || /\bbench\b/.test(key) || /\bsquat\b/.test(key) || /\bdeadlift\b/.test(key)) {
    return 180;
  }
  if (/\brdl\b/.test(key) || /\bpull\b/.test(key) || /\brow\b/.test(key)) return 120;
  return 75;
}
