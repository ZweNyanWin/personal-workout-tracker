import assert from "node:assert/strict";
import test from "node:test";
import { safeRedirectPath } from "../lib/utils.ts";
import { recoveryCallbackError, recoverySessionState } from "../lib/auth/recovery.ts";

const APP_ORIGIN = "https://powerbuild.example";

test("post-auth paths preserve their route, query, and fragment", () => {
  for (const path of ["/", "/1rm", "/history?range=4%20weeks#latest", "/log/123"]) {
    assert.equal(safeRedirectPath(path), path);
    assert.equal(new URL(safeRedirectPath(path), APP_ORIGIN).origin, APP_ORIGIN);
  }
  assert.equal(safeRedirectPath("/workout/../dashboard?tab=next"), "/dashboard?tab=next");
});

test("dot-segment normalization cannot produce an external redirect", () => {
  for (const path of [
    "/.//evil.example",
    "/x/..//evil.example",
    "/%2e//evil.example",
    "/x/%2e%2e//evil.example?next=1#fragment",
  ]) {
    assert.equal(safeRedirectPath(path), "/dashboard", path);
    assert.equal(new URL(safeRedirectPath(path), APP_ORIGIN).origin, APP_ORIGIN, path);
  }
});

test("external URLs, backslashes, and ignored controls cannot switch origin", () => {
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "dashboard",
  ]) {
    assert.equal(safeRedirectPath(path), "/dashboard", path);
    assert.equal(new URL(safeRedirectPath(path), APP_ORIGIN).origin, APP_ORIGIN, path);
  }
});

test("missing or rejected paths use the caller's local fallback", () => {
  for (const path of [undefined, null, "", "/.//evil.example"]) {
    assert.equal(safeRedirectPath(path, "/login"), "/login");
  }
});

test("failed recovery callback cannot use an existing signed-in session", () => {
  const signedIn = { data: { user: { id: "existing-user" } }, error: null };
  assert.equal(recoverySessionState(signedIn, "invalid_link"), "invalid");
  assert.equal(recoverySessionState(signedIn, "verification_unavailable"), "unavailable");
  assert.equal(recoverySessionState(signedIn, null), "ready");
});

test("missing or expired sessions require a new recovery link", () => {
  assert.equal(recoverySessionState({ data: { user: null }, error: null }, null), "invalid");
  for (const error of [
    { name: "AuthSessionMissingError", status: 400 },
    { code: "refresh_token_not_found", status: 400 },
    { code: "bad_jwt", status: 401 },
  ]) {
    assert.equal(recoverySessionState({ data: { user: null }, error }, null), "invalid");
  }
});

test("auth transport failures offer retry instead of claiming a link expired", () => {
  for (const error of [
    { name: "AuthRetryableFetchError", status: 0 },
    { status: 503 },
    { status: 429 },
  ]) {
    assert.equal(recoverySessionState({ data: { user: null }, error }, null), "unavailable");
    assert.equal(recoveryCallbackError(error), "verification_unavailable");
  }
});

test("callback errors are reduced to safe actionable categories", () => {
  for (const error of [
    { name: "AuthPKCEGrantCodeExchangeError" },
    { code: "bad_code_verifier", status: 400 },
    { code: "flow_state_expired", status: 400 },
    { code: "otp_expired", status: 403 },
  ]) {
    assert.equal(recoveryCallbackError(error), "invalid_link");
  }
  assert.equal(recoveryCallbackError({}), "verification_unavailable");
});
