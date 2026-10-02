import assert from "node:assert/strict";
import test from "node:test";
import { generateProgram, weekOutputSchema } from "./program-generation.mjs";
import { effortProblems, programEffortProblems } from "../lib/coach/effort-validation.mjs";

function week(number, days = 2) {
  return { title: "Reviewed strength block", assumptions: ["Working weights were not provided"], progression: "Follow the coach's targets", regression: "Ask the coach if targets cannot be met",
    week: { number, focus: "Technique", days: Array.from({ length: days }, (_, index) => ({ number: index + 1,
      title: "Training", warmup: "Gradual familiar warmup", exercises: [
        { name: "Paused bench press — top single", sets: 1, dose: { kind: "reps", range: { min: 1, max: 1 }, perSide: false }, loadOrAssistance: "Coach-supplied load", effort: "RPE 8", restSeconds: 180, notes: "Pause every rep" },
        { name: "Paused bench press — backdowns", sets: 3, dose: { kind: "reps", range: { min: 5, max: 5 }, perSide: false }, loadOrAssistance: "Coach-supplied load", effort: "RPE 7", restSeconds: 120, notes: "" },
        { name: "Supported L-sit", sets: 3, dose: { kind: "hold", seconds: { min: 10, max: 20 } }, loadOrAssistance: "Feet supported", effort: "Stop before position loss", restSeconds: 90, notes: "" },
      ] })) } };
}
const request = { scope: { startWeek: 1, weekCount: 4, daysPerWeek: 2 }, brief: "Preserve my top single and backdown prescription" };
const response = (value, extra = {}) => ({ done: true, done_reason: "stop", message: { content: JSON.stringify(value) }, ...extra });

test("effort guard catches observed contradictions without confusing independent prescriptions", () => {
  for (const target of ["RPE 8 (2 RIR)", "RPE 6–7; 3–4 RIR", "RPE 6–7 (3–4 RIR)", "2 RIR", "RIR 3", "Stop before position loss"]) assert.deepEqual(effortProblems(target), [], target);
  for (const target of ["RPE 8 (3 RIR)", "RPE 7 = 2 reps in reserve", "RPE", "RIR", "RPE 0"]) assert.ok(effortProblems(target).length, target);
  assert.deepEqual(programEffortProblems({ exercises: [{ effort: "RPE 8" }, { effort: "3 RIR" }] }), []);
});

test("generates all requested weeks separately and preserves distinct doses, variants and holds", async () => {
  const calls = [], progress = [];
  const draft = await generateProgram({ program: request, context: "Actual completed sets: none", system: "System rules", signal: new AbortController().signal,
    progress: (p) => progress.push(p), chat: async (body) => { calls.push(body); return response(week(calls.length)); } });
  assert.deepEqual(draft.weeks.map((w) => w.number), [1, 2, 3, 4]);
  assert.equal(calls.length, 4);
  assert.equal(progress.at(-1).totalWeeks, 4);
  assert.equal(draft.weeks[3].days[1].exercises.length, 3);
  assert.equal(draft.weeks[0].days[0].exercises[2].dose.kind, "hold");
  assert.match(calls[0].messages[1].content, /Actual completed sets: none/);
  assert.match(calls[1].messages[1].content, /PREVIOUS DRAFT WEEK/);
  assert.equal(calls[3].format.properties.week.properties.number.const, 4);
});

test("bounded repair fixes an omitted day without fabricating it in code", async () => {
  let count = 0;
  const draft = await generateProgram({ program: { ...request, scope: { ...request.scope, weekCount: 1 } }, system: "rules", signal: new AbortController().signal,
    chat: async () => response(week(1, ++count === 1 ? 1 : 2)) });
  assert.equal(count, 2); assert.equal(draft.weeks[0].days.length, 2);
});

test("duplicate days, missing exercise dose and truncation fail rather than returning a partial plan", async () => {
  for (const mutation of [
    (w) => { w.week.days[1].number = 1; },
    (w) => { delete w.week.days[0].exercises[0].effort; },
    (w) => { w.week.days[0].exercises[0].dose.range.max = 0; },
  ]) {
    let calls = 0;
    await assert.rejects(generateProgram({ program: request, signal: new AbortController().signal, system: "rules",
      chat: async () => { calls++; const w = week(1); mutation(w); return response(w); } }), /complete week 1/);
    assert.equal(calls, 2);
  }
  await assert.rejects(generateProgram({ program: request, signal: new AbortController().signal, system: "rules",
    chat: async () => response(week(1), { done_reason: "length" }) }), /complete week 1/);
});

test("cancellation prevents starting further weeks", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(generateProgram({ program: request, signal: controller.signal, system: "rules",
    chat: async () => { calls++; controller.abort(); return response(week(1)); } }), { name: "AbortError" });
  assert.equal(calls, 1);
  const schema = weekOutputSchema(7, 3);
  assert.equal(schema.properties.week.properties.days.maxItems, 3);
});
