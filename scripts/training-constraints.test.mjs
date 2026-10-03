import assert from "node:assert/strict";
import test from "node:test";
import { extractTrainingConstraints, filterTrainingCatalog, trainingExerciseProblems, trainingWeekProblems } from "../lib/coach/training-constraints.mjs";

const homeBrief = `## Full-Body Home Workout (Daily, 1 Week)
> **Equipment**:
> - 5kg dumbbells (x2)
> - 5kg resistance band
> - Parallettes (for push-ups or dips)

> **Goal**: Strength with bodyweight and loaded movements.
| Push-ups (on parallettes) | 3 | 15–20 reps | Progress to **dips** or **incline push-ups** if possible. |
No competition-style lifts.
Give me just one week, every day. I cannot even do dips though.`;
const exercise = (name, equipment, loadOrAssistance) => ({ name, equipment, ...(loadOrAssistance ? { loadOrAssistance } : {}) });

test("Markdown equipment inventory and latest ability correction override gym favorites without banning current push-ups", () => {
  const constraints = extractTrainingConstraints(homeBrief);
  assert.equal(constraints.environment, "home");
  assert.equal(constraints.equipmentRestricted, true);
  assert.deepEqual(constraints.availableEquipment, ["dumbbell", "bands", "parallettes"]);
  assert.deepEqual(constraints.dumbbellLoad, { value: 5, unit: "kg", count: 2 });
  assert.equal(constraints.noCompetitionLifts, true);
  const choices = [
    exercise("Barbell Rows", "barbell"), exercise("Cable Fly / Pec Deck", "cable"),
    exercise("Leg Press", "machine"), exercise("High Bar Squat", "barbell"),
    exercise("Dips", "bodyweight"), exercise("DB Incline Press", "dumbbell"),
    exercise("Dumbbell Goblet Squat", "dumbbell"), exercise("Parallette Push-up", "bodyweight"),
    exercise("Resistance Band Row", "bands"), exercise("Plank", "bodyweight"),
  ];
  assert.deepEqual(filterTrainingCatalog(choices, constraints).map((item) => item.name),
    ["Dumbbell Goblet Squat", "Parallette Push-up", "Resistance Band Row", "Plank"]);
  assert.deepEqual(trainingExerciseProblems(exercise("Push-ups", "bodyweight", "Bodyweight"), constraints), []);
});

test("home alone does not invent an equipment inventory and an explicit home barbell remains available", () => {
  assert.equal(extractTrainingConstraints("Write a home workout").equipmentRestricted, false);
  const constraints = extractTrainingConstraints("Home workout. Equipment: barbell, cable machine and adjustable workout bench");
  assert.deepEqual(trainingExerciseProblems(exercise("Bench Press", "barbell", "Barbell; load not supplied"), constraints), []);
  assert.ok(trainingExerciseProblems(exercise("Dumbbell Row", "dumbbell", "5 kg dumbbell"), constraints).length);
});

test("a fresh bodyweight or dumbbell inventory replaces saved gym inventory while saved inability restrictions remain", () => {
  const profile = "Equipment: barbell, cable machine and workout bench\nI cannot do pull-ups.";
  const noGear = extractTrainingConstraints("No equipment. Bodyweight only at home.", profile);
  assert.equal(noGear.equipmentRestricted, true);
  assert.deepEqual(noGear.availableEquipment, []);
  assert.ok(trainingExerciseProblems(exercise("Band-Assisted Pull-Up", "bodyweight"), noGear).length);
  const fresh = extractTrainingConstraints("Home workout, only two 5kg dumbbells and a resistance band.", profile);
  assert.deepEqual(fresh.availableEquipment, ["dumbbell", "bands"]);
  assert.deepEqual(fresh.dumbbellLoad, { value: 5, unit: "kg", count: 2 });
  assert.ok(trainingExerciseProblems(exercise("Pull-Up", "bodyweight"), fresh).some((issue) => /ability/.test(issue)));
});

test("changing a gym exercise's load text never makes its unavailable equipment compatible", () => {
  const constraints = extractTrainingConstraints(homeBrief);
  for (const [name, metadata, load] of [
    ["Barbell Rows", "barbell", "bodyweight on parallettes or with 5kg resistance band"],
    ["Cable Fly / Pec Deck", "cable", "5kg dumbbell"],
    ["Leg Press", "machine", "Bodyweight"], ["High Bar Squat", "barbell", "115 kg"],
    // Incorrect legacy metadata is not allowed to disguise the canonical name.
    ["Cable Row", "dumbbell", "5 kg dumbbell"],
  ]) assert.ok(trainingExerciseProblems(exercise(name, metadata, load), constraints).length, name);
  for (const load of ["one5kgdumbbell at shoulders (overheadpress with one dumbbell at chestlevel, band not used)",
    "5kg dumbbell; resistance band is not used", "Resistance band not used", "No band; use bodyweight"]) {
    assert.match(trainingExerciseProblems(exercise("Resistance Band Row", "bands", load), constraints).join(" "), /required equipment is not used/, load);
  }
});

test("known dumbbell weights are preserved and wrong or missing loads fail without a fabricated replacement", () => {
  const constraints = extractTrainingConstraints(homeBrief);
  for (const load of ["5 kg dumbbell", "Two 5kg dumbbells", "10 kg total across both dumbbells"]) {
    assert.deepEqual(trainingExerciseProblems(exercise("Dumbbell Farmer's Carry", "dumbbell", load), constraints), [], load);
  }
  for (const load of ["Dumbbells; weight not supplied", "7 kg dumbbell", "115 kg", "10 kg dumbbell each", "5 lb dumbbells", "Bodyweight"]) {
    assert.ok(trainingExerciseProblems(exercise("Dumbbell Farmer's Carry", "dumbbell", load), constraints).length, load);
  }
  const week = { days: [{ number: 1, exercises: [{ name: "Goblet Squat", loadOrAssistance: "7 kg" }] }] };
  assert.match(trainingWeekProblems(week, constraints, [exercise("Goblet Squat", "dumbbell")]).join(" "), /supplied 5 kg/);
});

test("conditional progressions do not exclude the primary exercise or authorize dips today", () => {
  const constraints = extractTrainingConstraints("Equipment: parallettes\nPush-ups. Progress to dips or incline push-ups if possible.");
  assert.ok(trainingExerciseProblems(exercise("Dips", "bodyweight"), constraints).length);
  assert.ok(trainingExerciseProblems(exercise("Incline Push-ups", "bodyweight"), constraints).length);
  assert.deepEqual(trainingExerciseProblems(exercise("Push-ups", "bodyweight", "Bodyweight"), constraints), []);
  assert.ok(!constraints.excludedExercises.includes("incline push ups"));
  assert.ok(constraints.futureProgressions.includes("incline push ups"));
});

test("unknown equipment metadata is excluded from a closed inventory while legitimate bodyweight names remain", () => {
  const constraints = extractTrainingConstraints("Home workout. No equipment.");
  assert.ok(trainingExerciseProblems(exercise("Coach's custom movement", "other"), constraints).length);
  assert.deepEqual(trainingExerciseProblems(exercise("Bodyweight Squat", null, "Bodyweight"), constraints), []);
  assert.ok(trainingExerciseProblems(exercise("Pull-up", "bodyweight"), constraints).some((issue) => /pullup-bar/.test(issue)));
});

test("the latest whole-program inventory correction replaces a pasted list, and negated equipment is unavailable", () => {
  const corrected = extractTrainingConstraints(`${homeBrief}\nActually use no equipment. Make this bodyweight only.`);
  assert.deepEqual(corrected.availableEquipment, []);
  assert.equal(corrected.dumbbellLoad, null);
  assert.deepEqual(extractTrainingConstraints("Equipment: two 5kg dumbbells, no barbell or cable machine").availableEquipment, ["dumbbell"]);
  const localRow = extractTrainingConstraints(`${homeBrief}\n| Push-ups | Bodyweight only |`);
  assert.deepEqual(localRow.availableEquipment, ["dumbbell", "bands", "parallettes"]);
});
