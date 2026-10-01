import assert from "node:assert/strict";
import test from "node:test";
import { safeRedirectPath } from "../lib/utils.ts";

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
