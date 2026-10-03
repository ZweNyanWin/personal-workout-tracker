import test from "node:test";
import assert from "node:assert/strict";
import { createDraftSession, createWorkspaceLoadGuard, pendingDraftJob } from "../lib/coach/draft-session.ts";

const coach = "11111111-1111-4111-8111-111111111111";
const otherCoach = "22222222-2222-4222-8222-222222222222";
const member = "33333333-3333-4333-8333-333333333333";
const otherMember = "44444444-4444-4444-8444-444444444444";
const draftId = "55555555-5555-4555-8555-555555555555";
const jobId = "66666666-6666-4666-8666-666666666666";
const job = { jobId, draftId, startedAt: Date.now() };
const scope = { startWeek: 1, weekCount: 1, daysPerWeek: 7 };
const profile = { member_id: member, training_context: "Fictional home equipment", coach_rules: "", nutrition_targets: "" };
const row = (overrides = {}) => ({ id: draftId, member_id: member, coach_id: coach, brief: "One week at home", scope,
  content: null, revision: 2, status: "draft", generation_job_id: jobId, generation_revision: 2, assignment_id: null,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:01:00Z", ...overrides });
const editor = (overrides = {}) => ({ selectedId: draftId, selectedRevision: 2, brief: "Unsaved fictional edits", scope, mode: "new", content: null,
  profile, dirty: true, profileDirty: false, ...overrides });
const settle = () => new Promise((resolve) => setImmediate(resolve));
function harness(overrides = {}) {
  const scheduled = []; const cancelled = new Set(); const calls = [];
  const session = createDraftSession({
    poll: async (...args) => { calls.push(args); return { status: "running", progress: { week: 1, totalWeeks: 1 } }; },
    latest: async () => row(), terminalError: (error) => error?.status === 409,
    schedule: (callback, delay) => { const timer = { callback, delay }; scheduled.push(timer); return timer; },
    unschedule: (timer) => cancelled.add(timer), ...overrides,
  });
  session.activate(coach);
  return { session, scheduled, cancelled, calls, async next() {
    const timer = scheduled.shift(); assert.ok(timer, "A saved job should have a retry check scheduled");
    if (!cancelled.has(timer)) timer.callback(); await settle(); return timer.delay;
  } };
}

test("an initial workspace load cannot restore private data after switching accounts", async () => {
  const guard = createWorkspaceLoadGuard();
  assert.equal(guard.begin(), null, "Wait for the browser's initial auth identity before loading");
  guard.observeAccount(coach);
  const ticket = guard.begin();
  let resolveWorkspace;
  const response = new Promise((resolve) => { resolveWorkspace = resolve; });
  const h = harness(); h.session.activate(null);
  const applied = [];
  const load = (async () => {
    const workspace = await response;
    if (!guard.isCurrent(ticket, workspace.coachId)) return;
    h.session.activate(workspace.coachId);
    h.session.rememberEditor(workspace.coachId, member, workspace.editor);
    applied.push(workspace);
  })();
  guard.observeAccount(otherCoach);
  h.session.verifyBrowserAccount(otherCoach);
  resolveWorkspace({ coachId: coach, editor: editor() });
  await load;
  assert.deepEqual(applied, [], "The old account's brief and client context never reach the page");
  assert.equal(h.session.restoreEditor(coach, member, [row()]), null, "A late response cannot reactivate its private cache");
});

test("workspace load tickets reject sign-out, account round trips and mismatched server identities", () => {
  const guard = createWorkspaceLoadGuard();
  guard.observeAccount(coach);
  const ticket = guard.begin();
  assert.equal(guard.isCurrent(ticket, coach), true);
  assert.equal(guard.isCurrent(ticket, otherCoach), false);
  guard.observeAccount(coach);
  assert.equal(guard.isCurrent(ticket, coach), true, "A token refresh for the same account keeps the load valid");
  guard.observeAccount(null);
  assert.equal(guard.isCurrent(ticket, coach), false);
  guard.observeAccount(coach);
  assert.equal(guard.isCurrent(ticket, coach), false, "Returning to the same account cannot resurrect an earlier response");
  const current = guard.begin();
  assert.equal(guard.isCurrent(current, coach), true);
  guard.observeAccount(otherCoach);
  guard.observeAccount(coach);
  assert.equal(guard.isCurrent(current, coach), false);
});

test("delayed initial responses remain rejected after sign-out or returning to the same account", async () => {
  for (const accountEvents of [[null], [otherCoach, coach], [null, coach]]) {
    const guard = createWorkspaceLoadGuard();
    guard.observeAccount(coach);
    const ticket = guard.begin();
    let resolveWorkspace;
    const response = new Promise((resolve) => { resolveWorkspace = resolve; });
    const h = harness();
    h.session.rememberEditor(coach, member, editor());
    const applied = [];
    const load = (async () => {
      const workspace = await response;
      if (!guard.isCurrent(ticket, workspace.coachId)) return;
      h.session.activate(workspace.coachId);
      h.session.rememberEditor(workspace.coachId, member, workspace.editor);
      applied.push(workspace);
    })();
    for (const account of accountEvents) {
      guard.observeAccount(account);
      h.session.verifyBrowserAccount(account);
    }
    resolveWorkspace({ coachId: coach, editor: editor() });
    await load;
    assert.deepEqual(applied, [], "An intervening sign-out or switch invalidates the initial request permanently");
    assert.equal(h.session.restoreEditor(coach, member, [row()]), null);
  }
});

test("auth observation distinguishes initial identity and token refresh from an account change", () => {
  const guard = createWorkspaceLoadGuard();
  assert.equal(guard.observeAccount(null), false);
  assert.equal(guard.begin(), null, "An initial signed-out browser cannot dispatch a private workspace load");
  assert.equal(guard.observeAccount(coach), true);
  const ticket = guard.begin();
  assert.equal(guard.observeAccount(coach), false);
  assert.equal(guard.isCurrent(ticket, coach), true);
  assert.equal(guard.observeAccount(otherCoach), true, "Switching before the first response still clears page state");
  assert.equal(guard.isCurrent(ticket, coach), false);
});

test("database generation pointer resumes without a browser record, including an older accepted job", () => {
  const drafts = [row({ coach_id: otherCoach }), row({ generation_job_id: null }), row()];
  const restored = pendingDraftJob(drafts, coach);
  assert.equal(restored.draft.coach_id, coach);
  assert.deepEqual(restored.job, { draftId, jobId, startedAt: Date.parse(drafts[2].updated_at) });
  assert.equal(pendingDraftJob([row({ revision: 3 })], coach), null, "Already saved results must not regenerate");
  assert.equal(pendingDraftJob([row({ status: "approved" })], coach), null);
  assert.equal(pendingDraftJob(drafts, "no-other-access"), null);
});

test("leaving a page removes its listener while accepted drafting continues and saves the completed result", async () => {
  let polls = 0; let saved = null;
  const final = row({ revision: 3, content: { title: "Complete fictional home block" } });
  const h = harness({ poll: async () => { polls++; if (polls === 2) { saved = final; return { status: "completed", draft: final }; } return { status: "running" }; } });
  h.session.track(coach, member, job);
  const updates = []; const leave = h.session.subscribe(coach, member, (value) => updates.push(value));
  await settle(); leave(); const before = updates.length;
  await h.next();
  assert.equal(updates.length, before, "An unmounted page receives no later result");
  assert.equal(saved, final, "The completion API remains polled after navigation");
  assert.equal(h.session.state(coach, member).status, "completed");
  const returned = []; h.session.subscribe(coach, member, (value) => returned.push(value));
  assert.equal(returned[0].draft, final, "The returning page receives the saved result immediately");
  assert.equal(polls, 2, "Returning does not resubmit or redo model work");
});

test("reopening a running workspace attaches to the same accepted job rather than dispatching twice", async () => {
  const h = harness(); h.session.track(coach, member, job); await settle();
  const stopWatching = h.session.subscribe(coach, member, () => {}); stopWatching();
  h.session.track(coach, member, { ...job, startedAt: Date.now() });
  assert.equal(h.calls.length, 1);
  assert.equal(h.scheduled.length, 1);
  const returned = []; h.session.subscribe(coach, member, (state) => returned.push(state));
  assert.equal(returned[0].job.jobId, jobId);
});

test("a page that returns before dispatch acknowledgement receives the accepted job and its busy state", async () => {
  const h = harness(); h.session.dispatch(coach, member, true);
  const busy = []; const jobs = [];
  h.session.subscribeDispatch(coach, member, (value) => busy.push(value));
  h.session.subscribe(coach, member, (value) => jobs.push(value));
  assert.deepEqual(busy, [true]);
  h.session.track(coach, member, job); h.session.dispatch(coach, member, false);
  assert.equal(jobs[0].job.jobId, jobId); assert.deepEqual(busy, [true, false]);
  await settle(); h.session.activate(null);
});

test("intermittent connectivity preserves the accepted job through more than ten failed checks", async () => {
  let attempts = 0;
  const h = harness({ poll: async () => { if (++attempts <= 12) throw new Error("Offline"); return { status: "completed", draft: row({ revision: 3 }) }; } });
  h.session.track(coach, member, job); await settle();
  for (let i = 0; i < 11; i++) { assert.equal(h.session.state(coach, member).job.jobId, jobId); assert.ok((await h.next()) <= 30000); }
  assert.equal(h.session.state(coach, member).status, "retrying");
  await h.next(); assert.equal(h.session.state(coach, member).status, "completed");
  assert.equal(attempts, 13);
});

test("definitive stale generation stops checking and restores the latest authenticated draft", async () => {
  const h = harness({ poll: async () => { const error = new Error("Revision changed"); error.status = 409; throw error; }, latest: async () => row({ revision: 4 }) });
  h.session.track(coach, member, job); await settle();
  assert.equal(h.session.state(coach, member).status, "failed");
  assert.equal(h.session.state(coach, member).draft.revision, 4);
  assert.equal(h.scheduled.length, 0);
});

test("switching accounts or signing out aborts old poll transport and discards late results", async () => {
  let complete; let signal;
  const h = harness({ poll: async (_job, suppliedSignal) => { signal = suppliedSignal; return new Promise((resolve) => { complete = resolve; }); } });
  h.session.rememberEditor(coach, member, editor());
  h.session.track(coach, member, job); const seen = [];
  h.session.subscribe(coach, member, (state) => seen.push(state));
  h.session.verifyBrowserAccount(otherCoach);
  assert.equal(signal.aborted, true);
  complete({ status: "completed", draft: row({ revision: 3 }) }); await settle();
  assert.equal(seen.length, 1, "The other account never receives the old result");
  assert.equal(h.session.state(coach, member), null);
  h.session.activate(coach);
  assert.equal(h.session.restoreEditor(coach, member, [row()]), null);
});

test("an auth event cannot grant access to a cached workspace", () => {
  const h = harness(); h.session.activate(null); h.session.verifyBrowserAccount(coach);
  h.session.rememberEditor(coach, member, editor());
  assert.equal(h.session.restoreEditor(coach, member, [row()]), null);
});

test("private unsaved fields survive page navigation only for the verified coach and member", () => {
  const h = harness(); const value = editor(); h.session.rememberEditor(coach, member, value);
  assert.equal(h.session.restoreEditor(coach, member, [row()]), value);
  assert.equal(h.session.restoreEditor(otherCoach, member, [row()]), null);
  assert.equal(h.session.restoreEditor(coach, otherMember, [row()]), null);
  h.session.rememberEditor(coach, otherMember, value);
  assert.equal(h.session.restoreEditor(coach, otherMember, [row()]), null, "Mismatched client context cannot be cached");
  h.session.activate(otherCoach);
  assert.equal(h.session.restoreEditor(coach, member, [row()]), null);
});

test("a newer server revision or approved draft wins over an old in-memory editor", () => {
  const h = harness(); h.session.rememberEditor(coach, member, editor());
  assert.equal(h.session.restoreEditor(coach, member, [row({ revision: 3 })]), null);
  h.session.rememberEditor(coach, member, editor());
  assert.equal(h.session.restoreEditor(coach, member, [row({ status: "approved" })]), null);
});

test("private editor cache expires after thirty minutes and is bounded to recent workspaces", () => {
  let clock = 0; const h = harness({ now: () => clock });
  h.session.rememberEditor(coach, member, editor({ selectedId: null, selectedRevision: null }));
  clock = 30 * 60 * 1000 + 1;
  assert.equal(h.session.restoreEditor(coach, member, []), null);
  for (let i = 0; i < 21; i++) h.session.rememberEditor(coach, `member-${i}`, editor({ selectedId: null, selectedRevision: null, profile: { ...profile, member_id: `member-${i}` } }));
  assert.equal(h.session.restoreEditor(coach, "member-0", []), null);
  assert.ok(h.session.restoreEditor(coach, "member-20", []));
});

test("a cancelled/failed generation is retained as a terminal result without invented content", async () => {
  for (const status of ["failed", "cancelled"]) {
    const h = harness({ poll: async () => ({ status, error: "Could not finish this fictional program" }) });
    h.session.track(coach, member, job); await settle();
    const result = h.session.state(coach, member);
    assert.equal(result.status, "failed"); assert.equal(result.draft, undefined); assert.equal(h.scheduled.length, 0);
  }
});
