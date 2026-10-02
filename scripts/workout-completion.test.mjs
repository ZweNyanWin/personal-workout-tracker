import assert from "node:assert/strict";
import test from "node:test";
import { completionSets, workoutCompletionSetsSchema, workoutReturnPath } from "../lib/workout-completion.ts";

const measured = { id: "00000000-0000-4000-8000-000000000001", weight_kg: 60, reps: 5, hold_seconds: null, rpe: 8 };

test("finish payload preserves entered values and does not populate blank sets from prescriptions", () => {
  const blank = { ...measured, id: "00000000-0000-4000-8000-000000000002", weight_kg: null, reps: null, rpe: null };
  const values = completionSets([{ sets: [measured, blank], planned: { target_reps: 10, target_weight_kg: 100 } }]);
  assert.deepEqual(values, [measured, blank]);
  assert.equal(workoutCompletionSetsSchema.safeParse(values).success, true);
  assert.equal(workoutCompletionSetsSchema.safeParse([{ ...measured, is_completed: true }]).success, false);
});

test("invalid measured values, repeated IDs and mixed hold/repetition doses fail before finishing", () => {
  for (const invalid of [
    { ...measured, reps: 2.5 }, { ...measured, weight_kg: -1 },
    { ...measured, rpe: 11 }, { ...measured, hold_seconds: 10 },
    { ...measured, reps: null, hold_seconds: 0 }, { ...measured, weight_kg: Number.NaN },
  ]) assert.equal(workoutCompletionSetsSchema.safeParse([invalid]).success, false);
  assert.equal(workoutCompletionSetsSchema.safeParse([measured, measured]).success, false);
  assert.equal(workoutCompletionSetsSchema.safeParse([{ ...measured, reps: null, hold_seconds: 12, rpe: null }]).success, true);
});

test("Back preserves internal history filters and rejects external or unrelated destinations", () => {
  const own = "/history?q=Lower+B&page=2&from=2026-09-01";
  assert.equal(workoutReturnPath(own), own);
  const member = "/admin/members/00000000-0000-4000-8000-000000000002";
  assert.equal(workoutReturnPath(member), member);
  for (const value of [null, "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/api/coach", "/login", "/history/../api/coach"]) {
    assert.equal(workoutReturnPath(value), "/history");
  }
});
