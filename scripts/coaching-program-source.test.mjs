import test from "node:test";
import assert from "node:assert/strict";
import { compatibleGenerationSource } from "../lib/coach/program-source.ts";

const exercise = (name, loadOrAssistance = "bodyweight") => ({ name, loadOrAssistance });
const program = (...exercises) => ({ title: "Previously saved draft", weeks: [{ number: 1, days: [{ number: 1, exercises }] }] });

test("an explicit home inventory releases incompatible old gym names without modifying the saved recovery content", () => {
  const saved = program(exercise("Barbell Row", "30 kg barbell"), exercise("Leg Press", "bodyweight"));
  const before = JSON.stringify(saved);
  assert.equal(compatibleGenerationSource(saved, "Home workout. Equipment: two 5kg dumbbells, band and parallettes.", "", []), undefined);
  assert.equal(JSON.stringify(saved), before, "The old reviewable content remains untouched if new generation fails");
});

test("an explicit inability releases old dips rather than treating them as a mandatory preserved prescription", () => {
  const saved = program(exercise("Dips"));
  assert.equal(compatibleGenerationSource(saved, "I cannot do dips. Only use bodyweight movements this week.", "", []), undefined);
});

test("compatible exact prescriptions remain the source for an ordinary revision", () => {
  const saved = program(exercise("Push-up"), exercise("Dumbbell Goblet Squat", "5 kg dumbbell"));
  const catalog = [{ name: "Push-up", equipment: "bodyweight" }, { name: "Dumbbell Goblet Squat", equipment: "dumbbell" }];
  assert.equal(compatibleGenerationSource(saved, "Home workout. Equipment: 5kg dumbbells. Keep the same exercises.", "", catalog), saved.weeks);
  assert.equal(compatibleGenerationSource(saved, "Keep my gym program and change the last day's notes.", "", catalog), saved.weeks);
});

test("a new inventory supersedes historical client equipment while current saved limitations remain active", () => {
  const saved = program(exercise("High Bar Squat", "115 kg barbell"));
  assert.equal(compatibleGenerationSource(saved, "Home workout. Equipment: 5kg dumbbells only.", "Equipment: barbell, bench and machines.", []), undefined);
  assert.equal(compatibleGenerationSource(program(exercise("Dips")), "Use my available equipment.", "I cannot do dips.", []), undefined);
});
