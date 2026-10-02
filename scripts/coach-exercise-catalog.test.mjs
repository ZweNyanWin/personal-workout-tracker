import assert from "node:assert/strict";
import test from "node:test";
import { EXERCISE_CATALOG_CHARACTER_LIMIT, EXERCISE_CATALOG_LIMIT, selectCoachExerciseCatalog } from "../lib/coach/exercise-catalog.ts";

const coach = "00000000-0000-4000-8000-000000000001";
const client = "00000000-0000-4000-8000-000000000002";
const row = (number, name, overrides = {}) => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  name, movement_type: "accessory", equipment: "cable", created_by: coach,
  is_public: true, coaching_client_id: null, organization_id: null, ...overrides,
});

test("coach-owned names take priority over duplicate defaults without changing variants", () => {
  const preferred = row(1, "Paused Bench Press", { movement_type: "push", equipment: "barbell" });
  const defaults = [row(2, "paused bench press", { created_by: null }), row(3, "Competition Bench Press", { created_by: null, equipment: "barbell" })];
  const catalog = selectCoachExerciseCatalog(coach, [preferred], defaults, "Three days of benching per week");
  assert.deepEqual(catalog.entries.map((entry) => entry.name), ["Paused Bench Press", "Competition Bench Press"]);
  assert.equal(catalog.entries[0].id, preferred.id);
  assert.equal(catalog.entries[0].category, "push");
  assert.equal(catalog.entries[0].equipment, "barbell");
  assert.equal(catalog.preferredCount, 1);
  assert.match(catalog.context, /no separate favorite flag/);
});

test("other owners, private defaults and all client snapshots are excluded even if visible to an admin", () => {
  const catalog = selectCoachExerciseCatalog(coach, [
    row(1, "Own private ordinary exercise", { is_public: false }),
    row(2, "Other coach's exercise", { created_by: client }),
    row(3, "Client's frozen prescription", { coaching_client_id: client, is_public: false }),
  ], [
    row(4, "Default exercise", { created_by: null }),
    row(5, "Another person's public exercise", { created_by: client }),
    row(6, "Private ownerless exercise", { created_by: null, is_public: false }),
    row(7, "Private snapshot", { created_by: null, coaching_client_id: client, is_public: false }),
    row(8, "Deleted coach's private source", { created_by: null, organization_id: client }),
  ]);
  assert.deepEqual(catalog.entries.map((entry) => entry.name), ["Own private ordinary exercise"]);
  for (const entry of catalog.entries) assert.deepEqual(Object.keys(entry), ["id", "name", "category", "equipment"]);
});

test("empty owned library falls back only to valid public defaults", () => {
  const catalog = selectCoachExerciseCatalog(coach, [], [row(1, "Barbell Row", { created_by: null })]);
  assert.equal(catalog.preferredCount, 0);
  assert.equal(catalog.entries.length, 1);
});

test("catalog stays under its row and serialized-character limits and preserves exact valid names", () => {
  const rows = Array.from({ length: 200 }, (_, index) => row(index + 1, `Exact exercise ${index + 1} ${"x".repeat(70)}`));
  const catalog = selectCoachExerciseCatalog(coach, rows, []);
  assert.ok(catalog.entries.length > 0 && catalog.entries.length <= EXERCISE_CATALOG_LIMIT);
  assert.ok(JSON.stringify(catalog.entries).length <= EXERCISE_CATALOG_CHARACTER_LIMIT);
  assert.ok(catalog.omittedCount > 0);
  assert.equal(catalog.entries[0].name, rows[0].name);
  const shortCatalog = selectCoachExerciseCatalog(coach, Array.from({ length: 200 }, (_, index) => row(index + 1, `E${index}`)), []);
  assert.ok(shortCatalog.entries.length <= EXERCISE_CATALOG_LIMIT);
  assert.ok(JSON.stringify(shortCatalog.entries).length <= EXERCISE_CATALOG_CHARACTER_LIMIT);
  const tinyCatalog = selectCoachExerciseCatalog(coach, Array.from({ length: 200 }, (_, index) => row(index + 1, `E${index}`, { movement_type: "", equipment: "" })), []);
  assert.equal(tinyCatalog.entries.length, EXERCISE_CATALOG_LIMIT);
});

test("malformed names and identities are omitted rather than silently rewritten", () => {
  const catalog = selectCoachExerciseCatalog(coach, [
    row(1, "Valid exact name"), row(2, " Leading whitespace"), row(3, "Line\nbreak"),
    row(4, "x".repeat(121)), row(5, ""), row(6, "Malformed ID", { id: "not-a-uuid" }),
  ], []);
  assert.deepEqual(catalog.entries.map((entry) => entry.name), ["Valid exact name"]);
  assert.equal(catalog.omittedCount, 5);
});

test("an owned library is supplemented only by basic barbell mains named in the brief", () => {
  const defaults = [
    "Competition Bench Press", "Paused Bench Press", "High-Bar Squat", "Low-Bar Squat",
    "Tempo Squat", "Conventional Deadlift", "Romanian Deadlift", "Deficit Deadlift", "Barbell Row",
  ].map((name, index) => row(index + 2, name, { created_by: null, equipment: "barbell" }));
  const owned = [row(1, "Own cable row")];
  const catalog = selectCoachExerciseCatalog(coach, owned, defaults, "Four days with bench, squat and deadlift");
  assert.deepEqual(catalog.entries.map((entry) => entry.name), ["Own cable row", "Competition Bench Press", "Low-Bar Squat", "Conventional Deadlift"]);
  assert.equal(catalog.preferredCount, 1);
  assert.deepEqual(selectCoachExerciseCatalog(coach, owned, defaults, "Train the upper back").entries.map((entry) => entry.name), ["Own cable row"]);
  assert.deepEqual(selectCoachExerciseCatalog(coach, owned, defaults, "High-bar squat work").entries.map((entry) => entry.name), ["Own cable row", "High-Bar Squat"]);
});

test("invalid owned rows do not hide usable public defaults", () => {
  const catalog = selectCoachExerciseCatalog(coach, [row(1, "Invalid\nname")], [row(2, "Leg Curl", { created_by: null })]);
  assert.equal(catalog.preferredCount, 0);
  assert.deepEqual(catalog.entries.map((entry) => entry.name), ["Leg Curl"]);
  assert.equal(catalog.omittedCount, 1);
});

test("punctuation-equivalent duplicate choices retain the owned canonical name", () => {
  const catalog = selectCoachExerciseCatalog(coach, [row(1, "High Bar Squat", { equipment: "barbell" })], [row(2, "High-Bar Squat", { created_by: null, equipment: "barbell" })], "High-bar squat work");
  assert.deepEqual(catalog.entries.map((entry) => entry.name), ["High Bar Squat"]);
});
