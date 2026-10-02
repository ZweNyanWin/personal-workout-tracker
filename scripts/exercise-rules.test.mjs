import assert from "node:assert/strict";
import test from "node:test";
import { isMainCompound, mainCompoundProblems, mainRpeValue, expectedDoseKind, exerciseDoseProblems } from "../lib/coach/exercise-rules.mjs";

const exercise = (name, dose = { kind: "reps", range: { min: 5, max: 5 }, perSide: false }, effort = "RPE 7", loadOrAssistance = "Select barbell load for RPE 7") =>
  ({ name, sets: 3, dose, effort, loadOrAssistance, restSeconds: 180 });

test("classifies barbell main lifts without pulling accessories or calisthenics into exact-rep rules", () => {
  for (const name of ["Squat", "High-Bar Squat", "Front Squat", "Paused Back Squat", "Bench Press", "Close-Grip Bench Press", "Paused Bench", "Paused Bench — top single", "Bench - technique", "Bench top single", "Larsen Press", "Spoto Press", "Deadlift", "Sumo Deadlift", "Deficit Deadlift", "Overhead Press", "Military Press"]) {
    assert.equal(isMainCompound(name), true, name);
  }
  for (const name of ["Goblet Squat", "Bodyweight Squat", "Bulgarian Split Squat", "Dumbbell Bench Press", "Bench-supported row", "Push-ups", "Ring dips", "Romanian Deadlift", "Single-leg Deadlift", "Trap-Bar Deadlift", "Tuck front lever"]) {
    assert.equal(isMainCompound(name), false, name);
  }
});

test("dynamic accessories cannot silently become holds while calisthenics holds keep seconds", () => {
  for (const name of ["Hamstring Curl", "Cable Rear-delt Fly", "Romanian Deadlift", "Front Lever Row", "Plank Shoulder Taps"]) {
    assert.equal(expectedDoseKind(name), "reps", name);
    assert.ok(exerciseDoseProblems(exercise(name, { kind: "hold", seconds: { min: 5, max: 10 } })).length, name);
  }
  for (const name of ["Knee-supported Plank", "Tuck Front Lever", "Supported L-sit", "Isometric Cable Row Hold"]) assert.equal(expectedDoseKind(name), "hold", name);
  assert.equal(expectedDoseKind("My custom gym movement"), null);
});

test("main lifts require exact reps, exact half-step RPE, and more than bodyweight-only load", () => {
  assert.deepEqual(mainCompoundProblems(exercise("Paused Bench Press")), []);
  assert.equal(mainRpeValue("RPE 7.5 (about 2–3 RIR)"), 7.5);
  assert.equal(mainRpeValue("RPE 7–8"), null);
  assert.equal(mainRpeValue("RPE 7.25"), null);
  assert.match(mainCompoundProblems(exercise("Bench Press", { kind: "reps", range: { min: 3, max: 6 }, perSide: false })).join(" "), /exact rep/);
  assert.match(mainCompoundProblems(exercise("High-Bar Squat", { kind: "hold", seconds: { min: 10, max: 20 } })).join(" "), /rep target/);
  assert.match(mainCompoundProblems(exercise("Deadlift", undefined, "RPE 7–8")).join(" "), /numeric RPE/);
  assert.match(mainCompoundProblems(exercise("Bench Press", undefined, "RPE 7", "Bodyweight only")).join(" "), /bodyweight alone/);
});

test("accessory rep ranges, holds, and qualitative efforts remain supported", () => {
  const range = { kind: "reps", range: { min: 8, max: 12 }, perSide: true };
  const hold = { kind: "hold", seconds: { min: 10, max: 20 } };
  assert.deepEqual(mainCompoundProblems(exercise("Chest-supported row", range, "2 RIR", "Bodyweight")), []);
  assert.deepEqual(mainCompoundProblems(exercise("Ring hold", hold, "Stop before position loss", "Bodyweight")), []);
});
