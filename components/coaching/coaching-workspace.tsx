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

const areaClass =
  "min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:text-sm";
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";
const DEFAULT_SCOPE: CoachingScope = {
  startWeek: 1,
  weekCount: 4,
  daysPerWeek: 4,
};
type Job = { jobId: string; draftId: string; startedAt: number };
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
      signal: controller.signal,
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const jobRef = useRef<Job | null>(null);
  const storageKey = `powerbuild-coaching-job:${memberId}`;
  const locked = !!working || !!job;
  const approved = selected?.status === "approved";
  const issue = validationMessage(content, scope);

  function rememberJob(value: Job | null) {
    jobRef.current = value;
    setJob(value);
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* Reload recovery remains available through saved drafts. */
    }
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
    async function load() {
      try {
        if (previewData) {
          setAvailable(true);
          setDrafts(previewData.drafts);
          setProfile(previewData.profile);
          chooseDraft(previewData.drafts[0] ?? null);
          return;
        }
        const result = await getCoachingWorkspace(memberId);
        if (disposed) return;
        setAvailable(result.available);
        if (!result.available) {
          setError(
            result.error ??
              "Coaching storage needs setup before you can create and assign drafts.",
          );
          return;
        }
        setDrafts(result.drafts);
        setReviewRequests(result.reviewRequests ?? []);
        if (result.profile) setProfile(result.profile);
        const first =
          result.drafts.find((draft) => draft.status === "draft") ??
          result.drafts[0] ??
          null;
        if (first) chooseDraft(first);
        let restoredJob = false;
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(storageKey) ?? "null",
          ) as Job | null;
          if (
            saved &&
            typeof saved.jobId === "string" &&
            typeof saved.draftId === "string" &&
            Number.isFinite(saved.startedAt) &&
            Date.now() - saved.startedAt < 30 * 60 * 1000
          ) {
            const matching = result.drafts.find(
              (draft) => draft.id === saved.draftId,
            );
            if (matching?.status === "draft") {
              chooseDraft(matching);
              rememberJob(saved);
              restoredJob = true;
            }
          }
        } catch {
          /* An expired or invalid local recovery record does not affect saved drafts. */
        }
        if (!restoredJob) {
          const runningDraft = result.drafts.find((draft) => draft.status === "draft" && draft.generation_job_id && draft.generation_revision === draft.revision && Date.now() - Date.parse(draft.updated_at) < 30 * 60 * 1000);
          if (runningDraft?.generation_job_id) {
            chooseDraft(runningDraft);
            rememberJob({ jobId: runningDraft.generation_job_id, draftId: runningDraft.id, startedAt: Date.parse(runningDraft.updated_at) });
          }
        }
      } catch (failure) {
        if (!disposed)
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
    };
    // Each member has a separate workspace and recovery key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, previewData]);

  useEffect(() => {
    if (!job) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const interval = setInterval(
      () => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000)),
      1000,
    );
    async function poll() {
      if (disposed || jobRef.current?.jobId !== job!.jobId) return;
      if (Date.now() - job!.startedAt > 30 * 60 * 1000) {
        rememberJob(null);
        setError(
          "Drafting took too long. Your saved brief and previous draft are kept; check the Mac before retrying.",
        );
        return;
      }
      try {
        const data = await request(
          `/api/coach/program?jobId=${encodeURIComponent(job!.jobId)}&draftId=${encodeURIComponent(job!.draftId)}`,
        );
        if (disposed || jobRef.current?.jobId !== job!.jobId) return;
        failures = 0;
        if (
          data.progress &&
          Number.isFinite(data.progress.week) &&
          Number.isFinite(data.progress.totalWeeks)
        )
          setProgress(data.progress);
        if (data.status === "completed" && data.draft) {
          acceptSaved(data.draft);
          rememberJob(null);
          setNotice(
            "Draft saved. Review every week, edit prescriptions, then approve and assign.",
          );
          return;
        }
        if (data.status === "failed") {
          if (data.draft) acceptSaved(data.draft);
          rememberJob(null);
          setError(
            [
              data.error ?? "Tommy could not produce a complete draft.",
              ...(Array.isArray(data.issues)
                ? data.issues
                    .filter((value: unknown) => typeof value === "string")
                    .slice(0, 4)
                : []),
            ].join(" "),
          );
          return;
        }
        if (!["queued", "running"].includes(data.status))
          throw new Error(
            "Unexpected drafting status. Your saved brief is kept.",
          );
      } catch (failure) {
        if (disposed) return;
        if (failure instanceof DraftRequestError && failure.status === 409) {
          const latest = await getCoachingDraft(job!.draftId).catch(() => null);
          if (!disposed && latest?.success) acceptSaved(latest.data);
          if (!disposed) {
            rememberJob(null);
            setError(
              "The draft changed or this generation expired. Your latest saved version is loaded; review it before retrying.",
            );
          }
          return;
        }
        failures += 1;
        setError(
          failure instanceof Error
            ? failure.message
            : "Connection interrupted. Retrying this draft request…",
        );
        if (failures >= 10) {
          const saved = await getCoachingDraft(job!.draftId).catch(() => null);
          if (!disposed && saved?.success) acceptSaved(saved.data);
          if (!disposed) {
            rememberJob(null);
            setError(
              "The Mac connection was interrupted. Your latest saved draft is available; check the connection before retrying.",
            );
          }
          return;
        }
      }
      if (!disposed) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
    // Poll the accepted job without resubmitting the brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  async function save(): Promise<CoachingDraftRecord | null> {
    if (previewData) return null;
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
      acceptSaved(result.data);
      setNotice("Draft saved.");
      return result.data;
    } catch (failure) {
      setError(
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
    setWorking("start");
    setError("");
    setNotice("");
    setProgress(null);
    try {
      // Save edits before asking for a revision; a model failure preserves them.
      const saved = dirty && content ? await save() : selected;
      if (dirty && content && !saved) return;
      const data = await request("/api/coach/program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          brief,
          scope,
          mode,
          draftId: saved?.id,
          expectedRevision: saved?.revision,
        }),
      });
      if (typeof data.jobId !== "string" || typeof data.draftId !== "string")
        throw new Error("Drafting could not start. Your brief is kept.");
      if (data.draft) acceptSaved(data.draft);
      setElapsed(0);
      rememberJob({
        jobId: data.jobId,
        draftId: data.draftId,
        startedAt: Date.now(),
      });
      setReviewed(false);
    } catch (failure) {
      if (failure instanceof DraftRequestError && failure.draft)
        acceptSaved(failure.draft);
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not start drafting. Your brief is kept.",
      );
    } finally {
      setWorking(null);
    }
  }
  async function stop() {
    const current = jobRef.current;
    if (!current) return;
    setWorking("start");
    try {
      const data = await request(
        `/api/coach/program?jobId=${encodeURIComponent(current.jobId)}&draftId=${encodeURIComponent(current.draftId)}`,
        { method: "DELETE" },
      );
      if (data.draft) acceptSaved(data.draft);
      rememberJob(null);
      setNotice(
        "Drafting stopped. Your saved brief and previous draft are kept.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not stop drafting; check the Mac connection.",
      );
    } finally {
      setWorking(null);
    }
  }
  async function assign() {
    if (previewData) return;
    if (!reviewed || issue || !content || approved || locked) return;
    setWorking("assign");
    try {
      const saved = dirty || !selected ? await save() : selected;
      if (!saved) return;
      const result = await approveCoachingDraft(saved.id, saved.revision);
      if (!result.success) throw new Error(result.error);
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
      setError(
        failure instanceof Error
          ? failure.message
          : "Assignment failed. The prior program remains active.",
      );
    } finally {
      setWorking(null);
    }
  }
  async function saveProfile() {
    if (previewData) return;
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
      setProfileDirty(false);
      setNotice(
        "Client coaching context saved. Tommy can use these approved facts.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save client context.",
      );
    } finally {
      setWorking(null);
    }
  }
  async function resolveReview(id: string) {
    if (previewData) return;
    setResolvingReview(id);
    setError("");
    try {
      const result = await resolveCoachingReviewRequest(id);
      if (!result.success) throw new Error(result.error);
      setReviewRequests((current) =>
        current.map((value) =>
          value.id === id ? { ...value, status: "resolved" } : value,
        ),
      );
      setNotice("Review request marked resolved.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not resolve this request.",
      );
    } finally {
      setResolvingReview(null);
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
                    {progress
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
                  on your Mac. Your previous draft and active program stay
                  available.
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
