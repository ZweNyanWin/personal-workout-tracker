import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { buildWorkoutHistoryQuery, parseWorkoutHistoryFilters, WORKOUT_HISTORY_PAGE_SIZE, workoutHistoryHref, workoutHistoryLogHref } from "../lib/history/workout-history-query.ts";

const memberId = "00000000-0000-4000-8000-000000000002";

test("history filters default to twenty-row page one and validate dates, identities and ambiguous query parameters", () => {
  assert.deepEqual(parseWorkoutHistoryFilters(), { q: "", from: "", to: "", page: 1 });
  assert.equal(WORKOUT_HISTORY_PAGE_SIZE, 20);
  assert.deepEqual(parseWorkoutHistoryFilters({ memberId, q: " Bench ", from: "2024-02-29", to: "2024-03-01", page: "3" }), {
    memberId, q: "Bench", from: "2024-02-29", to: "2024-03-01", page: 3,
  });
  for (const params of [
    { memberId: "foreign-target" }, { q: ["bench", "squat"] }, { memberId: [memberId, memberId] },
    { q: "x".repeat(81) }, { q: "bench\nsquat" }, { from: "2025-02-29" }, { from: "2024-04-31" },
    { from: "2026-10-02", to: "2026-10-01" }, { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "1001" },
  ]) assert.throws(() => parseWorkoutHistoryFilters(params), undefined, JSON.stringify(params));
});

test("history and detail links preserve filters, member identity and page through an internal return target", () => {
  const filters = parseWorkoutHistoryFilters({ memberId, q: "Bench & squat", from: "2026-01-01", to: "2026-10-02", page: "3" });
  const history = new URL(workoutHistoryHref(filters), "https://powerbuild.example");
  assert.equal(history.pathname, "/history");
  assert.equal(history.searchParams.get("q"), "Bench & squat");
  assert.equal(history.searchParams.get("memberId"), memberId);
  assert.equal(history.searchParams.get("page"), "3");
  const detail = new URL(workoutHistoryLogHref(memberId, filters), "https://powerbuild.example");
  assert.equal(detail.pathname, `/log/${memberId}`);
  assert.equal(detail.searchParams.get("returnTo"), history.pathname + history.search);
  assert.equal(new URL(workoutHistoryHref(filters, 1), "https://powerbuild.example").searchParams.has("page"), false);
  assert.equal(new URL(workoutHistoryHref(filters, 4), "https://powerbuild.example").searchParams.get("q"), filters.q);
});

function capturedClient() {
  const requests = [];
  const client = createClient("https://history-test.example", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
      return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "20-39/105" } });
    } },
  });
  return { client, requests };
}

test("server query requests only the selected twenty rows with exact count and stable date/id ordering", async () => {
  const { client, requests } = capturedClient();
  const result = await buildWorkoutHistoryQuery(client, memberId, parseWorkoutHistoryFilters({ page: "2" }));
  assert.equal(result.count, 105);
  assert.equal(requests.length, 1);
  const { url, headers } = requests[0];
  assert.equal(url.pathname, "/rest/v1/workout_logs");
  assert.equal(url.searchParams.get("user_id"), `eq.${memberId}`);
  assert.equal(url.searchParams.get("status"), "eq.completed");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.equal(url.searchParams.get("offset"), "20");
  assert.equal(url.searchParams.get("order"), "date.desc,id.desc");
  assert.match(headers.get("prefer"), /count=exact/);
  assert.equal(url.searchParams.has("or"), false);
  assert.equal(url.searchParams.get("select").includes("session_match"), false);
});

test("search OR matches both log and session title under the same member/date filters and safely quotes search literals", async () => {
  const { client, requests } = capturedClient();
  const q = '100%_bench,\"),or(user_id.eq.foreign)';
  const filters = parseWorkoutHistoryFilters({ q, from: "2026-01-01", to: "2026-10-02" });
  await buildWorkoutHistoryQuery(client, memberId, filters);
  const url = requests[0].url;
  assert.equal(url.searchParams.getAll("date").join("|"), "gte.2026-01-01|lte.2026-10-02");
  assert.equal(url.searchParams.get("user_id"), `eq.${memberId}`);
  const pattern = `%100\\%\\_bench,\"),or(user\\_id.eq.foreign)%`;
  assert.equal(url.searchParams.get("session_match.title"), `ilike.${pattern}`);
  assert.equal(url.searchParams.get("or"), `(title.ilike.${JSON.stringify(pattern)},session_match.not.is.null)`);
  assert.match(url.searchParams.get("select"), /session:program_sessions\(title\),session_match:program_sessions\(\)/);
  assert.equal(url.searchParams.get("limit"), "20");
  assert.equal(url.searchParams.get("offset"), "0");
});
