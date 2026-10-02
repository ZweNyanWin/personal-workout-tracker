import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

export const WORKOUT_HISTORY_PAGE_SIZE = 20;
export type HistorySearchParams = Record<string, string | string[] | undefined>;
export type WorkoutHistoryFilters = { memberId?: string; q: string; from: string; to: string; page: number };
export type WorkoutHistoryLog = Pick<Database["public"]["Tables"]["workout_logs"]["Row"],
  "id" | "title" | "date" | "duration_minutes" | "energy_rating" | "notes" | "status"> & { session: { title: string } | null };

function single(params: HistorySearchParams, name: string) {
  const value = params[name];
  if (Array.isArray(value)) throw new Error("Use one value for each history filter.");
  if (value !== undefined && typeof value !== "string") throw new Error("Use a text value for each history filter.");
  return value?.trim() ?? "";
}

function validDate(value: string) {
  if (!value) return true;
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseWorkoutHistoryFilters(params: HistorySearchParams = {}): WorkoutHistoryFilters {
  if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("Use valid history filters.");
  const memberId = single(params, "memberId"), q = single(params, "q"), from = single(params, "from"), to = single(params, "to");
  const pageText = single(params, "page");
  if (memberId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(memberId)) throw new Error("Choose a valid member to view workout history.");
  if (q.length > 80 || /[\u0000-\u001f\u007f]/.test(q)) throw new Error("Keep the workout search to 80 characters on one line.");
  if (!validDate(from) || !validDate(to)) throw new Error("Choose valid dates for the history filter.");
  if (from && to && from > to) throw new Error("The start date must be on or before the end date.");
  if (pageText && (!/^[1-9]\d{0,3}$/.test(pageText) || Number(pageText) > 1000)) throw new Error("Choose a valid history page.");
  return { ...(memberId ? { memberId } : {}), q, from, to, page: pageText ? Number(pageText) : 1 };
}

export function workoutHistoryHref(filters: WorkoutHistoryFilters, page = filters.page, basePath: "/history" | "/preview/history" = "/history") {
  const params = new URLSearchParams();
  if (filters.memberId) params.set("memberId", filters.memberId);
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

export function workoutHistoryLogHref(logId: string, filters: WorkoutHistoryFilters) {
  return `/log/${logId}?${new URLSearchParams({ returnTo: workoutHistoryHref(filters) })}`;
}

/** Page and filter in PostgREST under caller RLS. An empty filtered embed matches
 * session titles without replacing the visible session embed with null.
 * https://postgrest.org/en/stable/references/api/resource_embedding.html#or-filtering-across-embedded-resources */
export function buildWorkoutHistoryQuery(supabase: SupabaseClient<Database>, targetId: string, filters: WorkoutHistoryFilters) {
  const fields = "id,title,date,duration_minutes,energy_rating,notes,status,session:program_sessions(title)";
  let query = supabase.from("workout_logs")
    .select(`${fields}${filters.q ? ",session_match:program_sessions()" : ""}`, { count: "exact" })
    .eq("user_id", targetId).eq("status", "completed");
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    query = query.ilike("session_match.title", pattern)
      .or(`title.ilike.${JSON.stringify(pattern)},session_match.not.is.null`);
  }
  const first = (filters.page - 1) * WORKOUT_HISTORY_PAGE_SIZE;
  return query.order("date", { ascending: false }).order("id", { ascending: false })
    .range(first, first + WORKOUT_HISTORY_PAGE_SIZE - 1).returns<WorkoutHistoryLog[]>();
}
