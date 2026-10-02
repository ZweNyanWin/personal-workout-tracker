import assert from "node:assert/strict";
import test from "node:test";
import { extractBriefConstraints, briefConstraintProblems, sourcePreservationProblems, sourceTopologyProblems } from "./brief-constraints.mjs";
import { effortProblems } from "../lib/coach/effort-validation.mjs";

const brief = "four week block of four days per week with 3 days of benching per week , 3rd day is only RPE 5 to 6 where the client has to do after the main squat session , 3 set must be max as only to practice the technique , may be 3 set of 3 to 6 depending on the week like if he is too fatigued from the primary and secondary bench days , may be only 3 rep of rpe 5 will be fine for him , give me in bullmastiff style with exact RPEs and rest time";

const reps = (min, max = min) => ({ kind: "reps", range: { min, max }, perSide: false });
const exercise = (name, sets, dose, effort) => ({ name, sets, dose, effort });

function validWeek() {
  return { number: 1, days: [
    { number: 1, exercises: [exercise("Bench Press", 3, reps(5), "RPE 8"), exercise("Bench-supported row", 3, reps(8), "RPE 7")] },
    { number: 2, exercises: [exercise("Paused Bench Press", 3, reps(4), "RPE 7")] },
    { number: 3, exercises: [exercise("Deadlift", 3, reps(3), "RPE 7"), exercise("Push-ups", 2, reps(8), "RPE 7")] },
    { number: 4, exercises: [exercise("High-Bar Squat", 3, reps(5), "RPE 8"), exercise("Close-Grip Bench Press", 3, reps(3, 6), "RPE 5–6 (5–4 RIR)")] },
  ] };
}

test("extracts the additional technique bench exposure without fixing it to a workout day", () => {
  assert.deepEqual(extractBriefConstraints(brief), {
    benchDaysPerWeek: 3,
    namedStyle: "Bullmastiff",
    techniqueBench: { exposureOrdinal: 3, afterSquat: true, maxSets: 3, reps: { min: 3, max: 6 }, rpe: { min: 5, max: 6 } },
  });
  assert.deepEqual(briefConstraintProblems(validWeek(), extractBriefConstraints(brief)), []);

  const squatFirst = validWeek();
  squatFirst.days[0].exercises = [
    exercise("Main Back Squat", 3, reps(5), "RPE 8"),
    exercise("Technique Bench Press", 3, reps(3, 6), "RPE 5–6"),
  ];
  squatFirst.days[1].exercises = [exercise("Paused Bench Press", 3, reps(5), "RPE 8")];
  squatFirst.days[3].exercises = [exercise("Close-Grip Bench Press", 3, reps(5), "RPE 7")];
  assert.deepEqual(briefConstraintProblems(squatFirst, extractBriefConstraints(brief)), []);
});

test("rejects push-up substitution and requires squat before the technique bench", () => {
  const constraints = extractBriefConstraints(brief);
  const substituted = validWeek();
  substituted.days[3].exercises[1].name = "Push-ups";
  assert.match(briefConstraintProblems(substituted, constraints).join(" "), /3 distinct days/);

  const wrongOrder = validWeek();
  wrongOrder.days[3].exercises.reverse();
  assert.match(briefConstraintProblems(wrongOrder, constraints).join(" "), /squat before/);

  const falseMain = validWeek();
  falseMain.days[3].exercises = [
    exercise("Bodyweight Squat", 2, reps(10), "RPE 5"),
    exercise("Close-Grip Bench Press", 3, reps(3, 6), "RPE 5–6"),
    exercise("Main High-Bar Squat", 3, reps(5), "RPE 8"),
  ];
  assert.match(briefConstraintProblems(falseMain, constraints).join(" "), /main squat before/);

  const developmental = validWeek();
  developmental.days[3].exercises[0].name = "Paused Front Squat";
  assert.match(briefConstraintProblems(developmental, constraints).join(" "), /main squat before/);
  developmental.days[3].exercises[0].name = "Main Paused Front Squat";
  assert.deepEqual(briefConstraintProblems(developmental, constraints), []);

  const disguisedWarmup = validWeek();
  disguisedWarmup.days[3].exercises[0].name = "Main Squat";
  disguisedWarmup.days[3].exercises[0].sets = 1;
  disguisedWarmup.days[3].exercises[0].loadOrAssistance = "Bodyweight warm-up only";
  assert.match(briefConstraintProblems(disguisedWarmup, constraints).join(" "), /main squat before/);
  delete disguisedWarmup.days[3].exercises[0].loadOrAssistance;
  assert.deepEqual(briefConstraintProblems(disguisedWarmup, constraints), []); // Outline names do not contain a load yet.
});

test("caps total technique-bench sets and keeps every group's reps and RPE in range", () => {
  const constraints = extractBriefConstraints(brief);
  const tooManySets = validWeek();
  tooManySets.days[3].exercises.push(exercise("Tempo Bench Press", 1, reps(3), "RPE 5"));
  assert.match(briefConstraintProblems(tooManySets, constraints).join(" "), /at most 3 sets/);

  const wrongDose = validWeek();
  wrongDose.days[3].exercises[1].dose = reps(2, 8);
  wrongDose.days[3].exercises[1].effort = "RPE 5–6, then RPE 7";
  const issues = briefConstraintProblems(wrongDose, constraints).join(" ");
  assert.match(issues, /3–6/);
  assert.match(issues, /RPE 5–6/);
});

test("does not invent constraints from vague or conflicting briefs", () => {
  assert.deepEqual(extractBriefConstraints("Four workout days, include some benching and technique work"), {});
  assert.deepEqual(extractBriefConstraints("3 bench days per week, maybe 2 bench days per week"), {});
  assert.deepEqual(extractBriefConstraints("3 bench days per week"), { benchDaysPerWeek: 3 });
  assert.deepEqual(briefConstraintProblems(validWeek(), {}), []);
});

test("normalizes descending numeric RIR ranges while retaining contradiction checks", () => {
  assert.deepEqual(effortProblems("RPE 5–6 (5–4 RIR)"), []);
  assert.deepEqual(effortProblems("RPE 6–7 (4–3 RIR)"), []);
  assert.deepEqual(effortProblems("RPE 8 (2 RIR)"), []);
  assert.match(effortProblems("RPE 8 (3 RIR)").join(" "), /contradict/);
  assert.match(effortProblems("RPE 5–6 (4–3 RIR)").join(" "), /contradict/);
  assert.match(effortProblems("RPE 11–8 (2–0 RIR)").join(" "), /between 5 and 10/);
});

function sourceWeek() {
  return { number: 1, days: [
    { number: 1, exercises: [
      { ...exercise("Paused Bench Press", 3, reps(5), "RPE 7"), loadOrAssistance: "100 lb", restSeconds: 180, notes: "Pause on chest" },
      { ...exercise("High-Bar Squat", 3, reps(5), "RPE 7"), loadOrAssistance: "80 kg", restSeconds: 240 },
    ] },
  ] };
}

test("an explicit keep-unchanged instruction preserves every source group and dose but ignores metadata", () => {
  const source = sourceWeek();
  const same = structuredClone(source);
  same.days[0].exercises[0].notes = "Rewritten cue";
  same.days[0].exercises[0].restIsExplicit = true;
  same.days[0].exercises[0].restRangeMinutes = { min: 4, max: 6 };
  assert.deepEqual(sourcePreservationProblems(same, source, "Keep this day's prescriptions unchanged"), []);

  const changed = structuredClone(source);
  const item = changed.days[0].exercises[0];
  item.sets = 4;
  item.dose.range.min = 6;
  item.loadOrAssistance = "90 lb";
  item.effort = "RPE 8";
  item.restSeconds = 120;
  const issues = sourcePreservationProblems(changed, source, "Preserve the exact source prescription").join(" ");
  for (const field of ["sets", "dose", "loadOrAssistance", "effort", "restSeconds"]) assert.match(issues, new RegExp(field));

  const reordered = structuredClone(source);
  reordered.days[0].exercises.reverse();
  assert.match(sourcePreservationProblems(reordered, source, "Keep all prescriptions unchanged").join(" "), /group 1 changed/);
  assert.match(sourcePreservationProblems(changed, source, "Preserve exact source prescriptions; do not change anything").join(" "), /changed sets/);
});

test("narrow edits preserve variants and rest and refuse an unrequested kg/lb flip", () => {
  const source = sourceWeek();
  const changed = structuredClone(source);
  changed.days[0].exercises[0].sets = 4;
  assert.deepEqual(sourcePreservationProblems(changed, source, "Adjust bench sets only"), []);

  changed.days[0].exercises[0].name = "Push-ups";
  changed.days[0].exercises[0].restSeconds = 300;
  changed.days[0].exercises[0].loadOrAssistance = "45 kg";
  const issues = sourcePreservationProblems(changed, source, "Adjust bench sets only").join(" ");
  assert.match(issues, /missing source exercise variation/);
  assert.match(issues, /load units from lb to kg/);

  const sameVariant = structuredClone(source);
  sameVariant.days[0].exercises[0].restSeconds = 300;
  assert.match(sourcePreservationProblems(sameVariant, source, "Adjust bench sets only").join(" "), /changed.*rest/);
  assert.deepEqual(sourcePreservationProblems(sameVariant, source, "Set bench rest to 5 min"), []);

  const wrongTarget = structuredClone(source);
  wrongTarget.days[0].exercises[1].sets = 4;
  assert.match(sourcePreservationProblems(wrongTarget, source, "Adjust bench sets only").join(" "), /changed sets/);

  const converted = structuredClone(source);
  converted.days[0].exercises[0].loadOrAssistance = "45 kg";
  assert.deepEqual(sourcePreservationProblems(converted, source, "Convert all loads from lb to kg"), []);
  assert.match(sourcePreservationProblems(converted, source, "Do not convert lb to kg").join(" "), /load units from lb to kg/);
  assert.match(sourcePreservationProblems(sameVariant, source, "Do not change rest to 5 min").join(" "), /changed.*rest/);
  assert.deepEqual(sourcePreservationProblems(changed, null, "Keep unchanged"), []);
});

test("a rest-only edit preserves sets, reps, load amount and effort on every source group", () => {
  const source = sourceWeek();
  const draft = structuredClone(source);
  const bench = draft.days[0].exercises[0];
  bench.sets = 5;
  bench.dose = reps(10);
  bench.loadOrAssistance = "60 lb";
  bench.effort = "RPE 9";
  bench.restSeconds = 300;
  const issues = sourcePreservationProblems(draft, source, "Change bench rest to 5 minutes; keep other training as planned").join(" ");
  for (const field of ["sets", "dose", "loadOrAssistance", "effort"]) assert.match(issues, new RegExp(field));
  assert.doesNotMatch(issues, /changed.*rest/);

  bench.sets = 3;
  bench.dose = reps(5);
  bench.loadOrAssistance = "Heavy";
  bench.effort = "RPE 7";
  assert.match(sourcePreservationProblems(draft, source, "Change bench rest to 5 minutes").join(" "), /loadOrAssistance/);
});

test("outline checks source names and order before they are locked into day schemas", () => {
  const source = sourceWeek();
  const same = structuredClone(source);
  assert.deepEqual(sourceTopologyProblems(same, source, "Keep this day as planned"), []);

  const missing = structuredClone(source);
  missing.days[0].exercises.shift();
  assert.match(sourceTopologyProblems(missing, source, "Adjust rest only").join(" "), /missing source exercise variation/);

  const reordered = structuredClone(source);
  reordered.days[0].exercises.reverse();
  assert.match(sourceTopologyProblems(reordered, source, "Adjust rest only").join(" "), /order/);

  const extra = structuredClone(source);
  extra.days[0].exercises.push({ name: "Technique Bench Press" });
  assert.deepEqual(sourceTopologyProblems(extra, source, "Add Technique Bench Press"), []);
  assert.match(sourceTopologyProblems(extra, source, "Adjust rest only").join(" "), /precise coach edit/);
});

test("replacement and addition targets preserve the exact named exercise variant", () => {
  const source = { number: 1, days: [{ number: 1, exercises: [
    { ...exercise("Curl", 3, reps(10), "RPE 7"), loadOrAssistance: "20 kg", restSeconds: 90 },
  ] }] };
  const replacement = structuredClone(source);
  replacement.days[0].exercises[0].name = "Barbell Row";
  assert.match(sourceTopologyProblems(replacement, source, "Replace Curl with Cable Row").join(" "), /precise coach edit/);
  replacement.days[0].exercises[0].name = "Cable Row";
  assert.deepEqual(sourceTopologyProblems(replacement, source, "Replace Curl with Cable Row for 3 x 12"), []);
  replacement.days[0].exercises[0].name = "Row";
  assert.match(sourceTopologyProblems(replacement, source, "Replace Curl with Cable Row").join(" "), /precise coach edit/);

  const added = structuredClone(source);
  added.days[0].exercises.push({ name: "Leg Press" });
  assert.match(sourceTopologyProblems(added, source, "Add Leg Curl").join(" "), /precise coach edit/);
  added.days[0].exercises[1].name = "Leg Curl";
  assert.deepEqual(sourceTopologyProblems(added, source, "Add Leg Curl at RPE 8"), []);
  added.days[0].exercises[1].name = "Bench Press";
  assert.match(sourceTopologyProblems(added, source, "Add Bench Press with wide grip").join(" "), /precise coach edit/);
});

test("requested numeric source edits must match their new values, not merely change the field", () => {
  const source = sourceWeek();
  const draft = structuredClone(source);
  const bench = draft.days[0].exercises[0];
  for (const [brief, field, wrong, correct] of [
    ["Change bench rest to 5 min", "restSeconds", 120, 300],
    ["Change bench sets to 4", "sets", 9, 4],
    ["Set bench RPE to 7.5", "effort", "RPE 8", "RPE 7.5"],
    ["Set bench load to 110 lb", "loadOrAssistance", "110 kg", "110 lb"],
  ]) {
    bench[field] = wrong;
    assert.match(sourcePreservationProblems(draft, source, brief).join(" "), /explicit numerical target/);
    bench[field] = correct;
    assert.deepEqual(sourcePreservationProblems(draft, source, brief), []);
    bench[field] = source.days[0].exercises[0][field];
    assert.match(sourcePreservationProblems(draft, source, brief).join(" "), /explicit numerical target/);
  }
  bench.dose = reps(8);
  assert.match(sourcePreservationProblems(draft, source, "Change bench reps to 6").join(" "), /explicit numerical target/);
  bench.dose = reps(6);
  assert.deepEqual(sourcePreservationProblems(draft, source, "Change bench reps to 6"), []);
  bench.dose = reps(5);
  bench.sets = 4;
  assert.deepEqual(sourcePreservationProblems(draft, source, "Set bench to 4x5"), []);
  bench.sets = 3;
  assert.match(sourcePreservationProblems(draft, source, "Set bench to 4x5").join(" "), /explicit numerical target/);
});

test("numeric target checks handle seconds and conversions without treating deltas or ranges as exact targets", () => {
  const source = sourceWeek();
  const draft = structuredClone(source);
  const bench = draft.days[0].exercises[0];
  bench.restSeconds = 90;
  assert.deepEqual(sourcePreservationProblems(draft, source, "Change bench rest to 90 seconds"), []);
  bench.restSeconds = 300;
  assert.deepEqual(sourcePreservationProblems(draft, source, "Change bench rest to 4–6 min"), []);
  assert.deepEqual(sourcePreservationProblems(draft, source, "Increase bench rest by 2 min"), []);
  bench.restSeconds = 180;
  bench.loadOrAssistance = "90 kg";
  assert.match(sourcePreservationProblems(draft, source, "Convert bench load from lb to kg").join(" "), /explicit numerical target/);
  bench.loadOrAssistance = "45 kg";
  assert.deepEqual(sourcePreservationProblems(draft, source, "Convert bench load from lb to kg"), []);
  bench.loadOrAssistance = "65% 1RM";
  assert.match(sourcePreservationProblems(draft, source, "Change bench load to 70% 1RM").join(" "), /explicit numerical target/);
  bench.loadOrAssistance = "70% 1RM";
  assert.deepEqual(sourcePreservationProblems(draft, source, "Change bench load to 70% 1RM"), []);
});

test("a targeted exercise swap cannot drop unrelated source groups", () => {
  const source = { number: 1, days: [{ number: 1, exercises: [
    { ...exercise("Bench Press", 3, reps(5), "RPE 8"), loadOrAssistance: "100 kg", restSeconds: 180 },
    { ...exercise("Barbell Row", 3, reps(8), "RPE 7"), loadOrAssistance: "60 kg", restSeconds: 120 },
    { ...exercise("Curl", 3, reps(10), "RPE 7"), loadOrAssistance: "20 kg", restSeconds: 90 },
  ] }] };
  const replacement = structuredClone(source);
  replacement.days[0].exercises[2].name = "Cable Row";
  assert.deepEqual(sourceTopologyProblems(replacement, source, "Replace Curl with Cable Row"), []);
  assert.deepEqual(sourcePreservationProblems(replacement, source, "Replace Curl with Cable Row"), []);

  const dropped = structuredClone(replacement);
  dropped.days[0].exercises = [dropped.days[0].exercises[2]];
  assert.match(sourceTopologyProblems(dropped, source, "Replace Curl with Cable Row").join(" "), /missing source exercise variation/);
  assert.match(sourceTopologyProblems(dropped, source, "Replace the accessory exercise with a row").join(" "), /precise coach edit/);

  const removedFirst = structuredClone(source);
  removedFirst.days[0].exercises.shift();
  assert.deepEqual(sourcePreservationProblems(removedFirst, source, "Remove Bench Press"), []);
});
