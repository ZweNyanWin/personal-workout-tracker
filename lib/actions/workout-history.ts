"use server";

import { createClient } from "@/lib/supabase/server";
import { buildWorkoutHistoryQuery, parseWorkoutHistoryFilters, WORKOUT_HISTORY_PAGE_SIZE,
  type HistorySearchParams, type WorkoutHistoryFilters, type WorkoutHistoryLog } from "@/lib/history/workout-history-query";

export type WorkoutHistoryPageResult = {
  logs: WorkoutHistoryLog[]; totalCount: number; pageCount: number; filters: WorkoutHistoryFilters;
  isOwnHistory: boolean; member: { id: string; full_name: string | null; username: string | null };
};

export async function getWorkoutHistoryPage(params: HistorySearchParams = {}): Promise<WorkoutHistoryPageResult | null> {
  const filters = parseWorkoutHistoryFilters(params);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const targetId = filters.memberId ?? user.id;
  if (targetId !== user.id) {
    const { data, error } = await supabase.rpc("can_coach_member", { p_member_id: targetId });
    if (error || data !== true) throw new Error("Workout history is unavailable for this member.");
  }
  const { data: member, error: memberError } = await supabase.from("profiles")
    .select("id,full_name,username").eq("id", targetId).single();
  if (memberError || !member) throw new Error("Workout history is unavailable for this member.");
  let result = await buildWorkoutHistoryQuery(supabase, targetId, filters);
  if (result.error || result.count === null) throw new Error("Workout history could not load. Try again.");
  const totalCount = result.count;
  const pageCount = Math.max(1, Math.ceil(totalCount / WORKOUT_HISTORY_PAGE_SIZE));
  // Deletions can move the last page. Requery only its current twenty rows.
  if (filters.page > pageCount) {
    filters.page = pageCount;
    if (totalCount) {
      result = await buildWorkoutHistoryQuery(supabase, targetId, filters);
      if (result.error) throw new Error("Workout history could not load. Try again.");
    }
  }
  return { logs: result.data ?? [], totalCount, pageCount, filters, isOwnHistory: targetId === user.id, member };
}
