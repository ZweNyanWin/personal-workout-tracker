import test from "node:test";
import assert from "node:assert/strict";
import { dayOutputSchema, generateProgram, sourceAccessoryLoadPlaceholder, writtenDayPatch } from "./program-generation.mjs";
import { extractWrittenPrescription } from "./written-prescription.mjs";

const placeholder = "External load not supplied; confirm with coach";
const names = ["Leg Press", "Leg Extension", "Tricep Pushdown", "Hamstring Curl", "Chest-Supported Row", "Cable Fly", "Lateral Raise", "Curls"];
const catalog = [...names, "Push-up", "Plank", "Bodyweight Squat", "Custom Movement"].map((name, index) => ({
  id: `91000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, equipment: "other",
}));
const scope = { startWeek: 1, weekCount: 1, daysPerWeek: 1 };
const run = brief => generateProgram({ program: { brief, scope, exerciseCatalog: catalog }, system: "Preserve supplied coach data.",
  signal: new AbortController().signal, chat: async () => { assert.fail("These known source fields need no model output"); } });

test("recognized source accessories use a neutral missing-load marker without choosing equipment or magnitude", () => {
  for (const name of names) {
    assert.equal(sourceAccessoryLoadPlaceholder({ name, loadOrAssistance: null }), placeholder);
    for (const load of ["Bodyweight", "7 kg", "+13 lb", "medium cable resistance"]) {
      assert.equal(sourceAccessoryLoadPlaceholder({ name, loadOrAssistance: load }), null);
    }
  }
  for (const name of ["Push-up", "Plank", "Bodyweight Squat", "Air Squat", "Custom Movement", "Unrecognized Cable Movement"]) {
    assert.equal(sourceAccessoryLoadPlaceholder({ name, loadOrAssistance: null }), null);
  }
});

test("missing source loads are restored locally and cannot be emitted as bodyweight by an omission patch", () => {
  const brief = "Day 1 — Source\n" + names.map((name, index) => `${index + 1}. ${name}: 2x8 RPE 7 rest 2 min`).join("\n");
  const contract = extractWrittenPrescription(brief, scope, catalog);
  assert.equal(contract.topologyComplete, true);
  const day = contract.days[0];
  const schema = dayOutputSchema(1, day, undefined, undefined, day);
  for (const group of Object.values(schema.properties.day.properties.exercises.properties)) {
    assert.deepEqual(group.properties.loadOrAssistance, { const: placeholder });
  }
  const patch = writtenDayPatch(schema);
  assert.equal(patch.empty, true);
  const restored = patch.restore({ groups: {} }, day);
  assert.deepEqual(Object.values(restored.day.exercises).map(item => item.loadOrAssistance), names.map(() => placeholder));
  assert.throws(() => patch.restore({ groups: { group1: { loadOrAssistance: "Bodyweight" } } }, day), /unexpected source-edit fields/);
});

test("complete source imports preserve exact accessory loads including explicit bodyweight without model calls", async () => {
  const brief = "Day 1 — Source\n1. Leg Press: 2x8 @ bodyweight RPE 7 rest 2 min\n2. Cable Fly: 2x8 @ 7 kg RPE 7 rest 2 min\n3. Curls: 2x8 @ 13 lb RPE 7 rest 2 min";
  const draft = await run(brief);
  assert.deepEqual(draft.weeks[0].days[0].exercises.map(item => item.loadOrAssistance), ["Bodyweight", "7 kg", "13 lb"]);
  assert.ok(!JSON.stringify(draft).includes(placeholder));
});

test("a source with omitted accessory loads formats locally while keeping every dose and source cue", async () => {
  const brief = "Day 1 — Source\n" + names.map((name, index) => `${index + 1}. ${name}: 2x8 RPE 7 rest 2 min`).join("\n");
  const draft = await run(brief);
  assert.deepEqual(draft.weeks[0].days[0].exercises.map(item => item.name), names);
  for (const item of draft.weeks[0].days[0].exercises) {
    assert.equal(item.loadOrAssistance, placeholder);
    assert.equal(item.sets, 2);
    assert.deepEqual(item.dose, { kind: "reps", range: { min: 8, max: 8 }, perSide: false });
    assert.equal(item.effort, "RPE 7");
    assert.equal(item.restSeconds, 120);
    assert.ok(item.notes.includes(`${item.name}: 2x8 RPE 7 rest 2 min`));
  }
});

test("ordinary bodyweight source movements remain bodyweight and generated names never receive the source-only marker", async () => {
  const draft = await run("Day 1 — Home\n1. Push-up: 2x8 @ bodyweight RPE 7 rest 2 min\n2. Plank: 2x20 sec @ bodyweight easy rest 2 min\n3. Bodyweight Squat: 2x8 @ bodyweight RPE 7 rest 2 min");
  assert.deepEqual(draft.weeks[0].days[0].exercises.map(item => item.loadOrAssistance), ["Bodyweight", "Bodyweight", "Bodyweight"]);
  for (const name of ["Leg Press", "Custom Movement"]) {
    const fresh = dayOutputSchema(1, { number: 1, title: "New", exercises: [{ name }] });
    assert.equal(fresh.properties.day.properties.exercises.properties.group1.properties.loadOrAssistance.const, undefined);
  }
});
