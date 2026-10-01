import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";

const aiDir = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: {
  model: { type: "string", default: "workout-coach" },
  output: { type: "string" },
  limit: { type: "string" },
  cases: { type: "string" },
  tokens: { type: "string", default: "1024" },
  system: { type: "string" },
  dataset: { type: "string" },
  ctx: { type: "string", default: "8192" },
  status: { type: "boolean", default: false },
  help: { type: "boolean" },
} });

if (values.help) {
  console.log("Usage: node ai/run-evals.mjs [--model workout-coach] [--dataset ai/evals/coach-expanded.jsonl] [--limit 3] [--cases max-01,health-02] [--tokens 2048] [--ctx 8192] [--system path.txt] [--status] [--output new-directory]\nDefaults to local Ollama and the model's own system instructions. Output directories must be new. --status reserves the local GPU in the browser status during this run.");
  process.exit(0);
}

const dataset = values.dataset ? resolve(values.dataset) : resolve(aiDir, "evals/coach-v1.jsonl");
const input = await readFile(dataset, "utf8");
const allCases = input.trim().split("\n").map((line) => JSON.parse(line));
const limit = values.limit === undefined ? allCases.length : Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > allCases.length) {
  throw new Error(`--limit must be between 1 and ${allCases.length}`);
}
const selectedIds = values.cases?.split(",");
if (selectedIds?.some((id) => !allCases.some((testCase) => testCase.id === id))) throw new Error("--cases contains an unknown case ID");
const cases = selectedIds ? allCases.filter((testCase) => selectedIds.includes(testCase.id)).slice(0, limit) : allCases.slice(0, limit);
const tokens = Number(values.tokens);
if (!Number.isInteger(tokens) || tokens < 128 || tokens > 4096) throw new Error("--tokens must be between 128 and 4096");
const system = values.system ? await readFile(resolve(values.system), "utf8") : null;
const ctx = Number(values.ctx);
if (!Number.isInteger(ctx) || ctx < 4096 || ctx > 16384) throw new Error("--ctx must be between 4096 and 16384");
const timestamp = new Date().toISOString().replaceAll(":", "-");
const output = values.output ? resolve(values.output) : resolve(aiDir, "evals/results", timestamp);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse to overwrite a previous run.

const endpoint = "http://127.0.0.1:11434";
const statePath = resolve(aiDir, "training/local-state.json");
let state;
async function publish(completed, busy) {
  if (!values.status) return;
  state ??= await readFile(statePath, "utf8").then(JSON.parse).catch(() => ({}));
  if (state.busy && state.pid !== process.pid) {
    try { process.kill(state.pid, 0); }
    catch (error) { if (error.code !== "ESRCH") throw error; state.busy = false; }
    if (state.busy) throw new Error("Another local model job is active");
  }
  Object.assign(state, { busy, pid: process.pid, updatedAt: new Date().toISOString(),
    stage: busy ? "Evaluating model" : "Evaluation finished",
    note: busy ? "Held-out behavior checks are running. Inference pauses to avoid competing GPU jobs." : "Answers saved for review; response completion does not establish quality.",
    evaluation: { model: values.model, completed, total: cases.length },
  });
  await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  await rename(`${statePath}.tmp`, statePath);
}
await publish(0, true);
async function ollama(path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Ollama ${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

const modelInfo = await ollama("/api/show", { model: values.model });
// Pin the entire sampler: imported models have different Ollama defaults.
// These match the original Qwen preset so backend comparisons are meaningful.
const options = { temperature: 0.2, top_k: 20, top_p: 0.8,
  repeat_penalty: 1, seed: 42, num_ctx: ctx, num_predict: tokens };
await writeFile(resolve(output, "run.json"), JSON.stringify({
  started_at: new Date().toISOString(), model: values.model,
  ollama_version: await fetch(`${endpoint}/api/version`).then((r) => r.json()),
  dataset, dataset_sha256: createHash("sha256").update(input).digest("hex"),
  system: system ?? modelInfo.system ?? "", system_source: system === null ? "model" : resolve(values.system),
  model_details: modelInfo.details, model_parameters: modelInfo.parameters,
  model_template: modelInfo.template, options, cases: cases.length,
}, null, 2));
await writeFile(resolve(output, "review.md"), `# ${values.model} baseline\n\n${cases.length} held-out cases. Review each criterion manually; generating an answer is not a pass. These outputs are evaluation material, never training data.\n`);

let failures = 0;
let truncated = 0;
const durations = [];
console.log(`Running ${cases.length} cases against ${values.model} on local Ollama.\nOutput: ${output}`);
for (const [index, testCase] of cases.entries()) {
  let record;
  try {
    const result = await ollama("/api/chat", {
      model: values.model, stream: false, options, keep_alive: "5m",
      messages: [
        ...(system === null ? [] : [{ role: "system", content: system }]),
        ...(testCase.messages ?? [{ role: "user", content: testCase.prompt }]),
      ],
    });
    const answer = result.message?.content;
    if (typeof answer !== "string" || !answer.trim()) throw new Error("Ollama returned an empty answer");
    const seconds = result.total_duration / 1e9;
    durations.push(seconds);
    if (result.done_reason === "length") truncated++;
    record = { ...testCase, answer, model: result.model, done_reason: result.done_reason,
      seconds, output_tokens: result.eval_count,
      review: { must: testCase.must.map(() => null), must_not: testCase.must_not.map(() => null), notes: "" },
    };
    console.log(`[${index + 1}/${cases.length}] ${testCase.id}: ${seconds.toFixed(1)}s${result.done_reason === "length" ? " (token limit reached; review before rerunning)" : ""}`);
  } catch (error) {
    failures++;
    record = { ...testCase, error: error.message };
    console.error(`[${index + 1}/${cases.length}] ${testCase.id}: ${error.message}`);
  }
  await appendFile(resolve(output, "responses.jsonl"), `${JSON.stringify(record)}\n`);
  const criteria = [...testCase.must.map((c) => `- [ ] Must: ${c}`), ...testCase.must_not.map((c) => `- [ ] Must not: ${c}`)].join("\n");
  await appendFile(resolve(output, "review.md"), `\n## ${testCase.id} (${testCase.category})\n\n${testCase.prompt}\n\n${criteria}\n\n### Model response\n\n${record.answer ?? `ERROR: ${record.error}`}\n`);
  await publish(index + 1, true);
}
const summary = { completed_at: new Date().toISOString(), requested: cases.length,
  responses: durations.length, errors: failures, truncated,
  average_seconds: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  grading: "not yet reviewed",
};
await writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await publish(cases.length, false);
if (failures || truncated) process.exitCode = 1;
