import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { coachModelName, installedCoachModels, localInspectionAllowed, localInspectionOriginAllowed, selectInstalledCoachModel } from "../lib/coach/local-models.ts";

test("installed versioned candidates are ordered, labelled unvalidated, and deduplicated", () => {
  const choices = installedCoachModels({ models: [
    { name: "workout-coach-v7:latest", size: 4_000_000_000 }, { name: "workout-coach-v2:latest", size: 3_000_000_000 },
    { name: "workout-coach:latest", size: 2_000_000_000 }, { name: "workout-coach-v3:latest", size: 3_000_000_000 },
    { name: "workout-coach-v7:latest", size: 999 }, { name: "another-model:latest", size: 2_000_000_000 },
  ] });
  assert.deepEqual(choices.map(entry => entry.model), ["workout-coach", "workout-coach-v2", "workout-coach-v3", "workout-coach-v7"]);
  assert.equal(choices.at(-1).size, 4_000_000_000);
  assert.ok(choices.every(entry => entry.experimental === true && entry.label.includes("unvalidated")));
  assert.match(choices.at(-1).label, /Candidate v7.*experimental/);
});

test("arbitrary model names, tags, paths, URLs, objects and excessive versions cannot select a model", () => {
  for (const name of ["llama3", "workout-coach-v7:other", "workout-coach-v0", "workout-coach-v07", "workout-coach-v10000",
    "workout-coach-mlx-control", "https://example.test/model", "../workout-coach-v7", "workout-coach-v7\n", {}, null]) {
    assert.equal(coachModelName(name), null);
    assert.equal(selectInstalledCoachModel(name, { models: [{ name, size: 1 }] }), null);
  }
  assert.equal(selectInstalledCoachModel("workout-coach-v7", { models: [{ name: "workout-coach-v6:latest" }] }), null);
  assert.equal(selectInstalledCoachModel("workout-coach-v7:latest", { models: [{ name: "workout-coach-v7:latest" }] }), "workout-coach-v7");
});

test("malformed or oversized inventory remains bounded and returns only safe metadata", () => {
  for (const tags of [null, [], {}, { models: {} }, { models: "workout-coach" }]) assert.deepEqual(installedCoachModels(tags), []);
  const choices = installedCoachModels({ models: [
    { name: "workout-coach-v2:latest", size: -1, credentials: "must never be returned" },
    ...Array.from({ length: 600 }, (_, index) => ({ name: `workout-coach-v${index + 3}:latest`, size: Infinity })),
  ] });
  assert.equal(choices.length, 64);
  assert.ok(choices.every(entry => entry.size === 0 && !Object.hasOwn(entry, "credentials")));
  assert.equal(selectInstalledCoachModel("workout-coach-v602", { models: Array.from({ length: 600 }, (_, index) => ({ name: `workout-coach-v${index + 3}:latest` })) }), null);
});

test("local inspector fails closed outside loopback development, including nonlocal authorities and mismatched ports", () => {
  for (const origin of ["http://localhost:3001", "http://127.0.0.1:3001", "http://[::1]:3001"]) {
    assert.equal(localInspectionAllowed("development", `${origin}/api/local-ollama`, new URL(origin).host), true);
    assert.equal(localInspectionAllowed("production", `${origin}/api/local-ollama`, new URL(origin).host), false);
    assert.equal(localInspectionAllowed("test", `${origin}/api/local-ollama`, new URL(origin).host), false);
  }
  for (const [url, host] of [
    ["https://powerbuild.example/api/local-ollama", "localhost:3001"],
    ["http://localhost:3001/api/local-ollama", "powerbuild.example"],
    ["http://localhost:3001/api/local-ollama", "localhost:3002"],
    ["http://localhost:3001/api/local-ollama", "localhost.evil:3001"],
    ["http://localhost:3001/api/local-ollama", "localhost:65536"],
    ["http://localhost:3001/api/local-ollama", null],
    ["ftp://localhost/api/local-ollama", "localhost"],
    ["http://user:pass@localhost:3001/api/local-ollama", "localhost:3001"],
  ]) assert.equal(localInspectionAllowed("development", url, host), false);
});

test("Next dev bind-host normalization accepts only loopback aliases on the same port", () => {
  const url = "http://localhost:3001/api/local-ollama";
  for (const host of ["127.0.0.1:3001", "[::1]:3001"]) {
    assert.equal(localInspectionAllowed("development", url, host), true);
    assert.equal(localInspectionOriginAllowed("development", url, host, `http://${host}`), true);
    assert.equal(localInspectionOriginAllowed("development", url, host, "http://localhost:3001"), false);
    assert.equal(localInspectionOriginAllowed("production", url, host, `http://${host}`), false);
  }
  assert.equal(localInspectionAllowed("development", "http://127.0.0.1:3001/api/local-ollama", "localhost:3001"), true);
  assert.equal(localInspectionAllowed("development", url, "127.0.0.1:3002"), false);
  assert.equal(localInspectionAllowed("development", "http://evil.test:3001/api/local-ollama", "127.0.0.1:3001"), false);
});

test("inference requires the exact local origin; cross-site, missing, null and other local ports fail", () => {
  const url = "http://localhost:3001/api/local-ollama";
  assert.equal(localInspectionOriginAllowed("development", url, "localhost:3001", "http://localhost:3001"), true);
  for (const origin of [null, "null", "https://example.test", "http://localhost:3002", "http://127.0.0.1:3001", "https://localhost:3001"]) {
    assert.equal(localInspectionOriginAllowed("development", url, "localhost:3001", origin), false);
  }
});

test("local API uses installed-only selection, fixed loopback endpoint, and GPU busy checks", async () => {
  const source = await readFile(new URL("../app/api/local-ollama/route.ts", import.meta.url), "utf8");
  assert.match(source, /const OLLAMA = "http:\/\/127\.0\.0\.1:11434"/);
  assert.match(source, /localInspectionAllowed\(process\.env\.NODE_ENV/);
  assert.match(source, /localInspectionOriginAllowed\(process\.env\.NODE_ENV/);
  assert.match(source, /selectInstalledCoachModel\(model, await getOllama\("\/api\/tags"\)\)/);
  assert.match(source, /JSON\.stringify\(\{ model: installedModel/);
  assert.ok((source.match(/\(await trainingState\(\)\)\.busy/g) ?? []).length >= 2);
  assert.doesNotMatch(source, /parsed\.(?:url|endpoint|provider)|references|supabase|service_role/i);
});
