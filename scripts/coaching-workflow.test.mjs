import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkflowProgramDraft } from "../lib/coach/workflow-schema.ts";
import { workoutSetUpdateSchema } from "../lib/validations.ts";
import { requestedProgramWeeks } from "../lib/coach/week-selection.ts";

const scope = { startWeek: 5, weekCount: 1, daysPerWeek: 1 };
const base = {
  title: "Reviewed synthetic block", status: "proposed", assumptions: ["Synthetic fixture"],
  progression: "Coach reviews progression", regression: "Coach reviews adjustments",
  weeks: [{ number: 5, focus: "Technique", days: [{ number: 1, title: "Upper", warmup: "Light ramp sets", exercises: [
    { name: "Paused bench press", sets: 1, dose: { kind: "reps", range: { min: 1, max: 1 }, perSide: false }, loadOrAssistance: "100 lb", effort: "RPE 7", restSeconds: 180, notes: "Top single" },
    { name: "Paused bench press", sets: 3, dose: { kind: "reps", range: { min: 5, max: 5 }, perSide: false }, loadOrAssistance: "80 lb", effort: "2 RIR", restSeconds: 120, notes: "Backdowns" },
    { name: "Tuck front lever", sets: 3, dose: { kind: "hold", seconds: { min: 8, max: 12 } }, loadOrAssistance: "Bodyweight", effort: "End before position loss", restSeconds: 120 },
  ] }] }],
};

test("approved drafts retain exact variants, separate dose groups, units and hold seconds", () => {
  const result = validateWorkflowProgramDraft(base, scope);
  assert.deepEqual(result, base);
  assert.equal(result.weeks[0].days[0].exercises.length, 3);
  assert.equal(result.weeks[0].days[0].exercises[0].loadOrAssistance, "100 lb");
  assert.equal(result.weeks[0].days[0].exercises[2].dose.kind, "hold");
});

test("approval rejects extra or missing requested calendar coverage and incomplete prescriptions", () => {
  for (const edit of [
    (draft) => { draft.weeks[0].number = 1; },
    (draft) => { draft.weeks.push(structuredClone(draft.weeks[0])); },
    (draft) => { draft.weeks[0].days[0].number = 2; },
    (draft) => { delete draft.weeks[0].days[0].exercises[1].effort; },
    (draft) => { draft.weeks[0].days[0].exercises[2].dose = { kind: "hold", range: { min: 8, max: 12 } }; },
  ]) {
    const draft = structuredClone(base); edit(draft);
    assert.throws(() => validateWorkflowProgramDraft(draft, scope));
  }
  assert.throws(() => validateWorkflowProgramDraft(base, { ...scope, weekCount: 17 }));
});

test("timed holds are recorded explicitly as seconds, without manufacturing repetitions", () => {
  assert.deepEqual(workoutSetUpdateSchema.parse({ hold_seconds: 12.5, is_completed: true }), { hold_seconds: 12.5, is_completed: true });
  assert.equal(workoutSetUpdateSchema.parse({ hold_seconds: 12.5 }).reps, undefined);
  for (const seconds of [-1, 3601, Infinity, NaN, "12"]) {
    assert.equal(workoutSetUpdateSchema.safeParse({ hold_seconds: seconds }).success, false);
  }
  assert.equal(workoutSetUpdateSchema.safeParse({ reps: 12.5 }).success, false);
  assert.equal(workoutSetUpdateSchema.safeParse({ reps: 12, hold_seconds: 12 }).success, false);
});

test("client week questions select full ranges and lists without inventing missing weeks", () => {
  const available = [1, 2, 3, 4];
  assert.deepEqual(requestedProgramWeeks("Show weeks 1–4 sets and reps", available), available);
  assert.deepEqual(requestedProgramWeeks("Compare weeks 2 and 3", available), [2, 3]);
  assert.deepEqual(requestedProgramWeeks("Week 1 and week 4", available), [1, 4]);
  assert.deepEqual(requestedProgramWeeks("Show every week", available), available);
  assert.deepEqual(requestedProgramWeeks("What about week 9?", available), [9]);
  assert.equal(requestedProgramWeeks("What is next?", available), null);
});
