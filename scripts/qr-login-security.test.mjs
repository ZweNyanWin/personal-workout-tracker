import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginQrRequest, qrSourceHash } from "../lib/qr-login-security.ts";

const origin = "https://powerbuild.example";
const environment = {
  NODE_ENV: "production", VERCEL: "1", SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key",
};
const request = (headers = {}) => new Request(`${origin}/api/qr-login/start`, {
  method: "POST", headers,
});

test("QR creation accepts the app's browser origin and rejects cross-site or missing origin", () => {
  assert.equal(isSameOriginQrRequest(request({ origin, "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOriginQrRequest(request({ origin })), true);
  for (const headers of [
    {}, { origin: "https://evil.example" }, { origin: "http://powerbuild.example" },
    { origin: "null" }, { origin: `${origin}/some-path` },
    { origin: `${origin}?test=1` }, { origin: "https://user@powerbuild.example" },
    { origin, "sec-fetch-site": "cross-site" }, { origin, "sec-fetch-site": "same-site" },
  ]) assert.equal(isSameOriginQrRequest(request(headers)), false);
});

test("production source trusts only the Vercel IP header and never forwarded fallbacks", () => {
  const hash = qrSourceHash(request({ "x-vercel-forwarded-for": "203.0.113.7" }), environment);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(qrSourceHash(request({
    "x-vercel-forwarded-for": "203.0.113.7",
    "x-forwarded-for": "198.51.100.99", "x-real-ip": "198.51.100.99",
  }), environment), hash);
  assert.notEqual(qrSourceHash(request({ "x-vercel-forwarded-for": "203.0.113.8" }), environment), hash);
  for (const headers of [
    {}, { "x-forwarded-for": "203.0.113.7" }, { "x-real-ip": "203.0.113.7" },
    { "x-vercel-forwarded-for": "203.0.113.7, 198.51.100.9" },
    { "x-vercel-forwarded-for": "not-an-ip" }, { "x-vercel-forwarded-for": "fe80::1%en0" },
  ]) assert.equal(qrSourceHash(request(headers), environment), null);
});

test("IPv6 spelling is canonical and HMAC uses a private purpose-specific key", () => {
  const first = request({ "x-vercel-forwarded-for": "2001:db8:0:0:0:0:0:1" });
  const second = request({ "x-vercel-forwarded-for": "2001:DB8::1" });
  assert.equal(qrSourceHash(first, environment), qrSourceHash(second, environment));
  assert.notEqual(qrSourceHash(first, environment), qrSourceHash(first, {
    ...environment, SUPABASE_SERVICE_ROLE_KEY: "different-synthetic-key",
  }));
  assert.equal(qrSourceHash(first, { ...environment, SUPABASE_SERVICE_ROLE_KEY: "" }), null);
});

test("non-Vercel production fails closed, while development has one shared non-spoofable bucket", () => {
  const first = request({ "x-vercel-forwarded-for": "203.0.113.7" });
  const second = request({ "x-vercel-forwarded-for": "203.0.113.8" });
  assert.equal(qrSourceHash(first, { ...environment, VERCEL: undefined }), null);
  const local = { ...environment, VERCEL: undefined, NODE_ENV: "development" };
  assert.equal(qrSourceHash(first, local), qrSourceHash(second, local));
  assert.equal(qrSourceHash(first, local), qrSourceHash(request(), local));
});
