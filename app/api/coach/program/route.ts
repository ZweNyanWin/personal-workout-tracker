import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { saveCoachingDraft } from "@/lib/actions/coaching";
import { buildClientContext } from "@/lib/coach/context";
import { loadCoachExerciseCatalog } from "@/lib/coach/exercise-catalog";
import { compatibleGenerationSource } from "@/lib/coach/program-source";
import { resolveRequestedScope } from "@/lib/coach/requested-scope.mjs";
import { coachingScopeSchema, workflowProgramDraftSchema, validateWorkflowProgramDraft, type CoachingDraftRecord } from "@/lib/coach/workflow-schema";
import { coachJson, gatewayCall, GatewayRequestError, mutationFromApp, readCoachInput } from "@/lib/coach/gateway-client";

export const runtime = "nodejs";
export const maxDuration = 30;
const uuid = z.string().uuid();
const input = z.object({
  memberId: uuid, brief: z.string().trim().min(10).max(6000), scope: coachingScopeSchema,
  draftId: uuid.optional(), expectedRevision: z.number().int().positive().optional(),
  mode: z.enum(["new", "continue"]).optional(),
}).strict();

async function verifiedCoach() {
  const supabase = await createClient({ signal: AbortSignal.timeout(20000) });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: canCoach, error: accessError } = await supabase.rpc("is_admin");
  const { data: aiEnabled, error: aiError } = await supabase.rpc("coach_ai_access");
  return !accessError && !aiError && canCoach === true && aiEnabled === true ? { supabase, user } : null;
}

export async function POST(request: Request) {
  let acceptedJob: string | undefined;
  let coachId: string | undefined;
  let persistedDraft: CoachingDraftRecord | undefined;
  try {
    const coach = await verifiedCoach();
    if (!coach) return coachJson({ error: "A coach account is required." }, 403);
    if (!mutationFromApp(request)) return coachJson({ error: "Send requests from PowerBuild." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return coachJson({ error: "Send a JSON brief." }, 415);
    const parsed = input.safeParse(await readCoachInput(request, 30000));
    if (!parsed.success) return coachJson({ error: "Add a brief of 10–6,000 characters and a valid week/day scope." }, 400);
    const { memberId, brief, draftId, expectedRevision, mode } = parsed.data;
    const scope = coachingScopeSchema.parse(resolveRequestedScope(brief, parsed.data.scope).scope);
    const { data: member } = await coach.supabase.from("profiles").select("id").eq("id", memberId).single();
    if (!member) return coachJson({ error: "Client not found." }, 404);
    let previousContent;
    let continuingDraftId = draftId;
    if (draftId) {
      const { data: previous } = await coach.supabase.from("coaching_drafts").select("*").eq("id", draftId).eq("coach_id", coach.user.id).eq("member_id", memberId).single();
      if (!previous || previous.status !== "draft" || previous.revision !== expectedRevision) return coachJson({ error: "This draft changed. Reload and review it before generating again." }, 409);
      // Preserve an existing reviewable draft if generation fails; never erase it on dispatch.
      const previousScope = coachingScopeSchema.parse(previous.scope);
      if (previousScope.startWeek !== scope.startWeek || previousScope.weekCount !== scope.weekCount || previousScope.daysPerWeek !== scope.daysPerWeek) {
        // A new schedule is a separate draft; a failed smaller-scope request
        // must not erase or invalidate the existing saved program.
        continuingDraftId = undefined;
      } else if (previous.content) previousContent = workflowProgramDraftSchema.parse(previous.content);
    }
    const saved = await saveCoachingDraft({ memberId, brief, scope, ...(continuingDraftId ? { draftId: continuingDraftId, expectedRevision } : {}), ...(previousContent ? { content: previousContent } : {}) });
    if (!saved.success) return coachJson({ error: saved.error || "Could not save this brief." }, 409);
    const draft = saved.data;
    persistedDraft = draft;
    const [context, profile] = await Promise.all([
      buildClientContext(memberId, coach.supabase),
      coach.supabase.from("coaching_profiles").select("training_context").eq("member_id", memberId).maybeSingle(),
    ]);
    if (profile.error) throw new Error("Client equipment and movement limitations could not be verified. Retry before drafting.");
    const trainingContext = profile.data?.training_context ?? "";
    const exerciseCatalog = await loadCoachExerciseCatalog(coach.supabase, coach.user.id, brief, trainingContext);
    const sourceWeeks = compatibleGenerationSource(previousContent, brief, trainingContext, exerciseCatalog.entries);
    const contextText = `${exerciseCatalog.context}\n${mode === "continue" ? "The coach requests the next block based on the current assigned program and completed logs. Do not treat planned targets as achievements.\n" : ""}${context.text}`.slice(0, 12000);
    coachId = coach.user.id;
    // An authorized, saved draft belongs to the coach's workspace. Navigation
    // must not cancel its dispatch before the database recovery pointer is set.
    // gatewayCall still applies its own bounded transport deadline.
    const result = await gatewayCall("/v1/jobs", "POST", { userId: coachId,
      messages: [{ role: "user", content: "Create a complete program draft for the coach to review." }],
      context: contextText, program: { brief, scope, trainingContext, exerciseCatalog: exerciseCatalog.entries, ...(sourceWeeks ? { sourceWeeks } : {}) },
    });
    acceptedJob = uuid.parse(result.jobId);
    const { data: attached, error: attachmentError } = await coach.supabase.rpc("set_coaching_generation", {
      p_draft_id: draft.id, p_expected_revision: draft.revision, p_job_id: acceptedJob,
    });
    if (attachmentError) throw new Error("The draft changed while Tommy started. Your latest edit is kept; please retry.");
    return coachJson({ jobId: acceptedJob, draftId: draft.id, status: result.status, revision: draft.revision, draft: attached }, 202);
  } catch (error) {
    if (acceptedJob && coachId) await gatewayCall(`/v1/jobs/${acceptedJob}?userId=${coachId}`, "DELETE").catch(() => {});
    return coachJson({ error: error instanceof SyntaxError ? "Invalid JSON brief." : error instanceof Error ? error.message : "The draft could not start.", ...(persistedDraft ? { draft: persistedDraft } : {}) }, error instanceof RangeError ? 413 : error instanceof SyntaxError ? 400 : 503);
  }
}

async function getOrCancel(request: Request) {
  try {
    const coach = await verifiedCoach();
    if (!coach) return coachJson({ error: "A coach account is required." }, 403);
    if (request.method === "DELETE" && !mutationFromApp(request)) return coachJson({ error: "Send requests from PowerBuild." }, 403);
    const params = new URL(request.url).searchParams;
    const draftId = uuid.safeParse(params.get("draftId")); const jobId = uuid.safeParse(params.get("jobId"));
    if (!draftId.success || !jobId.success || params.size !== 2) return coachJson({ error: "Invalid draft request." }, 400);
    const { data: draft, error } = await coach.supabase.from("coaching_drafts").select("*")
      .eq("id", draftId.data).eq("coach_id", coach.user.id).eq("generation_job_id", jobId.data).single();
    if (error || !draft) return coachJson({ error: "This generation expired or the draft was edited. Your latest saved draft is kept." }, 409);
    if (request.method === "DELETE") {
      await gatewayCall(`/v1/jobs/${jobId.data}?userId=${coach.user.id}`, "DELETE", undefined, request.signal);
      const { data: cleared, error: clearError } = await coach.supabase.rpc("set_coaching_generation", { p_draft_id: draft.id, p_expected_revision: draft.revision, p_job_id: null });
      if (clearError) throw new Error("Could not clear this generation. Reload the draft.");
      return coachJson({ status: "cancelled", draft: cleared });
    }
    if (draft.content && draft.generation_revision !== null && draft.revision > draft.generation_revision) return coachJson({ status: "completed", draft });
    // A complete 16-week draft may be larger than a chat answer.
    async function failedDraft(message: unknown) {
      const { data: cleared } = await coach!.supabase.rpc("set_coaching_generation", { p_draft_id: draft!.id, p_expected_revision: draft!.revision, p_job_id: null });
      return coachJson({ status: "failed", draft: cleared ?? draft, error: message });
    }
    let result;
    try { result = await gatewayCall(`/v1/jobs/${jobId.data}?userId=${coach.user.id}`, "GET", undefined, request.signal, 1024 * 1024); }
    catch (failure) {
      if (failure instanceof GatewayRequestError && failure.status === 404) return failedDraft("This Mac job expired or the connector restarted. Your saved brief and previous draft are kept; you can try again.");
      throw failure;
    }
    if (result.status === "failed" || result.status === "cancelled") return failedDraft(result.error || "Tommy could not complete the draft. Your previous draft is kept.");
    if (result.status !== "completed") return coachJson({ status: result.status, ...(result.progress ? { progress: result.progress } : {}) });
    let content;
    try { content = validateWorkflowProgramDraft(JSON.parse(String(result.answer)), coachingScopeSchema.parse(draft.scope)); }
    catch { return failedDraft("Tommy returned an incomplete prescription. Your saved draft is kept; try a more specific brief."); }
    const { data: completed, error: saveError } = await coach.supabase.rpc("complete_coaching_generation", {
      p_draft_id: draft.id, p_job_id: jobId.data, p_content: content,
    });
    if (saveError || !completed) return coachJson({ error: "This draft changed while Tommy worked. Your latest saved edit is kept." }, 409);
    return coachJson({ status: "completed", draft: completed });
  } catch (error) { return coachJson({ error: error instanceof Error ? error.message : "Could not load the draft." }, 503); }
}
export const GET = getOrCancel;
export const DELETE = getOrCancel;
