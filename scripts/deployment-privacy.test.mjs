import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  auditBrowserBuild, auditServerBoundaries, auditUploadManifest, browserSecretReasons,
  checkDeploymentPrivacy, collectUploadManifest, loadOfflineVercelCollector,
} from "./check-deployment-privacy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collectorPromise = loadOfflineVercelCollector(root);
const deploymentIgnore = await fs.readFile(path.join(root, ".vercelignore"), "utf8");

async function write(root, file, text = "synthetic fixture\n") {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text);
}

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "powerbuild-deployment-privacy-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  await write(folder, "package.json", '{"name":"synthetic-upload-fixture","private":true}');
  await write(folder, ".vercelignore", deploymentIgnore);
  await write(folder, "app/page.tsx", 'export default function Page() { return "Safe app"; }');
  await write(folder, "lib/supabase/admin.ts", 'import "server-only";\nexport const key = process.env.SUPABASE_SERVICE_ROLE_KEY;');
  await write(folder, "public/icon.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return folder;
}

async function buildFixture(folder, content = 'console.log("safe browser");') {
  await write(folder, ".next/static/chunks/app.js", content);
  await write(folder, ".next/BUILD_ID", "synthetic-build");
  // Avoid filesystem timestamp precision making a just-written build appear stale.
  const future = new Date(Date.now() + 1000);
  await fs.utimes(path.join(folder, ".next/BUILD_ID"), future, future);
}

const jwt = role => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ iss: "supabase", ref: "synthetic-only", role, exp: 9999999999 })).toString("base64url"),
  Buffer.from("synthetic-signature-never-a-real-key").toString("base64url"),
].join(".");
const opaque = () => randomBytes(32).toString("base64url");
const named = (...parts) => parts.join("_");

test("mail credentials cannot be referenced by client source or emitted browser assets", async t => {
  const names = ["SMTP_PASSWORD", "SMTP_PASS", "SMTP2GO_API_KEY", "RESEND_API_KEY", "BREVO_API_KEY"];
  for (const name of names) {
    const folder = await fixture(t);
    await write(folder, "app/page.tsx", `"use client"; export default function Page() { return process.env.NEXT_PUBLIC_${name}; }`);
    assert.ok((await auditServerBoundaries(folder)).some(f => f.reason === "client-module-server-secret-access"));
    assert.ok(browserSecretReasons(`process.env["${name}"]`).includes("server-secret-environment-name"));
    await write(folder, "app/page.tsx", 'export default function Page() { return "Safe app"; }');
    await write(folder, "lib/mail.ts", `import "server-only"; export const password = process.env.${name};`);
    assert.deepEqual(await auditServerBoundaries(folder), []);
  }
});

test("the real Vercel upload collector excludes private files, not merely ignore text", async t => {
  const folder = await fixture(t);
  const privateFiles = [
    ".env", ".env.local", ".env.production", "app/.env.production", ".git/config", ".vercel/project.json",
    "ai/models/workout-coach.gguf", "ai/data/private/client.jsonl", "ai/training/local-state.json",
    "docs/vault/Handoff.md", "connector/run.mjs", "connector/runtime/config.json", "connector/.runtime/token",
    "scripts/audit.mjs", "supabase/migrations/test.sql", "node_modules/private-package/index.js",
    ".next/static/private-build.js", "out/private.html", "build/private.js", "coverage/private.json",
    "lib/__pycache__/private.pyc", "build.log", "tsconfig.tsbuildinfo",
    ".githooks/pre-commit", ".github/workflows/test.yml", "private.pem", "nested/private.key",
    "public/model.gguf", "public/model.safetensors", "public/model.ckpt", "public/model.pth", "public/model.onnx",
    "id_rsa", "keys/backup-id_ed25519",
  ];
  await Promise.all(privateFiles.map(file => write(folder, file)));
  const collector = await collectorPromise;
  const manifest = await collectUploadManifest(folder, collector);
  assert.deepEqual(auditUploadManifest(manifest), []);
  const uploaded = manifest.entries.filter(entry => !entry.directory).map(entry => entry.path);
  assert.ok(uploaded.includes("app/page.tsx"));
  assert.ok(uploaded.includes("lib/supabase/admin.ts"), "server source is needed to build the app, secret values are not");
  assert.ok(uploaded.includes("public/icon.svg"));
  for (const file of privateFiles) assert.ok(!uploaded.includes(file), `private fixture path was uploaded: ${file}`);
  // Exercise the CLI's complete, offline hashing collector too; all contents here are synthetic.
  const full = await collector.api.inspectDeploymentFiles({ path: folder, prebuilt: false, debug: false });
  const fullFiles = full.files.filter(entry => (entry.mode & 0o170000) !== 0o040000).map(entry => entry.path).sort();
  assert.deepEqual(fullFiles, uploaded.sort());
});

test("removing a private-tree ignore rule fails the upload audit", async t => {
  const folder = await fixture(t);
  await write(folder, ".vercelignore", deploymentIgnore.replace(/^\/connector\/\s*$/m, ""));
  await write(folder, "connector/runtime/config.json");
  const manifest = await collectUploadManifest(folder, await collectorPromise);
  assert.deepEqual(auditUploadManifest(manifest), [{ file: "connector/runtime/config.json", reason: "private-local-directory" }]);
});

test("Git ignoring an environment file alone does not protect a Vercel source upload", async t => {
  const folder = await fixture(t);
  await write(folder, ".vercelignore", deploymentIgnore.replace(/^\.env\*\s*$/m, ""));
  await write(folder, ".gitignore", ".env*\n");
  await write(folder, ".env.production", "SYNTHETIC_SECRET=fixture-value\n");
  const manifest = await collectUploadManifest(folder, await collectorPromise);
  assert.deepEqual(auditUploadManifest(manifest), [{ file: ".env.production", reason: "environment-file" }]);
});

test("publicly aliased private data and model artifacts fail without reading link contents", async t => {
  const folder = await fixture(t);
  await write(folder, "ai/data/private/member.json");
  await write(folder, "public/leaked-model.gguf");
  await fs.symlink("../ai/data/private/member.json", path.join(folder, "public", "data.json"));
  await fs.symlink("../../private-outside-fixture", path.join(folder, "public", "external.json"));
  const manifest = await collectUploadManifest(folder, await collectorPromise);
  const findings = auditUploadManifest(manifest);
  assert.ok(findings.some(f => f.file === "public/data.json" && f.reason === "symlink-private-local-directory"));
  assert.ok(findings.some(f => f.file === "public/external.json" && f.reason === "symlink-upload-path-outside-project"));
  assert.deepEqual(auditUploadManifest({ entries: [{ path: "public/leaked-model.gguf", directory: false, symlink: false }] }), [
    { file: "public/leaked-model.gguf", reason: "local-model-artifact" },
  ]);
});

test("removing any outside-tree private key/model exclusion makes the actual upload audit fail", async t => {
  const policies = [
    ["*.pem", "private.pem", "private-key-file"],
    ["*.key", "nested/private.key", "private-key-file"],
    ["*.gguf", "public/model.gguf", "local-model-artifact"],
    ["*.safetensors", "public/model.safetensors", "local-model-artifact"],
    ["*.ckpt", "public/model.ckpt", "local-model-artifact"],
    ["*.pth", "public/model.pth", "local-model-artifact"],
    ["*.onnx", "public/model.onnx", "local-model-artifact"],
    ["*id_rsa", "id_rsa", "private-key-file"],
    ["*id_ed25519", "keys/backup-id_ed25519", "private-key-file"],
    ["/.githooks/", ".githooks/pre-commit", "private-local-directory"],
    ["/.github/", ".github/workflows/test.yml", "private-local-directory"],
  ];
  for (const [rule, file, reason] of policies) {
    const folder = await fixture(t);
    const lines = deploymentIgnore.split(/\r?\n/);
    assert.ok(lines.some(line => line.trim() === rule), `Expected a deployment exclusion for ${rule}`);
    await write(folder, ".vercelignore", lines.filter(line => line.trim() !== rule).join("\n"));
    await write(folder, file);
    const manifest = await collectUploadManifest(folder, await collectorPromise);
    assert.deepEqual(auditUploadManifest(manifest), [{ file, reason }]);
  }
});

test("private paths remain blocked across case changes and machine credential folders", () => {
  for (const file of ["AI/data/private/member.json", "Docs/vault/Notes.md", "CONNECTOR/runtime/config.json", ".ENV.production", ".ssh/id_rsa", ".codex/auth.json"]) {
    assert.equal(auditUploadManifest({ entries: [{ path: file, directory: false, symlink: false }] }).length, 1);
  }
});

test("Supabase anon/publishable keys and SDK role labels are allowed in browser code", () => {
  const publicText = `const anon="${jwt("anon")}"; const publishable="${named("sb", "publishable", opaque())}"; const role="service_role"; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;`;
  assert.deepEqual(browserSecretReasons(publicText), []);
  assert.deepEqual(browserSecretReasons('const example="sb_secret_synthetic_private_configuration_only"; const exampleBearer="Bearer PLACEHOLDER_TOKEN";'), []);
});

test("backend credentials and escaped env access are caught with redacted findings", () => {
  const cases = [
    [jwt("service_role"), "supabase-service-role-jwt"],
    [named("sb", "secret", opaque()), "supabase-secret-key"],
    [named("ghp", randomBytes(25).toString("hex")), "github-token"],
    [named("vcp", opaque()), "vercel-token"],
    [`Authorization: "Bearer ${opaque()}"`, "literal-bearer-credential"],
    ['process.env["SUPABASE_SERVICE_ROLE_KEY"]', "server-secret-environment-name"],
    ['process.env["SUPABASE\\u005fSERVICE_ROLE_KEY"]', "server-secret-environment-name"],
    ['process.env["COACH_GATEWAY_TOKEN"]', "server-secret-environment-name"],
    ["-----BEGIN PRIVATE KEY-----\n" + randomBytes(80).toString("base64") + "\n-----END PRIVATE KEY-----", "private-pem-key"],
  ];
  for (const [input, reason] of cases) {
    const result = browserSecretReasons(input);
    assert.ok(result.includes(reason));
    assert.ok(!JSON.stringify(result).includes(input));
  }
});

test("browser source maps and public assets are scanned as well as JavaScript chunks", async t => {
  const folder = await fixture(t);
  await buildFixture(folder);
  await write(folder, ".next/static/chunks/app.js.map", JSON.stringify({ sourcesContent: [jwt("service_role")] }));
  await write(folder, "public/config.json", JSON.stringify({ token: named("sb", "secret", opaque()) }));
  const result = await auditBrowserBuild(folder, { requireFresh: false });
  assert.deepEqual(result.findings, [
    { file: ".next/static/chunks/app.js.map", reason: "supabase-service-role-jwt" },
    { file: "public/config.json", reason: "supabase-secret-key" },
  ]);
  assert.equal(result.javascriptFiles, 1);
});

test("missing, empty, and stale browser builds fail closed", async t => {
  const folder = await fixture(t);
  assert.equal((await auditBrowserBuild(folder)).findings[0].reason, "production-browser-build-missing");
  await buildFixture(folder);
  await fs.rm(path.join(folder, ".next/static/chunks/app.js"));
  assert.ok((await auditBrowserBuild(folder)).findings.some(f => f.reason === "browser-javascript-build-empty"));
  await buildFixture(folder);
  const older = new Date(Date.now() - 60_000);
  await fs.utimes(path.join(folder, ".next/BUILD_ID"), older, older);
  assert.ok((await auditBrowserBuild(folder)).findings.some(f => f.file === "app/page.tsx" && f.reason === "browser-build-older-than-source"));
});

test("the admin server-only boundary and direct client secret access are independently guarded", async t => {
  const folder = await fixture(t);
  assert.deepEqual(await auditServerBoundaries(folder), []);
  await write(folder, "lib/supabase/admin.ts", "export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;");
  await write(folder, "components/leak.tsx", '"use client";\nexport const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];');
  const result = await auditServerBoundaries(folder);
  assert.ok(result.some(f => f.file === "lib/supabase/admin.ts" && f.reason === "admin-client-server-only-marker-missing"));
  assert.ok(result.some(f => f.file === "components/leak.tsx" && f.reason === "client-module-server-secret-access"));
});

test("secret helpers require a real server-only import; comments and omitted semicolons cannot bypass it", async t => {
  const folder = await fixture(t);
  await write(folder, "lib/helper.ts", '/*\nimport "server-only";\n*/\nconst key = process["env"]["COACH_GATEWAY_TOKEN"];');
  await write(folder, "components/leak.tsx", '// comment before directive\n"use client"\nexport const key = process.env.SUPABASE_SERVICE_ROLE_KEY;');
  await write(folder, "lib/pure.ts", 'export const keyFromInput = (environment) => environment.SUPABASE_SERVICE_ROLE_KEY;');
  await write(folder, "app/api/fixture/route.ts", 'export const GET = () => process.env.SUPABASE_SERVICE_ROLE_KEY;');
  const result = await auditServerBoundaries(folder);
  assert.ok(result.some(f => f.file === "lib/helper.ts" && f.reason === "server-secret-module-marker-missing"));
  assert.ok(result.some(f => f.file === "components/leak.tsx" && f.reason === "client-module-server-secret-access"));
  assert.ok(!result.some(f => f.file === "lib/pure.ts" || f.file === "app/api/fixture/route.ts"));
  await write(folder, "lib/helper.ts", 'import "server-only";\nconst key = process.env.COACH_GATEWAY_TOKEN;');
  assert.ok(!(await auditServerBoundaries(folder)).some(f => f.file === "lib/helper.ts"));
});

test("this app's actual upload list and fresh production browser build pass privacy checks", async () => {
  const result = await checkDeploymentPrivacy(root, await collectorPromise);
  assert.deepEqual(result.findings, [], JSON.stringify(result.findings));
  assert.ok(result.uploadFiles > 100);
  assert.ok(result.browserJavascriptFiles > 0);
});
