"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getCoachingWorkspace,
  getCoachingDraft,
  saveCoachingDraft,
  approveCoachingDraft,
  saveCoachingProfile,
  resolveCoachingReviewRequest,
} from "@/lib/actions/coaching";
import {
  validateWorkflowProgramDraft,
  type CoachingDraftRecord,
  type CoachingProfile,
  type CoachingReviewRequest,
  type CoachingScope,
  type WorkflowProgramDraft,
} from "@/lib/coach/workflow-schema";
import { CoachingProgramEditor } from "./program-editor";
import { resolveRequestedScope } from "@/lib/coach/requested-scope.mjs";
import { createClient } from "@/lib/supabase/client";
import { withDeadline } from "@/lib/async/deadline";
import { createDraftSession, createWorkspaceLoadGuard, pendingDraftJob, type DraftJob as Job, type DraftJobState } from "@/lib/coach/draft-session";

const areaClass =
  "min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:text-sm";
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";
const DEFAULT_SCOPE: CoachingScope = {
  startWeek: 1,
  weekCount: 4,
  daysPerWeek: 4,
};
class DraftRequestError extends Error {
  constructor(
    message: string,
    readonly draft?: CoachingDraftRecord,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(path, {
      cache: "no-store",
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new DraftRequestError(
        typeof data.error === "string"
          ? data.error
          : "Tommy could not complete this request. Your draft is kept.",
        data.draft,
        response.status,
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const draftSession = createDraftSession({
  poll: (job, signal) => request(`/api/coach/program?jobId=${encodeURIComponent(job.jobId)}&draftId=${encodeURIComponent(job.draftId)}`, { signal }),
  latest: async (draftId) => { const result = await getCoachingDraft(draftId); return result.success ? result.data : null; },
  terminalError: (error) => error instanceof DraftRequestError && [401, 403, 409, 410].includes(error.status ?? 0),
});
let watchingSessionAuth = false;
function watchDraftSessionAuth() {
  if (watchingSessionAuth) return;
  watchingSessionAuth = true;
  // This listener belongs to the tab session too, so signing out from another
  // app page stops old-account polling and clears all private in-memory edits.
  createClient().auth.onAuthStateChange((_event, session) => {
    draftSession.verifyBrowserAccount(session?.user.id ?? null);
  });
}

function validationMessage(
  program: WorkflowProgramDraft | null,
  scope: CoachingScope,
) {
  if (!program) return "Generate a complete draft first.";
  try {
    validateWorkflowProgramDraft(program, scope);
    return "";
  } catch (failure) {
    if (
      failure &&
      typeof failure === "object" &&
      "issues" in failure &&
      Array.isArray(failure.issues)
    ) {
      return failure.issues
        .slice(0, 4)
        .map((issue: { path?: (string | number)[]; message?: string }) => {
          const path = issue.path ?? [];
          const labels: string[] = [];
          if (path[0] === "weeks" && typeof path[1] === "number") {
            const week = program.weeks[path[1]];
            labels.push(`Week ${week?.number ?? path[1] + 1}`);
            if (path[2] === "days" && typeof path[3] === "number") {
              labels.push(`day ${week?.days[path[3]]?.number ?? path[3] + 1}`);
              if (path[4] === "exercises" && typeof path[5] === "number")
                labels.push(`exercise group ${path[5] + 1}`);
            }
          }
          const field = String(path.at(-1) ?? "program");
          const names: Record<string, string> = {
            title: "title",
            name: "exercise variation",
            warmup: "warm-up",
            focus: "focus",
            sets: "sets",
            min: "minimum dose",
            max: "maximum dose",
            range: "rep range",
            seconds: "hold time",
            restSeconds: "rest minutes",
            loadOrAssistance: "load or assistance",
            effort: "effort",
            progression: "progression",
            regression: "regression",
            assumptions: "assumptions",
            notes: "notes",
          };
          labels.push(names[field] ?? "prescription");
          return `${labels.join(", ")}: ${field === "restSeconds" ? "Enter 0.25–10 min." : issue.message ?? "Check this field"}`;
        })
        .join(" · ");
    }
    return failure instanceof Error
      ? failure.message
      : "Check that all requested weeks and days have complete prescriptions.";
  }
}

export function MemberCoachingWorkspace({
  memberId,
  hasActiveProgram,
  previewData,
}: {
  memberId: string;
  hasActiveProgram: boolean;
  previewData?: { drafts: CoachingDraftRecord[]; profile: CoachingProfile };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [drafts, setDrafts] = useState<CoachingDraftRecord[]>([]);
  const [reviewRequests, setReviewRequests] = useState<CoachingReviewRequest[]>(
    [],
  );
  const [resolvingReview, setResolvingReview] = useState<string | null>(null);
  const [selected, setSelected] = useState<CoachingDraftRecord | null>(null);
  const [brief, setBrief] = useState("");
  const [scope, setScope] = useState<CoachingScope>(DEFAULT_SCOPE);
  const [mode, setMode] = useState<"new" | "continue">("new");
  const [content, setContent] = useState<WorkflowProgramDraft | null>(null);
  const [profile, setProfile] = useState<CoachingProfile>({
    member_id: memberId,
    training_context: "",
    coach_rules: "",
    nutrition_targets: "",
  });
  const [dirty, setDirty] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [working, setWorking] = useState<
    "save" | "assign" | "profile" | "start" | null
  >(null);
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState<{
    week: number;
    totalWeeks: number;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const jobRef = useRef<Job | null>(null);
  const mountedRef = useRef(false);
  const coachRef = useRef<string | null>(null);
  const memberRef = useRef(memberId);
  const locked = !!working || !!job;
  const approved = selected?.status === "approved";
  const issue = validationMessage(content, scope);
  function currentWorkspace(ownerId: string | null, clientId: string) {
    return mountedRef.current && coachRef.current === ownerId && memberRef.current === clientId;
  }

  function rememberJob(value: Job | null) {
    jobRef.current = value;
    setJob(value);
    if (coachRef.current) {
      if (value) draftSession.track(coachRef.current, memberId, value);
      else draftSession.forgetJob(coachRef.current, memberId);
    }
    if (!value) setRetrying(false);
  }
  function chooseDraft(value: CoachingDraftRecord | null) {
    setSelected(value);
    setBrief(value?.brief ?? "");
    setScope(value?.scope ?? DEFAULT_SCOPE);
    setContent(value?.content ?? null);
    setDirty(false);
    setReviewed(false);
    setError("");
    setNotice("");
  }
  function acceptSaved(value: CoachingDraftRecord) {
    setDrafts((current) => [
      value,
      ...current.filter((draft) => draft.id !== value.id),
    ]);
    chooseDraft(value);
  }

  useEffect(() => {
    let disposed = false;
    const accountGuard = createWorkspaceLoadGuard();
    let resolveAccountReady!: () => void;
    const accountReady = new Promise<void>((resolve) => { resolveAccountReady = resolve; });
    function clearWorkspace() {
      coachRef.current = null;
      jobRef.current = null;
      setJob(null); setCoachId(null); setBrief(""); setContent(null); setSelected(null);
      setDrafts([]); setReviewRequests([]); setResolvingReview(null);
      setProfile({ member_id: memberId, training_context: "", coach_rules: "", nutrition_targets: "" });
      setScope(DEFAULT_SCOPE); setMode("new"); setProgress(null); setElapsed(0); setRetrying(false);
      setDirty(false); setProfileDirty(false); setReviewed(false); setWorking(null); setAvailable(false);
      setNotice(""); setError("");
    }
    // Subscribe before dispatching the workspace load: its response can arrive
    // after a sign-out or account switch, even when the page stays mounted.
    const authSubscription = previewData ? null : createClient().auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      const accountChanged = accountGuard.observeAccount(session?.user.id ?? null);
      resolveAccountReady();
      if (event === "SIGNED_OUT" || accountChanged || (coachRef.current && session?.user.id !== coachRef.current)) {
        draftSession.activate(null);
        clearWorkspace();
        setLoading(false);
        setError("Your sign-in changed. Reopen the client workspace after signing in.");
      }
    }).data.subscription;
    mountedRef.current = true;
    memberRef.current = memberId;
    clearWorkspace();
    setLoading(true);
    let loadTicket: ReturnType<typeof accountGuard.begin> = null;
    async function load() {
      try {
        if (previewData) {
          setAvailable(true);
          setDrafts(previewData.drafts);
          setProfile(previewData.profile);
          chooseDraft(previewData.drafts[0] ?? null);
          return;
        }
        await withDeadline(() => accountReady, 12_000);
        if (disposed) return;
        loadTicket = accountGuard.begin();
        if (!loadTicket) throw new Error("Sign in to open the client workspace.");
        const result = await getCoachingWorkspace(memberId);
        if (disposed || !accountGuard.isCurrent(loadTicket, loadTicket.accountId)) return;
        if (!result.available) {
          setAvailable(false);
          draftSession.activate(null);
          setError(
            result.error ??
              "Coaching storage needs setup before you can create and assign drafts.",
          );
          return;
        }
        if (!result.coachId || !accountGuard.isCurrent(loadTicket, result.coachId)) throw new Error("Could not verify the coaching workspace for this account.");
        setAvailable(true);
        draftSession.activate(result.coachId);
        watchDraftSessionAuth();
        coachRef.current = result.coachId;
        setCoachId(result.coachId);
        setDrafts(result.drafts);
        setReviewRequests(result.reviewRequests ?? []);
        if (result.profile) setProfile(result.profile);
        const first =
          result.drafts.find((draft) => draft.status === "draft") ??
          result.drafts[0] ??
          null;
        if (first) chooseDraft(first);
        // Remove the legacy member-only pointer; the authenticated database
        // row is authoritative and private editor text never goes to storage.
        try {
          sessionStorage.removeItem(`powerbuild-coaching-job:${memberId}`);
        } catch { /* Browser storage may be disabled. */ }
        const pending = pendingDraftJob(result.drafts, result.coachId);
        if (pending) {
          chooseDraft(pending.draft);
          rememberJob(pending.job);
          setNotice("Resumed your saved Tommy job. You can browse other pages while it drafts.");
        } else {
          const cached = draftSession.restoreEditor(result.coachId, memberId, result.drafts);
          if (cached) {
            setSelected(cached.selectedId ? result.drafts.find((draft) => draft.id === cached.selectedId) ?? null : null);
            setBrief(cached.brief); setScope(cached.scope); setMode(cached.mode); setContent(cached.content);
            setProfile(cached.profile); setDirty(cached.dirty); setProfileDirty(cached.profileDirty);
            setNotice("Restored your workspace from this tab. Save edits to keep them after a reload.");
          }
          const tracked = draftSession.state(result.coachId, memberId);
          if (tracked?.status === "completed" && tracked.draft) {
            acceptSaved(tracked.draft);
            setNotice("Tommy finished while you were away. The complete draft is saved and ready to review.");
            draftSession.forgetJob(result.coachId, memberId);
          } else if (tracked?.status === "failed") {
            if (tracked.draft) acceptSaved(tracked.draft);
            setError(tracked.error ?? "Tommy could not complete the draft. Your saved brief is kept.");
            draftSession.forgetJob(result.coachId, memberId);
          }
        }
      } catch (failure) {
        if (!disposed && (!loadTicket || accountGuard.isCurrent(loadTicket, loadTicket.accountId)))
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load saved drafts.",
          );
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => {
      disposed = true;
      mountedRef.current = false;
      authSubscription?.unsubscribe();
    };
    // Verified coach identity scopes all cached workspace fields and jobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, previewData]);

  useEffect(() => {
    if (!coachId || loading || !available || previewData) return;
    draftSession.rememberEditor(coachId, memberId, { selectedId: selected?.id ?? null, selectedRevision: selected?.revision ?? null, brief, scope, mode, content, profile, dirty, profileDirty });
  }, [coachId, memberId, loading, available, previewData, selected, brief, scope, mode, content, profile, dirty, profileDirty]);

  useEffect(() => {
    if (!coachId) return;
    function receive(state: DraftJobState) {
      jobRef.current = state.job;
      setJob((previous) => previous?.jobId === state.job.jobId ? previous : state.job);
      if (state.status === "running" && state.draft) acceptSaved(state.draft);
      if (state.progress) setProgress(state.progress);
      setRetrying(state.status === "retrying");
      if (state.status === "completed" && state.draft) {
        acceptSaved(state.draft);
        rememberJob(null);
        setNotice("Draft saved. Review every week, edit prescriptions, then approve and assign.");
      } else if (state.status === "failed") {
        if (state.draft) acceptSaved(state.draft);
        rememberJob(null);
        setError(state.error ?? "Tommy could not produce a complete draft. Your saved brief is kept.");
      } else if (state.status === "retrying") setError(state.error ?? "Checking the saved Mac job again…");
      else setError("");
    }
    const unsubscribe = draftSession.subscribe(coachId, memberId, receive);
    const unsubscribeDispatch = draftSession.subscribeDispatch(coachId, memberId, (busy) => setWorking((value) => busy ? "start" : value === "start" ? null : value));
    return () => { unsubscribe(); unsubscribeDispatch(); };
    // The session poller keeps saving the job result when this page unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, memberId]);

  useEffect(() => {
    if (!job) return;
    const update = () => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [job]);

  async function save(): Promise<CoachingDraftRecord | null> {
    if (previewData) return null;
    const ownerId = coachRef.current;
    setError("");
    setNotice("");
    try {
      const result = await saveCoachingDraft({
        memberId,
        brief,
        scope,
        content,
        draftId: selected?.id,
        expectedRevision: selected?.revision,
      });
      if (!result.success) throw new Error(result.error);
      if (currentWorkspace(ownerId, memberId)) {
        acceptSaved(result.data);
        setNotice("Draft saved.");
      }
      return result.data;
    } catch (failure) {
      if (currentWorkspace(ownerId, memberId)) setError(
        failure instanceof Error
          ? failure.message
          : "Could not save. Your edits are kept here.",
      );
      return null;
    }
  }
  async function generate() {
    if (previewData) return;
    if (locked || !brief.trim() || approved) return;
    if (profileDirty) {
      setError(
        "Save the client context first so Tommy uses your updated facts and coach rules.",
      );
      return;
    }
    const ownerId = coachRef.current;
    setWorking("start");
    if (ownerId) draftSession.dispatch(ownerId, memberId, true);
    setError("");
    setNotice("");
    setProgress(null);
    try {
      const requestedScope = resolveRequestedScope(brief, scope).scope;
      const currentScope = selected?.scope ?? scope;
      const scheduleChanged = content && (requestedScope.startWeek !== currentScope.startWeek || requestedScope.weekCount !== currentScope.weekCount || requestedScope.daysPerWeek !== currentScope.daysPerWeek);
      setScope(requestedScope);
      // Save edits before asking for a revision; a model failure preserves them.
      const saved = scheduleChanged ? null : dirty && content ? await save() : selected;
      if (!scheduleChanged && dirty && content && !saved) return;
      const data = await request("/api/coach/program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          brief,
          scope: requestedScope,
          mode,
          draftId: saved?.id,
          expectedRevision: saved?.revision,
        }),
      });
      if (typeof data.jobId !== "string" || typeof data.draftId !== "string")
        throw new Error("Drafting could not start. Your brief is kept.");
      const accepted = { jobId: data.jobId, draftId: data.draftId, startedAt: Date.now() };
      // Keep the dispatch and completion poll alive even if the initiating
      // page was left before its acknowledgement returned.
      if (ownerId) draftSession.track(ownerId, memberId, accepted, data.draft);
      if (!currentWorkspace(ownerId, memberId)) return;
      if (data.draft) acceptSaved(data.draft);
      setElapsed(0);
      rememberJob(accepted);
      setReviewed(false);
    } catch (failure) {
      if (!currentWorkspace(ownerId, memberId)) return;
      if (failure instanceof DraftRequestError && failure.draft)
        acceptSaved(failure.draft);
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not start drafting. Your brief is kept.",
      );
    } finally {
      if (ownerId) draftSession.dispatch(ownerId, memberId, false);
      if (currentWorkspace(ownerId, memberId)) setWorking(null);
    }
  }
  async function stop() {
    const current = jobRef.current;
    if (!current) return;
    const ownerId = coachRef.current;
    setWorking("start");
    try {
      const data = await request(
        `/api/coach/program?jobId=${encodeURIComponent(current.jobId)}&draftId=${encodeURIComponent(current.draftId)}`,
        { method: "DELETE" },
      );
      if (ownerId) draftSession.forgetJob(ownerId, memberId);
      if (!currentWorkspace(ownerId, memberId)) return;
      if (data.draft) acceptSaved(data.draft);
      rememberJob(null);
      setNotice(
        "Drafting stopped. Your saved brief and previous draft are kept.",
      );
    } catch (failure) {
      if (currentWorkspace(ownerId, memberId)) setError(
        failure instanceof Error
          ? failure.message
          : "Could not stop drafting; check the Mac connection.",
      );
    } finally {
      if (currentWorkspace(ownerId, memberId)) setWorking(null);
    }
  }
  async function assign() {
    if (previewData) return;
    if (!reviewed || issue || !content || approved || locked) return;
    const ownerId = coachRef.current;
    setWorking("assign");
    try {
      const saved = dirty || !selected ? await save() : selected;
      if (!saved) return;
      const result = await approveCoachingDraft(saved.id, saved.revision);
      if (!result.success) throw new Error(result.error);
      if (!currentWorkspace(ownerId, memberId)) return;
      acceptSaved({
        ...saved,
        status: "approved",
        assignment_id: result.data.assignmentId,
      });
      setNotice(
        "Approved and assigned. The client can now log this block and ask Tommy about it.",
      );
      router.refresh();
    } catch (failure) {
      if (currentWorkspace(ownerId, memberId)) setError(
        failure instanceof Error
          ? failure.message
          : "Assignment failed. The prior program remains active.",
      );
    } finally {
      if (currentWorkspace(ownerId, memberId)) setWorking(null);
    }
  }
  async function saveProfile() {
    if (previewData) return;
    const ownerId = coachRef.current;
    setWorking("profile");
    setError("");
    setNotice("");
    try {
      const result = await saveCoachingProfile(memberId, {
        training_context: profile.training_context,
        coach_rules: profile.coach_rules,
        nutrition_targets: profile.nutrition_targets,
      });
      if (!result.success) throw new Error(result.error);
      if (!currentWorkspace(ownerId, memberId)) return;
      setProfileDirty(false);
      setNotice(
        "Client coaching context saved. Tommy can use these approved facts.",
      );
    } catch (failure) {
      if (currentWorkspace(ownerId, memberId)) setError(
        failure instanceof Error
          ? failure.message
          : "Could not save client context.",
      );
    } finally {
      if (currentWorkspace(ownerId, memberId)) setWorking(null);
    }
  }
  async function resolveReview(id: string) {
    if (previewData) return;
    const ownerId = coachRef.current;
    setResolvingReview(id);
    setError("");
    try {
      const result = await resolveCoachingReviewRequest(id);
      if (!result.success) throw new Error(result.error);
      if (!currentWorkspace(ownerId, memberId)) return;
      setReviewRequests((current) =>
        current.map((value) =>
          value.id === id ? { ...value, status: "resolved" } : value,
        ),
      );
      setNotice("Review request marked resolved.");
    } catch (failure) {
      if (currentWorkspace(ownerId, memberId)) setError(
        failure instanceof Error
          ? failure.message
          : "Could not resolve this request.",
      );
    } finally {
      if (currentWorkspace(ownerId, memberId)) setResolvingReview(null);
    }
  }

  return (
    <section
      className="min-w-0 rounded-2xl border border-teal-200 bg-card p-4 space-y-5 sm:p-5 dark:border-teal-800"
      aria-labelledby="member-coaching-heading"
    >
      {previewData && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Local layout preview · Authored example. You can edit the fields;
          generation, saving, and assignment are disabled.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="member-coaching-heading"
            className="flex items-center gap-2 font-semibold"
          >
            <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-300" />
            Create with Tommy
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Write your coaching brief here. Tommy drafts the block; you edit,
            approve, and assign it.
          </p>
        </div>
        {available && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Leave these unsaved edits and start a new draft?",
                )
              )
                chooseDraft(null);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New draft
          </Button>
        )}
      </div>
      {loading ? (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading coaching workspace…
        </p>
      ) : (
        available && (
          <>
            {reviewRequests.some((value) => value.status === "open") && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3 dark:border-amber-800 dark:bg-amber-950/20">
                <h3 className="text-sm font-semibold">
                  Client review requests
                </h3>
                {reviewRequests
                  .filter((value) => value.status === "open")
                  .map((value) => (
                    <article
                      key={value.id}
                      className="border-t border-amber-200 pt-3 first:border-0 dark:border-amber-800"
                    >
                      <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                        {value.message}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(value.created_at).toLocaleDateString()}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!!resolvingReview}
                          loading={resolvingReview === value.id}
                          onClick={() => void resolveReview(value.id)}
                        >
                          Mark reviewed
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
            )}
            <details className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Client context and coach rules
                {profileDirty ? " · unsaved changes" : ""}
              </summary>
              <div className="mt-4 space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Save approved facts and targets the client can see. These
                  guide drafts and answers; keep private coach notes elsewhere.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="client-training-context">
                    Training context
                  </Label>
                  <textarea
                    id="client-training-context"
                    value={profile.training_context}
                    onChange={(event) => {
                      setProfile({
                        ...profile,
                        training_context: event.target.value,
                      });
                      setProfileDirty(true);
                    }}
                    maxLength={6000}
                    rows={3}
                    placeholder="Goal, experience, equipment, available days, recent working loads, and movement limitations…"
                    className={areaClass}
                    disabled={locked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-coach-rules">Coach rules</Label>
                  <textarea
                    id="client-coach-rules"
                    value={profile.coach_rules}
                    onChange={(event) => {
                      setProfile({
                        ...profile,
                        coach_rules: event.target.value,
                      });
                      setProfileDirty(true);
                    }}
                    maxLength={6000}
                    rows={3}
                    placeholder="Allowed substitutions, missed-session rules, load adjustments that need your review…"
                    className={areaClass}
                    disabled={locked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-nutrition-targets">
                    Approved nutrition targets · optional
                  </Label>
                  <textarea
                    id="client-nutrition-targets"
                    value={profile.nutrition_targets}
                    onChange={(event) => {
                      setProfile({
                        ...profile,
                        nutrition_targets: event.target.value,
                      });
                      setProfileDirty(true);
                    }}
                    maxLength={4000}
                    rows={3}
                    placeholder="Your approved targets, food preferences, and restrictions. Leave blank if you have not set targets."
                    className={areaClass}
                    disabled={locked}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked || !profileDirty || !!previewData}
                  loading={working === "profile"}
                  onClick={() => void saveProfile()}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save client context
                </Button>
              </div>
            </details>
            {drafts.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="saved-coaching-draft">
                  Saved drafts and approved blocks
                </Label>
                <select
                  id="saved-coaching-draft"
                  value={selected?.id ?? ""}
                  disabled={locked}
                  className={selectClass}
                  onChange={(event) => {
                    if (
                      !dirty ||
                      window.confirm(
                        "Leave these unsaved edits and open another draft?",
                      )
                    )
                      chooseDraft(
                        drafts.find(
                          (draft) => draft.id === event.target.value,
                        ) ?? null,
                      );
                  }}
                >
                  <option value="">New draft</option>
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.content?.title ??
                        draft.brief.slice(0, 70) ??
                        "Untitled draft"}{" "}
                      · {draft.status === "approved" ? "Approved" : "Draft"} · v
                      {draft.revision}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!approved && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void generate();
                }}
                className="space-y-4"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="coaching-mode">Starting point</Label>
                    <select
                      id="coaching-mode"
                      className={selectClass}
                      value={mode}
                      disabled={locked}
                      onChange={(event) =>
                        setMode(event.target.value as "new" | "continue")
                      }
                    >
                      <option value="new">New block</option>
                      <option value="continue" disabled={!hasActiveProgram}>
                        Continue approved program
                      </option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="coaching-weeks">Weeks</Label>
                    <select
                      id="coaching-weeks"
                      className={selectClass}
                      value={scope.weekCount}
                      disabled={locked}
                      onChange={(event) => {
                        setScope({
                          ...scope,
                          weekCount: Number(event.target.value),
                        });
                        setDirty(true);
                        setReviewed(false);
                      }}
                    >
                      {Array.from({ length: 16 }, (_, index) => index + 1).map(
                        (value) => (
                          <option key={value} value={value}>
                            {value} {value === 1 ? "week" : "weeks"}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="coaching-days">Days per week</Label>
                    <select
                      id="coaching-days"
                      className={selectClass}
                      value={scope.daysPerWeek}
                      disabled={locked}
                      onChange={(event) => {
                        setScope({
                          ...scope,
                          daysPerWeek: Number(event.target.value),
                        });
                        setDirty(true);
                        setReviewed(false);
                      }}
                    >
                      {Array.from({ length: 7 }, (_, index) => index + 1).map(
                        (value) => (
                          <option key={value} value={value}>
                            {value} {value === 1 ? "day" : "days"}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coaching-brief">
                    {content
                      ? "Coaching brief and revision instructions"
                      : "Your coaching brief"}
                  </Label>
                  <textarea
                    id="coaching-brief"
                    value={brief}
                    onChange={(event) => {
                      setBrief(event.target.value);
                      setDirty(true);
                      setReviewed(false);
                    }}
                    maxLength={6000}
                    minLength={10}
                    rows={5}
                    placeholder="Example: Four-week bench-focused block, three days per week. Keep paused bench on day 1. Write separate top-set and backdown groups, use my client context, and flag any missing starting loads. Include every week's sets, reps, effort, rest, and progression rules."
                    className={areaClass}
                    disabled={locked}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Paste your own prescriptions or describe the block. Tommy
                    must preserve explicit sets, reps, variants, and units.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Your edits stay in this tab while you browse. Save draft keeps them after a reload.
                  </p>
                  <p className="text-xs font-medium text-primary">
                    {(() => {
                      try {
                        const requested = resolveRequestedScope(brief, scope).scope;
                        return `Tommy will draft ${requested.weekCount} ${requested.weekCount === 1 ? "week" : "weeks"}, ${requested.daysPerWeek} ${requested.daysPerWeek === 1 ? "day" : "days"} per week. Explicit schedule requests in your brief override these form defaults.`;
                      } catch (failure) { return failure instanceof Error ? failure.message : "Check your requested schedule."; }
                    })()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={
                      locked || brief.trim().length < 10 || !!previewData
                    }
                    loading={working === "start"}
                  >
                    <Sparkles className="h-4 w-4" />
                    {content ? "Revise with Tommy" : "Draft with Tommy"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={locked || !brief.trim() || !!previewData}
                    loading={working === "save"}
                    onClick={async () => {
                      setWorking("save");
                      await save();
                      setWorking(null);
                    }}
                  >
                    <Save className="h-4 w-4" />
                    Save draft
                  </Button>
                </div>
              </form>
            )}
            {job && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p
                    className="flex items-center gap-2 text-sm font-medium"
                    role="status"
                  >
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {retrying ? "Reconnecting to your saved Tommy job…" : progress
                      ? `Drafting week ${progress.week} of ${progress.totalWeeks}`
                      : "Tommy is drafting your block…"}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!!working}
                    onClick={() => void stop()}
                  >
                    <Square className="h-3 w-3" />
                    Stop
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {elapsed}s elapsed · Complete blocks can take several minutes
                  on your Mac. You can open other pages; PowerBuild keeps checking
                  this job and saves the result. Reloading resumes the saved job.
                </p>
              </div>
            )}
            {content && (
              <div className="border-t border-border pt-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-sm">
                    {approved
                      ? "Approved program"
                      : "Review and edit your draft"}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-[10px] font-medium",
                      approved
                        ? "bg-success/10 text-success"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                    )}
                  >
                    {approved ? "Approved" : "Not assigned"}
                  </span>
                  {dirty && (
                    <span className="text-xs text-muted-foreground">
                      Unsaved edits
                    </span>
                  )}
                </div>
                <CoachingProgramEditor
                  program={content}
                  disabled={locked || approved}
                  onChange={(value) => {
                    setContent(value);
                    setDirty(true);
                    setReviewed(false);
                  }}
                />
                {!approved && (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    {issue ? (
                      <p
                        className="text-xs leading-relaxed text-destructive"
                        role="alert"
                      >
                        {issue}
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Every requested week and day has a complete
                        prescription.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Check loads, effort targets, progression, and every week.
                      Structural validation does not judge coaching quality.
                    </p>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(event) => setReviewed(event.target.checked)}
                        disabled={locked || !!issue}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      />
                      I reviewed every week and approve this program for the
                      client.
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={locked || !dirty || !!previewData}
                        loading={working === "save"}
                        onClick={async () => {
                          setWorking("save");
                          await save();
                          setWorking(null);
                        }}
                      >
                        Save edits
                      </Button>
                      <Button
                        type="button"
                        disabled={
                          locked || !reviewed || !!issue || !!previewData
                        }
                        loading={working === "assign"}
                        onClick={() => void assign()}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve &amp; Assign
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Assignment publishes a preserved client copy. A failed
                      assignment keeps the current program active.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-teal-50 p-3 text-xs leading-relaxed text-teal-900 dark:bg-teal-950 dark:text-teal-200"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
