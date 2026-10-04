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

test("a closed floor and wall inventory never admits a comma-separated forbidden equipment list", () => {
  const constraints = extractTrainingConstraints("Home workout. I only have the floor and a stable wall: no dumbbells, bands, barbell, cables, machines, rings or pull-up bar.");
  assert.equal(constraints.equipmentRestricted, true);
  assert.deepEqual(constraints.availableEquipment, []);
  assert.equal(constraints.dumbbellLoad, null);
  const choices = [exercise("Wall Push-up", "bodyweight"), exercise("Dead Bug", "bodyweight"), exercise("Barbell Row", "barbell"),
    exercise("Leg Press", "machine"), exercise("Band Row", "bands"), exercise("Cable Fly", "cable")];
  assert.deepEqual(filterTrainingCatalog(choices, constraints).map(value => value.name), ["Wall Push-up", "Dead Bug"]);
  assert.deepEqual(extractTrainingConstraints("Equipment: floor and a stable wall").availableEquipment, []);
  assert.equal(extractTrainingConstraints("Equipment: floor and a stable wall").equipmentRestricted, true);
});

test("affirmative equipment remains available before a negated comma and conjunction list", () => {
  for (const list of ["no barbell, bands, cables or machines", "without barbell, rings and pull-up bar", "do not have barbell, bands or machines"]) {
    const constraints = extractTrainingConstraints(`Equipment: two 6kg dumbbells, ${list}`);
    assert.deepEqual(constraints.availableEquipment, ["dumbbell"], list);
    assert.deepEqual(constraints.dumbbellLoad, { value: 6, unit: "kg", count: 2 });
  }
  const none = extractTrainingConstraints("Equipment: no 2.5kg dumbbells, bands or rings");
  assert.deepEqual(none.availableEquipment, []);
  assert.equal(none.dumbbellLoad, null);
});

test("an explicit affirmative correction ends an equipment-list negation", () => {
  for (const separator of [", but I own ", ", I have ", "; I use "]) {
    const constraints = extractTrainingConstraints(`Equipment: no barbell, cables or machines${separator}two 6kg dumbbells and a resistance band`);
    assert.deepEqual(constraints.availableEquipment, ["dumbbell", "bands"], separator);
    assert.deepEqual(constraints.dumbbellLoad, { value: 6, unit: "kg", count: 2 });
  }
});

test("fresh equipment replaces saved unavailable implements without erasing named movement bans", () => {
  const saved = "Equipment: no barbell, cables or machines.\nI cannot do dips. Avoid Cable Row.";
  const constraints = extractTrainingConstraints("Home workout. Equipment: barbell, cable machine\nCoach prescribes Barbell Row.", saved);
  assert.deepEqual(constraints.availableEquipment, ["barbell", "cable", "machine"]);
  assert.ok(!constraints.excludedExercises.some(item => ["barbell", "cables", "machines"].includes(item)));
  const choices = [exercise("Barbell Row", "barbell"), exercise("Cable Fly", "cable"),
    exercise("Cable Row", "cable"), exercise("Dips", "bodyweight")];
  assert.deepEqual(filterTrainingCatalog(choices, constraints).map(item => item.name), ["Barbell Row", "Cable Fly"]);
  const availableBar = extractTrainingConstraints("Equipment: pull-up bar", "Equipment: no pull-up bar.");
  assert.deepEqual(filterTrainingCatalog([exercise("Pull-Up", "bodyweight")], availableBar).map(item => item.name), ["Pull-Up"]);
  const cannotPullUp = extractTrainingConstraints("Equipment: pull-up bar", "Equipment: no pull-up bar.\nI cannot perform pull-ups.");
  assert.match(trainingExerciseProblems(exercise("Pull-Up", "bodyweight"), cannotPullUp).join(" "), /ability|excluded/);
  for (const brief of ["Do not prescribe Barbell Row.", "No Cable Chest Fly or Leg Press.", "Exclude Pec Deck."]) {
    const names = brief.includes("Barbell") ? ["Barbell Row"] : brief.includes("Cable") ? ["Cable Chest Fly", "Leg Press"] : ["Pec Deck"];
    const bans = extractTrainingConstraints("Equipment: barbell, cable machine\n" + brief);
    for (const name of names) assert.match(trainingExerciseProblems(exercise(name, "bodyweight"), bans).join(" "), /ability|excluded/, name);
  }
  for (const brief of ["I cannot bench.", "Do not prescribe bench."]) {
    const bans = extractTrainingConstraints(brief);
    assert.match(trainingExerciseProblems(exercise("Bench Press", "barbell"), bans).join(" "), /ability|excluded/, brief);
  }
});

test("qualified floor-push-up inability keeps a prescribed wall regression eligible and dips excluded", () => {
  const constraints = extractTrainingConstraints("Home workout. Equipment: floor and wall\nI cannot perform dips or standard floor push-ups. My coach prescribes Wall Incline Push-up practice.");
  assert.ok(!constraints.excludedExercises.includes("push ups"));
  const candidates = [exercise("Wall Incline Push-up", "bodyweight"), exercise("Standard Floor Push-up", "bodyweight"),
    exercise("Push-ups", "bodyweight"), exercise("Dips", "bodyweight")];
  assert.deepEqual(filterTrainingCatalog(candidates, constraints).map(value => value.name), ["Wall Incline Push-up"]);
  for (const name of ["Standard Floor Push-up", "Regular Push-up", "Full Push-up", "Push-ups", "Dips"]) {
    assert.match(trainingExerciseProblems(exercise(name, "bodyweight"), constraints).join(" "), /ability|excluded/, name);
  }
});

test("an unqualified or explicitly wall-specific push-up ban is not loosened", () => {
  for (const brief of ["I cannot do push-ups.", "Do not prescribe push-ups.", "No push-up variations.", "I cannot do wall push-ups."]) {
    const constraints = extractTrainingConstraints(brief);
    assert.ok(trainingExerciseProblems(exercise("Wall Push-up", "bodyweight"), constraints).length, brief);
  }
  const both = extractTrainingConstraints("I cannot do standard floor push-ups or wall push-ups.");
  assert.ok(trainingExerciseProblems(exercise("Wall Push-up", "bodyweight"), both).length);
});
