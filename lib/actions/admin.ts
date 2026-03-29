"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

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
    .select("*")
    .order("created_at", { ascending: true });

  if (!profiles) return [];

  // Get active assignments for all users
  const { data: assignments } = await supabase
    .from("user_program_assignments")
    .select("*, program:programs(title)")
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
    .order("date", { ascending: false });

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
    supabase.from("profiles").select("*").eq("id", memberId).single(),
    supabase
      .from("user_program_assignments")
      .select("*, program:programs(*)")
      .eq("user_id", memberId)
      .order("created_at", { ascending: false }),
    supabase
      .from("workout_logs")
      .select("*, session:program_sessions(title)")
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
        assigned_by: user.id,
        is_active: true,
        current_session_index: 0,
      },
      { onConflict: "user_id,program_id" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/members/${userId}`);
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
    .select("*, blocks:program_blocks(*, sessions:program_sessions(*, exercises:session_exercises(id)))")
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

  const { data: session } = await supabase
    .from("program_sessions")
    .select("*, block:program_blocks(title, order_index)")
    .eq("id", sessionId)
    .single();

  if (!session) return null;

  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("*, exercise:exercises(*)")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  return { ...session, exercises: exercises ?? [] };
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
