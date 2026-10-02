import assert from "node:assert/strict";
import test from "node:test";
import { exerciseCatalogContext, exerciseCatalogProblems, validateExerciseCatalog } from "./exercise-catalog.mjs";

const entry = (number, name, overrides = {}) => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  name, ...overrides,
});
const week = (...names) => ({ days: [{ number: 1, exercises: names.map((name) => ({ name })) }] });

test("catalog accepts bounded canonical rows and treats an absent legacy catalog as optional", () => {
  const catalog = [entry(1, "Paused Bench Press", { category: "push", equipment: "barbell" }), entry(2, "Tuck Front Lever")];
  assert.equal(validateExerciseCatalog(catalog), catalog);
  assert.deepEqual(validateExerciseCatalog(undefined), []);
  assert.match(exerciseCatalogContext(catalog), /server-supplied data/);
  assert.match(exerciseCatalogContext(catalog), /own saved exercises first/);
  assert.equal(exerciseCatalogContext([]), "");
});

test("catalog rejects foreign fields, malformed identities, duplicate identities and ambiguous names", () => {
  for (const value of [
    [], {}, [null], [["name"]], [entry(1, "Bench Press", { clientId: "private" })],
    [entry(1, "Bench Press", { id: "------------------------------------" })],
    [entry(1, "Bench Press"), entry(1, "Squat")],
    [entry(1, "High-Bar Squat"), entry(2, "high bar squat")],
    [entry(1, " Leading space")], [entry(1, "Line\nbreak")],
    [entry(1, "x".repeat(121))], [entry(1, "Bench Press", { equipment: "x".repeat(81) })],
  ]) assert.throws(() => validateExerciseCatalog(value));
  const uppercase = entry(1, "Bench Press", { id: "00000000-0000-4000-ABCD-000000000001" });
  assert.throws(() => validateExerciseCatalog([uppercase, { ...uppercase, name: "Squat", id: uppercase.id.toLowerCase() }]));
});

test("catalog enforces both row count and total serialized size", () => {
  assert.throws(() => validateExerciseCatalog(Array.from({ length: 151 }, (_, index) => entry(index + 1, `E${index}`))));
  assert.throws(() => validateExerciseCatalog(Array.from({ length: 100 }, (_, index) => entry(index + 1, `E${index} ${"x".repeat(100)}`))));
  assert.equal(validateExerciseCatalog(Array.from({ length: 150 }, (_, index) => entry(index + 1, `E${index}`))).length, 150);
});

test("same lift can use labeled top/backdown groups while unlisted variants and source substitutions fail", () => {
  const catalog = [entry(1, "Paused Bench Press"), entry(2, "High-Bar Squat"), entry(3, "Pull-Up")];
  assert.deepEqual(exerciseCatalogProblems(week("Paused Bench Press", "Paused Bench Press — top set", "Paused Bench Press (back-off sets)", "High Bar Squat", "Pull-Up primary"), catalog), []);
  for (const name of ["Bench Press", "Close-Grip Bench Press", "Low-Bar Squat", "Paused Bench Press — technique incline", "Push-Up", "Pull-Up secondary weighted"]) {
    assert.equal(exerciseCatalogProblems(week(name), catalog).length, 1, name);
  }
  assert.deepEqual(exerciseCatalogProblems(week("Any legacy name"), []), []);
});
