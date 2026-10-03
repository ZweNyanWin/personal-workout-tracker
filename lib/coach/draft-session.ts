import type { CoachingDraftRecord, CoachingProfile, CoachingScope, WorkflowProgramDraft } from "./workflow-schema.ts";

export type DraftJob = { jobId: string; draftId: string; startedAt: number };
export type DraftEditorState = {
  selectedId: string | null; selectedRevision: number | null;
  brief: string; scope: CoachingScope; mode: "new" | "continue";
  content: WorkflowProgramDraft | null; profile: CoachingProfile;
  dirty: boolean; profileDirty: boolean;
};
export type DraftJobState = {
  job: DraftJob; status: "running" | "retrying" | "completed" | "failed";
  progress?: { week: number; totalWeeks: number }; draft?: CoachingDraftRecord; error?: string;
};
type PollResult = { status: string; progress?: { week: number; totalWeeks: number }; draft?: CoachingDraftRecord; error?: string };
type Dependencies = {
  poll(job: DraftJob, signal: AbortSignal): Promise<PollResult>;
  latest(draftId: string): Promise<CoachingDraftRecord | null>;
  terminalError(error: unknown): boolean;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  unschedule?: (timer: ReturnType<typeof setTimeout>) => void;
};
type TrackedJob = {
  state: DraftJobState; ownerId: string; listeners: Set<(value: DraftJobState) => void>;
  controller: AbortController; timer?: ReturnType<typeof setTimeout>; failures: number;
};

type WorkspaceLoadTicket = { accountId: string; revision: number };

/** Reject an authenticated workspace response after any intervening account change. */
export function createWorkspaceLoadGuard() {
  let accountId: string | null = null;
  let revision = 0;
  let observed = false;
  return {
    observeAccount(nextAccountId: string | null) {
      const changed = observed && accountId !== nextAccountId;
      if (!observed || accountId !== nextAccountId) {
        accountId = nextAccountId;
        revision += 1;
        observed = true;
      }
      return changed;
    },
    begin(): WorkspaceLoadTicket | null {
      return observed && accountId ? { accountId, revision } : null;
    },
    isCurrent(ticket: WorkspaceLoadTicket, serverAccountId: string | undefined) {
      return observed && accountId === ticket.accountId && revision === ticket.revision
        && serverAccountId === ticket.accountId;
    },
  };
}

/** The database pointer is authoritative; no browser-stored job ID can choose another coach's draft. */
export function pendingDraftJob(drafts: CoachingDraftRecord[], ownerId: string): { draft: CoachingDraftRecord; job: DraftJob } | null {
  const draft = drafts.find((value) => value.coach_id === ownerId && value.status === "draft"
    && value.generation_job_id && value.generation_revision === value.revision);
  if (!draft?.generation_job_id) return null;
  const startedAt = Date.parse(draft.updated_at);
  return { draft, job: { jobId: draft.generation_job_id, draftId: draft.id, startedAt: Number.isFinite(startedAt) ? startedAt : Date.now() } };
}

/** Private editor data stays in this tab's memory, never localStorage/sessionStorage. */
export function createDraftSession(dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  const schedule = dependencies.schedule ?? setTimeout;
  const unschedule = dependencies.unschedule ?? clearTimeout;
  let owner: string | null = null;
  const editors = new Map<string, { value: DraftEditorState; touchedAt: number }>();
  const jobs = new Map<string, TrackedJob>();
  const listeners = new Map<string, Set<(value: DraftJobState) => void>>();
  const dispatches = new Set<string>();
  const dispatchListeners = new Map<string, Set<(busy: boolean) => void>>();
  const key = (ownerId: string, memberId: string) => `${ownerId}:${memberId}`;
  function clear() {
    for (const tracked of jobs.values()) {
      tracked.controller.abort();
      if (tracked.timer) unschedule(tracked.timer);
      tracked.listeners.clear();
    }
    jobs.clear(); editors.clear(); listeners.clear(); dispatches.clear(); dispatchListeners.clear();
  }
  function current(id: string, tracked: TrackedJob) {
    return owner === tracked.ownerId && jobs.get(id) === tracked && !tracked.controller.signal.aborted;
  }
  function notify(tracked: TrackedJob) {
    for (const listener of tracked.listeners) listener(tracked.state);
  }
  async function poll(id: string, tracked: TrackedJob) {
    if (!current(id, tracked)) return;
    try {
      const result = await dependencies.poll(tracked.state.job, tracked.controller.signal);
      if (!current(id, tracked)) return;
      if (!["queued", "running", "completed", "failed", "cancelled"].includes(result.status)) throw new Error("Could not verify Tommy's drafting status. Retrying…");
      tracked.failures = 0;
      tracked.state = {
        job: tracked.state.job, status: result.status === "completed" ? "completed" : ["failed", "cancelled"].includes(result.status) ? "failed" : "running",
        ...(result.progress ? { progress: result.progress } : tracked.state.progress ? { progress: tracked.state.progress } : {}),
        ...(result.draft ? { draft: result.draft } : {}), ...(result.error ? { error: result.error } : {}),
      };
      if (tracked.state.status === "completed" && !result.draft) throw new Error("The completed draft could not be loaded. Retrying…");
      notify(tracked);
      if (tracked.state.status === "completed" || tracked.state.status === "failed") return;
    } catch (error) {
      if (!current(id, tracked)) return;
      if (dependencies.terminalError(error)) {
        const draft = await dependencies.latest(tracked.state.job.draftId).catch(() => null);
        if (!current(id, tracked)) return;
        tracked.state = { ...tracked.state, status: "failed", ...(draft ? { draft } : {}),
          error: "This generation expired or the saved draft changed. Your latest saved draft is kept; review it before trying again." };
        notify(tracked);
        return;
      }
      tracked.failures += 1;
      tracked.state = { ...tracked.state, status: "retrying", error: "The Mac connection was interrupted. Tommy's saved job is kept, and PowerBuild will check it again." };
      notify(tracked);
    }
    if (current(id, tracked)) tracked.timer = schedule(() => { void poll(id, tracked); }, Math.min(30000, 5000 * Math.max(1, tracked.failures)));
  }
  return {
    activate(ownerId: string | null) {
      if (owner !== ownerId) { clear(); owner = ownerId; }
    },
    verifyBrowserAccount(ownerId: string | null) {
      // Auth events can invalidate a verified workspace, never grant one.
      if (owner && owner !== ownerId) { clear(); owner = null; }
    },
    rememberEditor(ownerId: string, memberId: string, value: DraftEditorState) {
      if (owner !== ownerId || value.profile.member_id !== memberId) return;
      editors.set(key(ownerId, memberId), { value, touchedAt: now() });
      // Keep at most twenty recent workspaces in this tab's memory.
      if (editors.size > 20) editors.delete(editors.keys().next().value!);
    },
    restoreEditor(ownerId: string, memberId: string, drafts: CoachingDraftRecord[]) {
      if (owner !== ownerId) return null;
      const id = key(ownerId, memberId); const cached = editors.get(id);
      if (!cached) return null;
      const saved = cached.value.selectedId ? drafts.find((draft) => draft.id === cached.value.selectedId && draft.coach_id === ownerId && draft.member_id === memberId) : null;
      if (now() - cached.touchedAt > 30 * 60 * 1000 || (cached.value.selectedId && (!saved || saved.revision !== cached.value.selectedRevision || saved.status === "approved"))) {
        editors.delete(id); return null;
      }
      return cached.value;
    },
    forgetEditor(ownerId: string, memberId: string) { editors.delete(key(ownerId, memberId)); },
    dispatch(ownerId: string, memberId: string, busy: boolean) {
      if (owner !== ownerId) return;
      const id = key(ownerId, memberId);
      if (busy) dispatches.add(id); else dispatches.delete(id);
      for (const listener of dispatchListeners.get(id) ?? []) listener(busy);
    },
    subscribeDispatch(ownerId: string, memberId: string, listener: (busy: boolean) => void) {
      if (owner !== ownerId) return () => {};
      const id = key(ownerId, memberId); const group = dispatchListeners.get(id) ?? new Set();
      dispatchListeners.set(id, group); group.add(listener); listener(dispatches.has(id));
      return () => { group.delete(listener); if (!group.size) dispatchListeners.delete(id); };
    },
    track(ownerId: string, memberId: string, job: DraftJob, acceptedDraft?: CoachingDraftRecord) {
      if (owner !== ownerId) return;
      const id = key(ownerId, memberId); const existing = jobs.get(id);
      if (existing?.state.job.jobId === job.jobId) return;
      if (existing) { existing.controller.abort(); if (existing.timer) unschedule(existing.timer); }
      if (jobs.size >= 20) {
        const stale = [...jobs].find(([previousId, value]) => previousId !== id && ["completed", "failed"].includes(value.state.status) && !value.listeners.size);
        if (stale) { stale[1].controller.abort(); jobs.delete(stale[0]); listeners.delete(stale[0]); }
      }
      const group = listeners.get(id) ?? new Set(); listeners.set(id, group);
      const draft = acceptedDraft?.coach_id === ownerId && acceptedDraft.member_id === memberId && acceptedDraft.id === job.draftId ? acceptedDraft : undefined;
      const tracked: TrackedJob = { state: { job, status: "running", ...(draft ? { draft } : {}) }, ownerId, listeners: group, controller: new AbortController(), failures: 0 };
      jobs.set(id, tracked); notify(tracked);
      // Polling belongs to the authenticated tab session, not a page component.
      // Removing a page's listener never cancels the Mac job or its result save.
      void poll(id, tracked);
    },
    subscribe(ownerId: string, memberId: string, listener: (state: DraftJobState) => void) {
      const id = key(ownerId, memberId); const tracked = jobs.get(id);
      if (owner !== ownerId) return () => {};
      const group = listeners.get(id) ?? new Set(); listeners.set(id, group); group.add(listener);
      if (tracked) listener(tracked.state);
      return () => { group.delete(listener); if (!group.size && !jobs.has(id)) listeners.delete(id); };
    },
    state(ownerId: string, memberId: string) { return owner === ownerId ? jobs.get(key(ownerId, memberId))?.state ?? null : null; },
    forgetJob(ownerId: string, memberId: string) {
      const id = key(ownerId, memberId); const tracked = jobs.get(id);
      if (tracked) { tracked.controller.abort(); if (tracked.timer) unschedule(tracked.timer); jobs.delete(id); if (!tracked.listeners.size) listeners.delete(id); }
    },
  };
}
