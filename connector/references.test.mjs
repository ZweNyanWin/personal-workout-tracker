import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReferenceContext, loadReferenceLibrary, validateReferenceCorpus } from "./references.mjs";

const source = (id, alias) => ({ id, title: alias, kind: "pdf", aliases: [alias], summary: "Reference prescription, not completed work", sections: [
  { id: "coverage", title: "Limits", locator: "p. 1", text: "RPE/rest are not supplied; do not invent a completed result", tags: ["coverage"] },
  ...[1, 2].map((week) => ({ id: `week-${week}`, title: `Week ${week}`, locator: `p. ${week + 1}`, text: `Source week ${week}: Bench press 3x5`, tags: [`week-${week}`] })),
] });

test("retrieves the named source and requested week, keeping source gaps and provenance", () => {
  const library = [source("named-program", "Named Program"), source("other", "Other")];
  const context = buildReferenceContext(library, { query: "Named Program week 2" });
  assert.deepEqual(context.sourceIds, ["named-program"]);
  assert.match(context.text, /Source week 2/);
  assert.doesNotMatch(context.text, /Source week 1/);
  assert.match(context.text, /not this client's history/);
  assert.match(context.text, /RPE\/rest are not supplied/);
  assert.deepEqual(context.citations, ["Named Program, p. 1", "Named Program, p. 3"]);
  const missing = buildReferenceContext(library, { query: "Named Program week 6" });
  assert.doesNotMatch(missing.text, /Source week [12]/);
  assert.match(missing.text, /RPE\/rest are not supplied/);
});

test("two related sources share the context budget without cutting prescriptions", () => {
  const original = source("original", "Named Program");
  original.sections = Array.from({ length: 15 }, (_, n) => ({ id: `source-${n}`, title: "Source", locator: `p. ${n}`, tags: [], text: "Complete prescription ".repeat(80) }));
  const example = source("proposal", "Named Program"); example.kind = "coach-example";
  const context = buildReferenceContext([original, example], { query: "Named Program week 2", maxCharacters: 8000 });
  assert.ok(context.text.length <= 8000);
  assert.deepEqual(context.sourceIds.sort(), ["original", "proposal"]);
  for (const line of context.text.split("\n").filter((line) => line.startsWith('{"sourceId"'))) assert.doesNotThrow(() => JSON.parse(line));
});

test("loads only bounded private regular files and rejects malformed/duplicate corpora", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "powerbuild-reference-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "reviewed.json");
  await writeFile(file, JSON.stringify({ version: 1, sources: [source("named-program", "Named Program")] }), { mode: 0o600 });
  assert.equal((await loadReferenceLibrary([file])).length, 1);
  assert.deepEqual(await loadReferenceLibrary([join(dir, "missing.json")]), []);
  await chmod(file, 0o644);
  await assert.rejects(loadReferenceLibrary([file]), /private/);
  await chmod(file, 0o600);
  const link = join(dir, "link.json"); await symlink(file, link);
  await assert.rejects(loadReferenceLibrary([link]));
  await assert.rejects(loadReferenceLibrary([file, file]), /Duplicate/);
  assert.throws(() => validateReferenceCorpus({ version: 2, sources: [] }), /Invalid/);
  assert.throws(() => validateReferenceCorpus({ version: 1, sources: [{ ...source("ok", "Title"), kind: "system-instruction" }] }), /Invalid/);
  assert.equal((await readFile(file, "utf8")).includes("completed work"), true);
});
