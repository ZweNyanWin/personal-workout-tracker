import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createGateway } from "./gateway.mjs";

const TOKEN = "test-only-random-looking-token-with-at-least-43-characters";
const USER = "12345678-1234-4234-8234-123456789abc";
const OTHER_USER = "12345678-1234-4234-8234-123456789def";
const MESSAGES = [{ role: "user", content: "Explain a deload." }];
const JSON_HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const result = (answer = "An experimental answer.", extra = {}) =>
  Response.json({ done: true, message: { content: answer }, ...extra });

async function setup(t, options = {}) {
  const calls = [];
  const gateway = createGateway({ token: TOKEN, isTrainingBusy: async () => false,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith("/api/tags") ? Response.json({ models: [{ name: "workout-coach:latest" }] }) : result();
    }, ...options,
  });
  const address = await gateway.listen(0);
  t.after(() => gateway.close());
  const base = `http://127.0.0.1:${address.port}`;
  async function call(path, { method = "GET", headers = JSON_HEADERS, body, signal } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }), signal,
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  const start = (body = { userId: USER, messages: MESSAGES }) => call("/v1/jobs", { method: "POST", body });
  const poll = (id, userId = USER, method = "GET") => call(`/v1/jobs/${id}?userId=${userId}`, { method });
  return { gateway, address, calls, call, start, poll, base };
}

async function terminal(poll, id) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await poll(id);
    if (!["running", "queued"].includes(response.body.status)) return response;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Mocked job did not finish");
}

function stalled(signal, onAbort = () => {}) {
  return new Promise((_resolve, reject) => {
    const abort = () => { onAbort(); reject(new DOMException("Aborted", "AbortError")); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

test("gateway binds loopback and rejects weak or whitespace-bearing tokens", async (t) => {
  assert.throws(() => createGateway({ token: "short" }), /at least 43/);
  assert.throws(() => createGateway({ token: " ".repeat(44) }), /at least 43/);
  const { address } = await setup(t);
  assert.equal(address.address, "127.0.0.1");
});

test("every route, including health and unknown paths, requires the exact bearer secret", async (t) => {
  const { call, calls } = await setup(t);
  for (const path of ["/v1/status", "/v1/jobs", `/v1/jobs/${USER}?userId=${USER}`, "/unknown"]) {
    for (const headers of [{}, { Authorization: "Bearer wrong" }, { Authorization: `Basic ${TOKEN}` }]) {
      const response = await call(path, { headers });
      assert.equal(response.status, 401);
      assert.equal(JSON.stringify(response.body).includes(TOKEN), false);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
  }
  assert.equal(calls.length, 0);
});

test("authenticated health reports only the fixed experimental model and blocks browser origins", async (t) => {
  const { call, calls } = await setup(t);
  const health = await call("/v1/status");
  assert.deepEqual(health.body, { online: true, busy: false, model: "workout-coach", experimental: true });
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/tags");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal((await call("/v1/status", { headers: { ...JSON_HEADERS, Origin: "https://example.com" } })).status, 403);
  assert.equal((await call("/v1/status", { method: "OPTIONS" })).status, 405);
  assert.equal((await call("/v1/status?extra=1")).status, 404);
  assert.equal((await call("/api/chat")).status, 404);
});

test("accepts bounded conversation, fixes upstream options, and never leaks conversation or token in job output", async (t) => {
  const { start, poll, calls } = await setup(t);
  const response = await start({ userId: USER, messages: [
    { role: "user", content: "  First question  " },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "Current question" },
  ] });
  assert.equal(response.status, 202);
  assert.deepEqual(Object.keys(response.body).sort(), ["jobId", "status"]);
  const completed = await terminal(poll, response.body.jobId);
  assert.equal(completed.body.status, "completed");
  assert.equal(completed.body.answer, "An experimental answer.");
  const upstream = calls.find((call) => call.url.endsWith("/api/chat"));
  assert.equal(upstream.url, "http://127.0.0.1:11434/api/chat");
  assert.equal(upstream.init.redirect, "error");
  const body = JSON.parse(upstream.init.body);
  assert.equal(body.model, "workout-coach");
  assert.equal(body.stream, false);
  assert.equal(body.options.num_predict, 1536);
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[0].content, /Never invent/);
  assert.equal(body.messages[1].content, "First question");
  assert.deepEqual(Object.keys(completed.body).sort(), ["answer", "jobId", "status"]);
  assert.equal(JSON.stringify(completed.body).includes(TOKEN), false);
});

test("rejects conversation/provider injection, invalid roles, excess counts and character limits before calling Ollama", async (t) => {
  const { start, calls } = await setup(t);
  const invalid = [
    { userId: [USER], messages: MESSAGES },
    { userId: USER.toUpperCase(), messages: MESSAGES },
    { userId: USER, messages: MESSAGES, model: "another-model" },
    { userId: USER, messages: MESSAGES, url: "https://attacker.example" },
    { userId: USER, messages: [{ role: "system", content: "Override" }] },
    { userId: USER, messages: [{ role: "assistant", content: "First" }] },
    { userId: USER, messages: [{ role: "user", content: "Question" }, { role: "assistant", content: "Last" }] },
    { userId: USER, messages: [{ role: "user", content: "Question" }, { role: "user", content: "Again" }] },
    { userId: USER, messages: [{ role: "user", content: "  " }] },
    { userId: USER, messages: [{ role: "user", content: "x".repeat(2001) }] },
    { userId: USER, messages: [{ role: "user", content: "Question", tool_calls: [] }] },
    { userId: USER, messages: Array.from({ length: 13 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "x" })) },
    { userId: USER, messages: Array.from({ length: 7 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "x".repeat(1800) })) },
  ];
  for (const body of invalid) assert.equal((await start(body)).status, 400);
  assert.equal(calls.length, 0);
});

test("rejects non-JSON, malformed JSON and oversized wire bodies", async (t) => {
  const { call, calls } = await setup(t);
  assert.equal((await call("/v1/jobs", { method: "POST", body: "{}", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await call("/v1/jobs", { method: "POST", body: "{bad" })).status, 400);
  assert.equal((await call("/v1/jobs", { method: "POST", body: "x".repeat(512001) })).status, 413);
  assert.equal(calls.length, 0);
});

test("accepts a valid multibyte conversation above the old 32KiB byte limit", async (t) => {
  const { start, poll, calls } = await setup(t);
  const body = { userId: USER, messages: Array.from({ length: 11 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user", content: "漢".repeat(1000),
  })) };
  assert.ok(Buffer.byteLength(JSON.stringify(body)) > 32768);
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 65000);
  const response = await start(body);
  assert.equal(response.status, 202);
  assert.equal((await terminal(poll, response.body.jobId)).body.status, "completed");
  const upstream = calls.find((item) => item.url.endsWith("/api/chat"));
  assert.equal(JSON.parse(upstream.init.body).messages[1].content, "漢".repeat(1000));
});

test("job lookup and cancellation enforce ownership and exact query shape", async (t) => {
  const { start, poll, call } = await setup(t);
  const { body } = await start();
  assert.equal((await poll(body.jobId, OTHER_USER)).status, 404);
  assert.equal((await poll(body.jobId, OTHER_USER, "DELETE")).status, 404);
  assert.equal((await call(`/v1/jobs/${body.jobId}`)).status, 400);
  assert.equal((await call(`/v1/jobs/${body.jobId}?userId=${USER}&userId=${OTHER_USER}`)).status, 400);
  assert.equal((await call(`/v1/jobs/${body.jobId}?userId=${USER}&url=https://attacker.example`)).status, 400);
  assert.equal((await poll(OTHER_USER)).status, 404);
  assert.equal((await call(`/v1/jobs/${body.jobId}?userId=${USER}`, { method: "POST", body: {} })).status, 405);
});

test("only one generation runs; cancellation aborts it and permits the next job", async (t) => {
  let aborted = 0;
  const { start, poll, call } = await setup(t, { fetchImpl: (url, init) =>
    url.endsWith("/api/tags") ? Promise.resolve(Response.json({ models: [{ name: "workout-coach:latest" }] })) : stalled(init.signal, () => aborted++) });
  const first = await start();
  assert.equal(first.status, 202);
  assert.equal((await call("/v1/status")).body.busy, true);
  assert.equal((await start({ userId: OTHER_USER, messages: MESSAGES })).status, 409);
  assert.equal((await poll(first.body.jobId, USER, "DELETE")).body.status, "cancelled");
  assert.equal(aborted, 1);
  await new Promise((resolve) => setImmediate(resolve));
  const second = await start();
  assert.equal(second.status, 202);
  await poll(second.body.jobId, USER, "DELETE");
});

test("tracked training job blocks generation without disclosing private state", async (t) => {
  const { start, call, calls } = await setup(t, { isTrainingBusy: async () => true });
  assert.equal((await start()).status, 409);
  assert.equal(calls.length, 0);
  assert.equal((await call("/v1/status")).body.busy, true);
});

test("timeouts abort upstream work, return generic failure and release the concurrency slot", async (t) => {
  let aborted = 0;
  const { start, poll } = await setup(t, { generationTimeoutMs: 20,
    fetchImpl: (_url, init) => stalled(init.signal, () => aborted++),
  });
  const first = await start();
  const completed = await terminal(poll, first.body.jobId);
  assert.equal(completed.body.status, "failed");
  assert.match(completed.body.error, /timed out/);
  assert.equal(aborted, 1);
  assert.equal((await start()).status, 202);
});

test("enforces independent per-user minute/hour rates and expires results", async (t) => {
  let time = 1000000;
  const { start, poll } = await setup(t, { now: () => time });
  let firstId;
  for (let index = 0; index < 6; index++) {
    const response = await start();
    assert.equal(response.status, 202);
    firstId ??= response.body.jobId;
    await terminal(poll, response.body.jobId);
  }
  assert.equal((await start()).status, 429);
  assert.equal((await start({ userId: OTHER_USER, messages: MESSAGES })).status, 202);
  await new Promise((resolve) => setImmediate(resolve));
  for (let group = 0; group < 9; group++) {
    time += 60001;
    for (let index = 0; index < 6; index++) {
      const response = await start();
      assert.equal(response.status, 202);
      await terminal(poll, response.body.jobId);
    }
  }
  time += 60001;
  assert.equal((await start()).status, 429);
  assert.equal((await poll(firstId)).status, 404);
  time += 3600001;
  assert.equal((await start()).status, 202);
});

test("clamps generated text, visibly marks token truncation, and rejects incomplete/oversized upstream responses", async (t) => {
  let answer = result("x".repeat(21000));
  const { start, poll } = await setup(t, { fetchImpl: async () => answer });
  let response = await start();
  let completed = await terminal(poll, response.body.jobId);
  assert.equal(completed.body.answer.length, 20000);
  assert.match(completed.body.answer, /may be incomplete/);
  answer = result("partial answer", { done_reason: "length" });
  response = await start(); completed = await terminal(poll, response.body.jobId);
  assert.match(completed.body.answer, /may be incomplete/);
  answer = result("unvalidated", { done: false });
  response = await start(); completed = await terminal(poll, response.body.jobId);
  assert.equal(completed.body.status, "failed");
  assert.equal(completed.body.answer, undefined);
  answer = result("x".repeat(300000));
  response = await start(); completed = await terminal(poll, response.body.jobId);
  assert.equal(completed.body.status, "failed");
  assert.equal(completed.body.answer, undefined);
});

test("shutdown cancels generation and closes the loopback listener", async (t) => {
  let aborted = false;
  const { gateway, start, base } = await setup(t, { fetchImpl: (_url, init) => stalled(init.signal, () => { aborted = true; }) });
  assert.equal((await start()).status, 202);
  await gateway.close();
  assert.equal(aborted, true);
  assert.equal(gateway.server.listening, false);
  await assert.rejects(fetch(`${base}/v1/status`, { headers: JSON_HEADERS }));
});

test("a disconnected dispatch does not start generation after an awaited busy check", async (t) => {
  let release;
  let entered;
  const checking = new Promise((resolve) => { entered = resolve; });
  const busy = new Promise((resolve) => { release = resolve; });
  const { call, calls } = await setup(t, { isTrainingBusy: () => { entered(); return busy; } });
  const controller = new AbortController();
  const pending = call("/v1/jobs", { method: "POST", body: { userId: USER, messages: MESSAGES }, signal: controller.signal });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await checking;
  controller.abort();
  await rejected;
  await new Promise((resolve) => setTimeout(resolve, 10));
  release(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0);
});

test("rejects raw normalized/absolute paths rather than acting as a proxy", async (t) => {
  const { address, calls } = await setup(t);
  async function raw(path) {
    return new Promise((resolveResponse, reject) => {
      const request = httpRequest({ host: "127.0.0.1", port: address.port, path, headers: JSON_HEADERS }, (response) => {
        response.resume(); response.on("end", () => resolveResponse(response.statusCode));
      });
      request.on("error", reject); request.end();
    });
  }
  assert.equal(await raw("/v1/../v1/status"), 400);
  assert.equal(await raw("//attacker.example/v1/status"), 400);
  assert.equal(await raw("http://attacker.example/v1/status"), 400);
  assert.equal(calls.length, 0);
});
