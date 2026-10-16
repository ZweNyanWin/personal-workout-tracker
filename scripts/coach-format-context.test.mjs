import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";

// Exercise the actual context builder and route with in-memory transports.
// No Supabase credentials, HTTP requests, model calls or database writes occur.
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
const fixtures = "__powerbuildFormattingContextTest";
const serverStub = moduleUrl(`export async function createClient(options = {}) {
  const fixture = globalThis.${fixtures};
  if (!fixture) throw new Error("An in-memory Supabase fixture is required");
  fixture.signals.push(options.signal);
  return fixture.client;
}`);
const actionsStub = moduleUrl(`export async function saveCoachingDraft(input) {
  const fixture = globalThis.${fixtures}; fixture.savedInputs.push(input);
  return { success: true, data: fixture.draft };
}`);
const gatewayStub = moduleUrl(`export class GatewayRequestError extends Error {}
export const coachJson = (value, status = 200) => Response.json(value, { status });
export const readCoachInput = request => request.json();
export const mutationFromApp = request => request.headers.get("origin") === "https://powerbuild.example";
export async function gatewayCall(path, method = "GET", body) {
  const fixture = globalThis.${fixtures}; fixture.gatewayCalls.push({ path, method, body });
  return { jobId: fixture.jobId, status: "running" };
}`);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: moduleUrl("export {};"), shortCircuit: true };
  if (specifier === "@/lib/supabase/server") return { url: serverStub, shortCircuit: true };
  if (specifier === "@/lib/actions/coaching") return { url: actionsStub, shortCircuit: true };
  if (specifier === "@/lib/coach/gateway-client") return { url: gatewayStub, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const url = new URL(`../${specifier.slice(2)}`, import.meta.url);
    if (!existsSync(url)) url.pathname += ".ts";
    return next(url.href, context);
  }
  return next(specifier, context);
} });

const { buildClientContext, isWrittenProgramFormattingRequest } = await import("../lib/coach/context.ts");
const { POST, maxDuration } = await import("../app/api/coach/program/route.ts");
const coachId = "81000000-0000-4000-8000-000000000001";
const memberId = "81000000-0000-4000-8000-000000000002";
const source = `WEEK 1 — Source
Day 1 — Upper
1. Bench Press: 2x5 @ 47 kg RPE 7 rest 2 min
WEEK 2 — Source
Day 1 — Upper
1. Bench Press: 2x5 @ 49 kg RPE 7 rest 2 min`;
const scope = { startWeek: 1, weekCount: 2, daysPerWeek: 1 };
const formatting = { purpose: "written-program-formatting" };

function fixture({ user = coachId, authError = null, allowed = true, accessError = null,
  canCoach = true, aiEnabled = true, profile = { training_context: "Equipment: barbell and flat bench.", coach_rules: "Preserve exact rest.", nutrition_targets: "No peanuts." }, profileError = null } = {}) {
  const state = { tables: [], rpcs: [], signals: [], savedInputs: [], gatewayCalls: [],
    jobId: "81000000-0000-4000-8000-000000000004",
    draft: { id: "81000000-0000-4000-8000-000000000003", member_id: memberId, coach_id: coachId,
      brief: source, scope, content: null, revision: 1, status: "draft" } };
  state.client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: authError }) },
    rpc: async (name, params) => {
      state.rpcs.push({ name, params });
      if (name === "can_coach_member") return { data: allowed, error: accessError };
      if (name === "is_admin") return { data: canCoach, error: accessError };
      if (name === "coach_ai_access") return { data: aiEnabled, error: accessError };
      if (name === "set_coaching_generation") return { data: state.draft, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from(table) {
      const call = { table, filters: [] }; state.tables.push(call);
      const result = () => {
        if (table === "profiles") return { data: { id: memberId }, error: null };
        if (table === "coaching_profiles") return { data: profile, error: profileError };
        if (table === "user_program_assignments") return { data: null, error: null };
        if (table === "workout_logs") return { data: [], error: null };
        if (table === "exercises") return { data: [{ id: "81000000-0000-4000-8000-000000000005", name: "Bench Press",
          movement_type: "push", equipment: "barbell", created_by: coachId, is_public: false,
          coaching_client_id: null, organization_id: null }], error: null };
        throw new Error(`Unexpected table: ${table}`);
      };
      const query = {
        select(fields) { call.fields = fields; return query; },
        eq(field, value) { call.filters.push([field, value]); return query; },
        is(field, value) { call.filters.push([field, value]); return query; },
        order() { return query; }, limit() { return query; },
        single: async () => result(), maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  return state;
}

function request(brief = source, mode = "new") {
  return new Request("https://powerbuild.example/api/coach/program", { method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://powerbuild.example" },
    body: JSON.stringify({ memberId, brief, scope, ...(mode ? { mode } : {}) }) });
}

test("format-only selection requires written day prescriptions and never replaces continue-mode context", () => {
  assert.equal(isWrittenProgramFormattingRequest(source, "new"), true);
  assert.equal(isWrittenProgramFormattingRequest(source), true);
  assert.equal(isWrittenProgramFormattingRequest(source, "continue"), false);
  assert.equal(isWrittenProgramFormattingRequest("Write a 12-week four-day squat block", "new"), false);
  assert.equal(isWrittenProgramFormattingRequest("WEEK 1 — Build\nWEEK 2 — Progress", "new"), false);
  assert.equal(isWrittenProgramFormattingRequest(source.split("WEEK 2")[0], "new"), false);
});

test("formatting rechecks authentication and client membership before any profile query", async () => {
  for (const options of [{ user: null }, { authError: { message: "untrusted" } }, { allowed: false }, { accessError: { message: "untrusted" } }]) {
    const state = fixture(options);
    await assert.rejects(buildClientContext(memberId, state.client, formatting), /Not authenticated|Not authorized/);
    assert.deepEqual(state.tables, []);
  }
  const self = fixture({ user: memberId });
  await buildClientContext(memberId, self.client, formatting);
  assert.equal(self.rpcs.length, 0);
});

test("formatting preserves complete clinical context, coach rules and nutrition with explicit source provenance", async () => {
  const profile = { training_context: "Clinical and equipment context. " + "x".repeat(2200) + "CLINICAL_END",
    coach_rules: "Coach rule. " + "y".repeat(2300) + "RULE_END",
    nutrition_targets: "Nutrition preference. " + "z".repeat(2000) + "NUTRITION_END" };
  const state = fixture({ profile });
  const value = await buildClientContext(memberId, state.client, formatting);
  assert.deepEqual(state.tables.map(call => call.table), ["coaching_profiles"]);
  assert.deepEqual(state.tables[0].filters, [["member_id", memberId]]);
  assert.equal(value.trainingContext, profile.training_context);
  for (const field of Object.values(profile)) assert.ok(value.text.includes(field));
  assert.match(value.text, /ASSIGNED PROGRAM: Unavailable/);
  assert.match(value.text, /COMPLETED HISTORY: Unavailable/);
  assert.match(value.text, /proposals for coach review/);
  assert.match(value.text, /not recorded achievements/);
  assert.equal(value.summary.assignmentId, null);
  assert.equal(value.summary.completedLogCount, 0);
});

test("the complete profile fits exactly at the context bound and fails clearly instead of clipping above it", async () => {
  const profile = { training_context: "A", coach_rules: "R".repeat(3000), nutrition_targets: "N".repeat(2000) };
  const initial = await buildClientContext(memberId, fixture({ profile }).client, formatting);
  profile.training_context = "A".repeat(12000 - initial.text.length + 1);
  assert.ok(Object.values(profile).every(field => field.length <= 8000));
  const boundary = await buildClientContext(memberId, fixture({ profile }).client, formatting);
  assert.equal(boundary.text.length, 12000);
  assert.equal(boundary.trainingContext, profile.training_context);
  profile.training_context += "B";
  await assert.rejects(buildClientContext(memberId, fixture({ profile }).client, formatting), /12,000-character.*no profile rules or constraints were truncated/);
});

test("missing approved profile stays unknown and a profile query failure blocks formatting", async () => {
  const missing = await buildClientContext(memberId, fixture({ profile: null }).client, formatting);
  assert.equal(missing.trainingContext, "");
  assert.match(missing.text, /constraints, coach rules and approved nutrition targets are unknown/);
  await assert.rejects(buildClientContext(memberId, fixture({ profileError: { message: "private detail" } }).client, formatting), /complete coach-approved profile could not be loaded/);
});

test("normal chat context retains assigned-program and completed-history queries", async () => {
  const state = fixture();
  const value = await buildClientContext(memberId, state.client, { question: "Review my last workout" });
  assert.deepEqual(state.tables.map(call => call.table), ["user_program_assignments", "coaching_profiles", "workout_logs"]);
  assert.equal(value.trainingContext, undefined);
  assert.match(value.text, /SERVER-LOADED CLIENT CONTEXT/);
  assert.doesNotMatch(value.text, /FORMATTING-ONLY/);
});

test("program POST uses one profile read only for written-source formatting and retains its existing deadline", async () => {
  const state = fixture(); globalThis[fixtures] = state;
  const response = await POST(request());
  assert.equal(response.status, 202, await response.clone().text());
  assert.equal(state.tables.filter(call => call.table === "coaching_profiles").length, 1);
  assert.ok(!state.tables.some(call => ["workout_logs", "user_program_assignments"].includes(call.table)));
  assert.match(state.gatewayCalls[0].body.context, /FORMATTING-ONLY/);
  assert.equal(state.gatewayCalls[0].body.program.trainingContext, "Equipment: barbell and flat bench.");
  assert.equal(state.savedInputs[0].brief, source);
  assert.ok(state.rpcs.some(call => call.name === "can_coach_member" && call.params.p_member_id === memberId));
  assert.ok(state.rpcs.some(call => call.name === "set_coaching_generation"));
  assert.equal(maxDuration, 30);
  assert.equal(state.signals.length, 1);
  assert.equal(state.signals[0].aborted, false);
});

test("continue mode and arbitrary new briefs keep full context while failed profile rules cannot dispatch", async () => {
  for (const [brief, mode] of [[source, "continue"], ["Write a two-week one-day bench block", "new"]]) {
    const state = fixture(); globalThis[fixtures] = state;
    const response = await POST(request(brief, mode));
    assert.equal(response.status, 202, await response.clone().text());
    assert.ok(state.tables.some(call => call.table === "workout_logs"));
    assert.ok(state.tables.some(call => call.table === "user_program_assignments"));
    assert.doesNotMatch(state.gatewayCalls[0].body.context, /FORMATTING-ONLY/);
  }
  const failed = fixture({ profileError: { message: "private detail" } }); globalThis[fixtures] = failed;
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(failed.gatewayCalls.length, 0);
  assert.equal((await response.json()).draft.id, failed.draft.id);
});

test("both coach access checks remain mandatory after parallelization", async () => {
  for (const flags of [{ canCoach: false }, { aiEnabled: false }, { accessError: { message: "untrusted" } }]) {
    const state = fixture(flags); globalThis[fixtures] = state;
    assert.equal((await POST(request())).status, 403);
    assert.deepEqual(state.rpcs.map(call => call.name), ["is_admin", "coach_ai_access"]);
    assert.equal(state.gatewayCalls.length, 0);
    assert.equal(state.savedInputs.length, 0);
  }
});

test("independent coach permission RPCs start together without waiting for the first result", async () => {
  const state = fixture(); globalThis[fixtures] = state;
  const rpc = state.client.rpc;
  let release;
  state.client.rpc = (name, params) => name === "is_admin" ? new Promise(resolve => {
    state.rpcs.push({ name, params }); release = () => resolve({ data: true, error: null });
  }) : rpc(name, params);
  const startup = POST(request());
  await new Promise(resolve => setImmediate(resolve));
  const started = state.rpcs.map(call => call.name);
  release();
  const response = await startup;
  assert.deepEqual(started, ["is_admin", "coach_ai_access"]);
  assert.equal(response.status, 202, await response.clone().text());
});
