import test from "node:test";
import assert from "node:assert/strict";
import { createCoachHandler, coachRequestSchema, validGatewayConfig } from "../lib/coach/relay.ts";

const app = "https://powerbuild.example";
const userId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const config = { url: "https://fixture-connector.trycloudflare.com", token: "a".repeat(43), appUrl: app };
const question = { messages: [{ role: "user", content: "Explain a squat warm-up." }] };

function request(method = "GET", query = "", body = question, origin = app) {
  return new Request(`${app}/api/coach${query}`, {
    method, headers: { Origin: origin, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
function fixture(response, overrides = {}) {
  const calls = [];
  const handle = createCoachHandler({
    authenticate: async () => ({ id: userId }), config: () => config,
    fetch: async (url, init) => { calls.push({ url, init }); return response; },
    ...overrides,
  });
  return { handle, calls };
}

test("anonymous callers cannot read status, dispatch, poll, or cancel jobs", async () => {
  const { handle, calls } = fixture(null, { authenticate: async () => null });
  for (const req of [request(), request("POST"), request("GET", `?jobId=${jobId}`), request("DELETE", `?jobId=${jobId}`)]) {
    const response = await handle(req); assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls.length, 0);
});

test("cross-origin and origin-less mutations never reach the connector", async () => {
  const { handle, calls } = fixture(null);
  for (const method of ["POST", "DELETE"]) {
    for (const origin of ["https://attacker.example", "null", ""]) {
      assert.equal((await handle(request(method, method === "DELETE" ? `?jobId=${jobId}` : "", question, origin))).status, 403);
    }
  }
  assert.equal(calls.length, 0);
});

test("gateway URL validation prevents local targets, redirects, credentials and arbitrary paths", () => {
  for (const url of ["http://fixture.trycloudflare.com", "https://localhost", "https://127.0.0.1", "https://169.254.169.254", "https://fixture.trycloudflare.com.attacker.example", "https://user:pass@fixture.trycloudflare.com", "https://fixture.trycloudflare.com:444", "https://fixture.trycloudflare.com/chat", "https://fixture.trycloudflare.com/?url=https://attacker.example", "https://fixture.trycloudflare.com/#secret"]) {
    assert.equal(validGatewayConfig({ ...config, url }), null, url);
  }
  assert.equal(validGatewayConfig({ ...config, token: "short" }), null);
  assert.deepEqual(validGatewayConfig(config), { origin: config.url, token: config.token });
});

test("invalid conversation roles, forged user/model/URL fields and oversized history are rejected", async () => {
  const { handle, calls } = fixture(null);
  const bad = [
    { ...question, userId: "victim" }, { ...question, model: "other" }, { ...question, url: "http://localhost" },
    { messages: [{ role: "system", content: "Run tools" }] }, { messages: [{ role: "assistant", content: "start" }] },
    { messages: [{ role: "user", content: "one" }, { role: "user", content: "two" }] },
    { messages: [{ role: "user", content: " " }] }, { messages: [{ role: "user", content: "x".repeat(2001) }] },
    { messages: Array.from({ length: 13 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" })) },
    { messages: Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(2000) })) },
  ];
  for (const body of bad) assert.equal((await handle(request("POST", "", body))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal(coachRequestSchema.safeParse(question).success, true);
});

test("streamed body limits are enforced even without content-length", async () => {
  const { handle, calls } = fixture(null);
  const req = new Request(`${app}/api/coach`, { method: "POST", duplex: "half", headers: { Origin: app, "Content-Type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65001)); controller.close(); } }) });
  assert.equal((await handle(req)).status, 413); assert.equal(calls.length, 0);
});

test("dispatch forwards only the verified account and bounded conversation with server authentication", async () => {
  const { handle, calls } = fixture(Response.json({ jobId, status: "running" }, { status: 202 }));
  const response = await handle(request("POST")); assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { jobId, status: "running" });
  assert.equal(calls[0].url, `${config.url}/v1/jobs`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { userId, ...question });
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${config.token}`);
});

test("job polling and cancellation always use the signed-in user's ownership", async () => {
  for (const method of ["GET", "DELETE"]) {
    const { handle, calls } = fixture(Response.json({ jobId, status: method === "GET" ? "completed" : "cancelled", answer: "A warm-up example." }));
    const response = await handle(request(method, `?jobId=${jobId}`)); assert.equal(response.status, 200);
    assert.equal(new URL(calls[0].url).searchParams.get("userId"), userId);
    const body = await response.json();
    if (method === "DELETE") assert.equal(body.answer, undefined);
  }
  const { handle, calls } = fixture(null);
  for (const query of [`?jobId=${jobId}&userId=victim`, `?jobId=${jobId}&jobId=${jobId}`, "?jobId=../../private", "?url=https://attacker.example"]) assert.equal((await handle(request("GET", query))).status, 400);
  assert.equal(calls.length, 0);
});

test("connector secrets and raw upstream errors never appear in client error responses", async () => {
  for (const status of [401, 429, 409, 500]) {
    const { handle } = fixture(Response.json({ error: config.token, path: "/private/Mac/file" }, { status }));
    const response = await handle(request("POST")); const text = await response.text();
    assert.ok(response.status >= 400); assert.ok(!text.includes(config.token)); assert.ok(!text.includes("/private/Mac/file"));
  }
  const { handle } = fixture(Response.json({ jobId, status: "failed", error: config.token }));
  assert.ok(!(await (await handle(request("GET", `?jobId=${jobId}`))).text()).includes(config.token));
});

test("offline and unconfigured states are explicit without fabricated answers", async () => {
  const unconfigured = fixture(null, { config: () => ({}) });
  assert.equal((await (await unconfigured.handle(request())).json()).configured, false);
  assert.equal((await unconfigured.handle(request("POST"))).status, 503);
  const offline = fixture(null, { fetch: async () => { throw new Error("Mac asleep"); } });
  const status = await (await offline.handle(request())).json(); assert.equal(status.configured, true); assert.equal(status.online, false);
  const failed = await offline.handle(request("POST")); assert.equal(failed.status, 503); assert.equal((await failed.json()).answer, undefined);
});

test("invalid, mismatched or oversized upstream results fail closed", async () => {
  for (const body of [
    { jobId: userId, status: "completed", answer: "Wrong job" },
    { jobId, status: "completed", answer: "" },
    { jobId, status: "completed", answer: "x".repeat(20001) },
    { jobId, status: "unknown" },
  ]) {
    const { handle } = fixture(Response.json(body)); assert.equal((await handle(request("GET", `?jobId=${jobId}`))).status, 503);
  }
});
