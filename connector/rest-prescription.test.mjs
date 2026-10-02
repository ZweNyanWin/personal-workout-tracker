import assert from "node:assert/strict";
import test from "node:test";
import { resolveBriefRestPrescriptions } from "./rest-prescription.mjs";

const week = {
  number: 1,
  days: [
    { number: 1, exercises: [
      { name: "Paused Bench Press — top single", notes: "Top single", effort: "RPE 8", restSeconds: 300, restIsExplicit: true },
      { name: "Paused Bench Press — backdowns", notes: "Backdowns", effort: "RPE 8", restSeconds: 180, restIsExplicit: true },
      { name: "Cable Row", notes: "", effort: "RPE 8", restSeconds: 180, restIsExplicit: true },
    ] },
    { number: 2, exercises: [{ name: "Low-Bar Squat", notes: "", effort: "RPE 8", restSeconds: 180, restIsExplicit: true }] },
  ],
};
const seconds = (brief, value = week) => resolveBriefRestPrescriptions(brief, value).map((entry) => entry.restSeconds);

test("unqualified explicit rests use supplied units, while a bare Rest value uses minutes", () => {
  for (const [brief, expected] of [
    ["Rest 45 seconds", 45], ["Rest: 1.5 min", 90], ["Rest: 3", 180],
    ["Rest between sets:\n180 seconds", 180], ["3 minutes rest after each set", 180],
    ["Rest for 2 mins", 120], ["Rest 90 sec for every exercise", 90],
    ["Train bench twice and squat once per week. Rest: 3", 180],
  ]) assert.deepEqual(seconds(brief), [expected, expected, expected, expected], brief);
});

test("top and backdown rests remain independent even when the model reuses a written duration", () => {
  assert.deepEqual(seconds("Top single at RPE 8 with rest 3 min. Backdowns at RPE 8; choose their rest."), [180, undefined, undefined, undefined]);
  assert.deepEqual(seconds("Top single rest 45 seconds; backdowns rest 1.5 min."), [45, 90, undefined, undefined]);
  assert.deepEqual(seconds("Rest 2 min; top single rest 3 min"), [180, 120, 120, 120]);
  assert.deepEqual(seconds("Do not change rest; choose rest based on my effort targets."), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(seconds("Create a strength day at RPE 8"), [undefined, undefined, undefined, undefined]);
});

test("exact variations, generic named lift rests and multiline exercise headings target the matching groups", () => {
  assert.deepEqual(seconds("Paused Bench Press: rest 3 min; Low-Bar Squat: rest 5 min"), [180, 180, undefined, 300]);
  assert.deepEqual(seconds("Bench rest 3 min"), [180, 180, undefined, undefined]);
  assert.deepEqual(seconds("Rest 3 min for Cable Row"), [undefined, undefined, 180, undefined]);
  assert.deepEqual(seconds("Rest 3 min for Unknown Gym Exercise"), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(seconds("Low-Bar Squat\nSets: 4\nReps: 6\nRest between sets:\n180 seconds"), [undefined, undefined, undefined, 180]);
  assert.deepEqual(seconds("Paused Bench Press rest 3 min, Low-Bar Squat rest 5 min"), [180, 180, undefined, 300]);
});

test("day/week qualifiers limit a rest clause and equally specific conflicting targets fail", () => {
  assert.deepEqual(seconds("Day 2 rest 3 min"), [undefined, undefined, undefined, 180]);
  assert.deepEqual(seconds("Week 2 rest 3 min"), [undefined, undefined, undefined, undefined]);
  assert.throws(() => seconds("Rest 3 min; Rest 4 min"), /conflicting rest/);
  assert.throws(() => seconds("Bench rest 3 min; Bench rest 4 min"), /conflicting rest/);
  assert.throws(() => seconds("Bench rest 3 min for Squat"), /conflicting exercise/);
});

test("explicit ranges retain their endpoints and out-of-bounds or fractional-second values fail", () => {
  const entries = resolveBriefRestPrescriptions("Rest 4–6 min", week);
  assert.equal(entries[0].restSeconds, 300);
  assert.deepEqual(entries[0].restRangeSeconds, { min: 240, max: 360 });
  assert.deepEqual(resolveBriefRestPrescriptions("Top single rest 45 to 60 seconds", week)[0], {
    dayNumber: 1, exerciseIndex: 0, restSeconds: 53, restRangeSeconds: { min: 45, max: 60 },
  });
  for (const brief of ["Rest 6 to 4 min", "Rest 0.1 min", "Rest 30.5 seconds", "Rest 20 min"]) assert.throws(() => seconds(brief), /explicit rest duration/);
  assert.throws(() => seconds("x".repeat(6001)), /6,000/);
});
