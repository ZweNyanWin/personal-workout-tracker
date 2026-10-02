import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
// Explicit opt-in and a fixed disposable local database prevent accidental
// execution against a production URL or the Mac's normal PostgreSQL instance.
const enabled = process.env.POWERBUILD_QR_DB_TEST === "1";
const psql = process.env.POWERBUILD_QR_PSQL || "psql";
async function query(sql) {
  const { stdout } = await execute(psql, [
    "-h", "127.0.0.1", "-p", "55439", "-d", "powerbuild_review4",
    "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ]);
  return stdout.trim();
}

test("concurrent QR starts atomically share the per-source budget", { skip: !enabled }, async () => {
  assert.equal(await query("SELECT count(*) FROM public.qr_login_rate_events WHERE created_at > clock_timestamp()-INTERVAL '1 hour'"), "0",
    "Run in an isolated QR fixture with no recent rate events");
  const source = createHash("sha256").update(randomUUID()).digest("hex");
  const desktop = createHash("sha256").update(randomUUID()).digest("hex");
  const approval = createHash("sha256").update(randomUUID()).digest("hex");
  const ids = Array.from({ length: 20 }, () => randomUUID());
  try {
    const results = await Promise.all(ids.map((id) => query(
      `SET ROLE service_role; SELECT accepted::text FROM public.create_qr_login_request('${id}','${source}','${desktop}','${approval}','123456')`
    )));
    assert.equal(results.filter((result) => result === "true").length, 6);
    assert.equal(results.filter((result) => result === "false").length, 14);
    assert.equal(await query(`SELECT count(*) FROM public.qr_login_requests WHERE desktop_secret_hash='${desktop}'`), "6");
    assert.equal(await query(`SELECT count(*) FROM public.qr_login_rate_events WHERE source_hash='${source}'`), "6");
  } finally {
    await query(`BEGIN;
      DELETE FROM public.qr_login_requests WHERE id IN (${ids.map((id) => `'${id}'`).join(",")});
      DELETE FROM public.qr_login_rate_events WHERE source_hash='${source}';
      COMMIT;`);
  }
});
