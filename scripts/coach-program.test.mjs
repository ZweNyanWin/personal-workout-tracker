import test from "node:test";
import assert from "node:assert/strict";
import { createExampleBlock, validateProgramDraft } from "../lib/coach/program.ts";

test("every supported schedule has a prescription for each week and training day", () => {
  for (const equipment of ["gym", "bodyweight"]) {
    for (const weeks of [4, 8, 16]) {
      for (const days of [2, 3, 4]) {
        const draft = createExampleBlock(weeks, days, equipment);
        assert.deepEqual(draft.weeks.map((week) => week.number), Array.from({ length: weeks }, (_, i) => i + 1));
        for (const week of draft.weeks) {
          assert.deepEqual(week.days.map((day) => day.number), Array.from({ length: days }, (_, i) => i + 1));
          for (const day of week.days) {
            assert.ok(day.warmup);
            assert.ok(day.exercises.every((exercise) => exercise.sets > 0 && exercise.effort && exercise.loadOrAssistance && exercise.restSeconds > 0));
          }
        }
      }
    }
  }
});

test("partial, duplicate, extra and out-of-scope weeks or days cannot pass validation", () => {
  const request = { startWeek: 1, weekCount: 4, daysPerWeek: 4 };
  const base = createExampleBlock(4, 4, "gym");
  const edits = [
    (draft) => draft.weeks.pop(),
    (draft) => { draft.weeks[3].number = 3; },
    (draft) => draft.weeks.push(structuredClone(draft.weeks[0])),
    (draft) => { draft.weeks[3].number = 5; },
    (draft) => draft.weeks[1].days.pop(),
    (draft) => { draft.weeks[1].days[3].number = 1; },
    (draft) => { draft.weeks[1].days[3].number = 5; },
  ];
  for (const edit of edits) {
    const draft = structuredClone(base); edit(draft);
    assert.throws(() => validateProgramDraft(draft, request));
  }
});

test("requested week ranges are preserved instead of silently starting at week one", () => {
  const draft = createExampleBlock(4, 2, "gym");
  draft.weeks.forEach((week) => { week.number += 4; });
  assert.equal(validateProgramDraft(draft, { startWeek: 5, weekCount: 4, daysPerWeek: 2 }).weeks[0].number, 5);
  assert.throws(() => validateProgramDraft(draft, { startWeek: 1, weekCount: 4, daysPerWeek: 2 }));
});

test("holds, repetitions and working sets must be explicit and consistent", () => {
  const request = { startWeek: 1, weekCount: 4, daysPerWeek: 2 };
  const base = createExampleBlock(4, 2, "bodyweight");
  assert.ok(base.weeks[0].days[0].exercises.some((exercise) => exercise.dose.kind === "hold"));
  for (const edit of [
    (exercise) => { exercise.dose = { kind: "hold", range: { min: 10, max: 20 } }; },
    (exercise) => { exercise.dose = { kind: "reps", range: { min: 10, max: 5 }, perSide: false }; },
    (exercise) => { exercise.sets = 0; },
    (exercise) => { exercise.restSeconds = 0; },
    (exercise) => { exercise.loadOrAssistance = "   "; },
    (exercise) => { delete exercise.effort; },
  ]) {
    const draft = structuredClone(base); edit(draft.weeks[0].days[0].exercises[0]);
    assert.throws(() => validateProgramDraft(draft, request));
  }
});

test("the example never manufactures personal loads or completed achievements", () => {
  const draft = createExampleBlock(16, 4, "gym");
  assert.equal(draft.status, "proposed");
  assert.ok(!JSON.stringify(draft).includes("130 kg"));
  assert.ok(draft.weeks[3].days.every((day) => day.exercises.every((exercise) => exercise.sets === 2)));
  assert.match(draft.progression, /Calendar weeks alone do not authorize/);
});
