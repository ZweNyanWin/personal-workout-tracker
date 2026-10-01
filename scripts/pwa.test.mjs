import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://powerbuild.example";

function worker({ offline = false } = {}) {
  const handlers = new Map();
  const stores = new Map();
  const deleted = [];
  const fetched = [];
  const key = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  function store(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const assets = stores.get(name);
    return {
      addAll: async (paths) => paths.forEach((path) => assets.set(key(path), new Response("public asset"))),
      match: async (request) => assets.get(key(request))?.clone(),
      put: async (request, response) => assets.set(key(request), response),
    };
  }
  vm.runInNewContext(source, {
    self: { location: { origin }, addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: {
      open: async (name) => store(name), keys: async () => [...stores.keys()],
      delete: async (name) => { deleted.push(name); return stores.delete(name); },
      match: async (request) => {
        for (const name of stores.keys()) { const match = await store(name).match(request); if (match) return match; }
      },
    },
    fetch: async (request) => {
      fetched.push(request.url);
      if (offline) throw new TypeError("Network unavailable");
      const response = new Response("network response");
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    },
    URL, Response,
  });
  async function dispatch(type, request) {
    const pending = [];
    let response;
    handlers.get(type)({ request, waitUntil: (promise) => pending.push(promise), respondWith: (promise) => { response = promise; } });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { dispatch, stores, deleted, fetched, store };
}

test("precache contains a public reconnect screen and no authenticated page", async () => {
  const w = worker();
  await w.dispatch("install");
  const paths = [...w.stores.values()].flatMap((store) => [...store.keys()]);
  assert(paths.includes(`${origin}/offline.html`));
  assert(!paths.some((path) => /dashboard|login|workout|api\//.test(path)));
});

test("offline navigation returns the reconnect screen without caching private HTML", async () => {
  const w = worker({ offline: true });
  await w.dispatch("install");
  const response = await w.dispatch("fetch", { url: `${origin}/dashboard`, method: "GET", mode: "navigate" });
  assert.equal(await response.text(), "public asset");
  assert(![...w.stores.values()].some((store) => store.has(`${origin}/dashboard`)));
});

test("online authenticated navigation always fetches and never enters the cache", async () => {
  const w = worker();
  await w.dispatch("install");
  const response = await w.dispatch("fetch", { url: `${origin}/dashboard`, method: "GET", mode: "navigate" });
  assert.equal(await response.text(), "network response");
  assert.deepEqual(w.fetched, [`${origin}/dashboard`]);
  assert(![...w.stores.values()].some((store) => store.has(`${origin}/dashboard`)));
});

test("API, React server payloads, mutations, and other origins are not intercepted", async () => {
  const w = worker();
  const requests = [
    { url: `${origin}/api/qr-login/poll`, method: "GET", mode: "cors" },
    { url: `${origin}/api/local-ollama`, method: "POST", mode: "cors" },
    { url: `${origin}/dashboard?_rsc=private`, method: "GET", mode: "cors" },
    { url: "https://project.supabase.co/rest/v1/workout_logs", method: "GET", mode: "cors" },
  ];
  for (const request of requests) assert.equal(await w.dispatch("fetch", request), undefined);
  assert.equal(w.fetched.length, 0);
  assert.equal(w.stores.size, 0);
});

test("successful immutable bundles are cached; unrelated cache namespaces survive activation", async () => {
  const w = worker();
  w.store("powerbuild-v4"); w.store("another-app-v1");
  await w.dispatch("install");
  await w.dispatch("activate");
  assert.deepEqual(w.deleted, ["powerbuild-v4"]);
  const request = { url: `${origin}/_next/static/chunks/example.js`, method: "GET", mode: "cors" };
  await w.dispatch("fetch", request);
  await w.dispatch("fetch", request);
  assert.equal(w.fetched.length, 1);
  assert(w.stores.has("another-app-v1"));
});
