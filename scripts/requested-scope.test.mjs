import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequestedScope } from "../lib/coach/requested-scope.mjs";
const selected = { startWeek: 1, weekCount: 4, daysPerWeek: 4 };
test("one-week daily request wins over stale four-week defaults and pasted progression notes", () => {
  const brief = "30–45 Minute Full-Body Home Workout (Daily, 1 Week). After 3 weeks increase reps. After 4 weeks add a dumbbell. Give me for 1 week for everyday workout, you don't need to give me 4 weeks, just one week is for me.";
  assert.deepEqual(resolveRequestedScope(brief, selected).scope, { startWeek: 1, weekCount: 1, daysPerWeek: 7 });
});
test("numeric and written durations, corrections and exact requested week ranges", () => {
  assert.deepEqual(resolveRequestedScope("Four-week block, three days per week", selected).scope, { startWeek: 1, weekCount: 4, daysPerWeek: 3 });
  assert.deepEqual(resolveRequestedScope("A four-week program. Actually just one week, two days per week.", selected).scope, { startWeek: 1, weekCount: 1, daysPerWeek: 2 });
  assert.deepEqual(resolveRequestedScope("Only weeks 6–7, 3 days/week", selected).scope, { startWeek: 6, weekCount: 2, daysPerWeek: 3 });
});
test("history, exercise week labels and negated durations do not change the selected scope", () => {
  assert.deepEqual(resolveRequestedScope("I previously trained for four weeks. Week 1 bench. After 3 weeks add reps. Do not give me 16 weeks.", selected).scope, { startWeek: 1, weekCount: 4, daysPerWeek: 4 });
  assert.deepEqual(resolveRequestedScope("Keep the selected schedule and prescriptions", selected).scope, selected);
});
test("unsupported explicit scopes fail instead of silently reverting to four weeks", () => {
  assert.throws(() => resolveRequestedScope("Give me for 17 weeks, daily", selected), /1 and 16/);
  assert.throws(() => resolveRequestedScope("Only weeks 7–6", selected), /ordered/);
});
