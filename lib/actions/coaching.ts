"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessCoach } from "@/lib/business/access";
import { coachingScopeSchema, workflowProgramDraftSchema, validateWorkflowProgramDraft, type CoachingDraftRecord, type CoachingProfile, type CoachingReviewRequest } from "@/lib/coach/workflow-schema";
import type { ActionResult } from "@/types";
import type { Json, Tables } from "@/types/database";

const uuid = z.string().uuid();
const profileSchema = z.object({
  training_context: z.string().trim().max(8000),
  coach_rules: z.string().trim().max(8000),
  nutrition_targets: z.string().trim().max(8000),
}).strict();

async function authenticatedAdmin() {
  return requireBusinessCoach();
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid coaching details";
  if (error instanceof Error) return error.message;
  return "Could not complete this coaching action";
}

function toDraft(row: Tables<"coaching_drafts">): CoachingDraftRecord {
  const scope = coachingScopeSchema.parse(row.scope);
  return { ...row, scope, content: row.content === null ? null : workflowProgramDraftSchema.parse(row.content) };
}

export async function getCoachingWorkspace(memberId: string): Promise<{
  drafts: CoachingDraftRecord[]; profile: CoachingProfile | null;
  reviewRequests: CoachingReviewRequest[]; available: boolean; error?: string;
}> {
  try {
    uuid.parse(memberId);
    const { supabase, user } = await authenticatedAdmin();
    const [drafts, profile, reviews] = await Promise.all([
      supabase.from("coaching_drafts").select("*").eq("member_id", memberId).eq("coach_id", user.id).order("updated_at", { ascending: false }).limit(20),
      supabase.from("coaching_profiles").select("member_id,training_context,coach_rules,nutrition_targets").eq("member_id", memberId).maybeSingle(),
      supabase.from("coaching_review_requests").select("id,member_id,assignment_id,message,status,created_at").eq("member_id", memberId).order("created_at", { ascending: false }).limit(20),
    ]);
    const error = drafts.error ?? profile.error ?? reviews.error;
    if (error) throw new Error(error.code === "PGRST205" || error.code === "42P01" ? "Coaching database setup is not available yet" : error.message);
    return { drafts: (drafts.data ?? []).map(toDraft), profile: profile.data, reviewRequests: reviews.data ?? [], available: true };
  } catch (error) {
    return { drafts: [], profile: null, reviewRequests: [], available: false, error: errorMessage(error) };
  }
}

export async function getCoachingDraft(draftId: string): Promise<ActionResult<CoachingDraftRecord>> {
  try {
    uuid.parse(draftId);
    const { supabase, user } = await authenticatedAdmin();
    const { data, error } = await supabase.from("coaching_drafts").select("*").eq("id", draftId).eq("coach_id", user.id).single();
    if (error || !data) throw new Error(error?.message ?? "Draft not found");
    return { success: true, data: toDraft(data) };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function saveCoachingDraft(input: {
  memberId: string; brief: string; scope: { startWeek: number; weekCount: number; daysPerWeek: number };
  content?: unknown; draftId?: string; expectedRevision?: number; generationJobId?: string;
}): Promise<ActionResult<CoachingDraftRecord>> {
  try {
    const memberId = uuid.parse(input.memberId);
    const brief = z.string().trim().min(1, "Write a coaching brief first").max(16000).parse(input.brief);
    const scope = coachingScopeSchema.parse(input.scope);
    const content = input.content == null ? null : workflowProgramDraftSchema.parse(input.content);
    if (input.draftId) uuid.parse(input.draftId);
    if (input.generationJobId) uuid.parse(input.generationJobId);
    if (input.expectedRevision !== undefined) z.number().int().min(1).parse(input.expectedRevision);
    const { supabase } = await authenticatedAdmin();
    const { data, error } = await supabase.rpc("save_coaching_draft", {
      p_member_id: memberId, p_brief: brief, p_scope: scope as Json,
      p_content: content as Json | null, p_draft_id: input.draftId ?? null,
      p_expected_revision: input.expectedRevision ?? null, p_generation_job_id: input.generationJobId ?? null,
    });
    if (error || !data) throw new Error(error?.message ?? "Could not save draft");
    revalidatePath(`/admin/members/${memberId}`);
    return { success: true, data: toDraft(data) };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function approveCoachingDraft(draftId: string, expectedRevision: number): Promise<ActionResult<{ assignmentId: string; programId: string }>> {
  try {
    uuid.parse(draftId); z.number().int().min(1).parse(expectedRevision);
    const { supabase } = await authenticatedAdmin();
    const { data: draft, error: draftError } = await supabase.from("coaching_drafts").select("content,scope").eq("id", draftId).single();
    if (draftError || !draft) throw new Error("Draft not found");
    validateWorkflowProgramDraft(draft.content, coachingScopeSchema.parse(draft.scope));
    const { data, error } = await supabase.rpc("approve_coaching_draft", { p_draft_id: draftId, p_expected_revision: expectedRevision });
    if (error) throw new Error(error.message);
    const assigned = z.object({ assignmentId: uuid, programId: uuid }).parse(data);
    revalidatePath("/admin/members", "layout");
    revalidatePath("/dashboard"); revalidatePath("/workout"); revalidatePath("/coach");
    return { success: true, data: assigned };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function saveCoachingProfile(memberId: string, input: CoachingProfile | Omit<CoachingProfile, "member_id">): Promise<ActionResult> {
  try {
    uuid.parse(memberId);
    const profile = profileSchema.parse({ training_context: input.training_context, coach_rules: input.coach_rules, nutrition_targets: input.nutrition_targets });
    const { supabase, user } = await authenticatedAdmin();
    const { error } = await supabase.from("coaching_profiles").upsert({ ...profile, member_id: memberId, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/members/${memberId}`); revalidatePath("/coach");
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function createCoachingReviewRequest(message: string): Promise<ActionResult<string>> {
  try {
    const clean = z.string().trim().min(1).max(2000).parse(message);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to contact your coach");
    const { data, error } = await supabase.rpc("create_coaching_review_request", { p_message: clean });
    if (error || !data) throw new Error(error?.message ?? "Could not request a review");
    revalidatePath("/admin/members", "layout");
    return { success: true, data };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}

export async function resolveCoachingReviewRequest(requestId: string): Promise<ActionResult> {
  try {
    uuid.parse(requestId);
    const { supabase } = await authenticatedAdmin();
    const { data, error } = await supabase.from("coaching_review_requests").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", requestId).select("member_id").single();
    if (error || !data) throw new Error(error?.message ?? "Review request not found");
    revalidatePath(`/admin/members/${data.member_id}`);
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: errorMessage(error) }; }
}
