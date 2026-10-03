import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { formatFindings, inspectFile, isPrivatePath, scanRepository } from "./secret-guard.mjs";

const execute = promisify(execFile);
const script = fileURLToPath(new URL("./secret-guard.mjs", import.meta.url));
const opaque = () => randomBytes(32).toString("base64url");
// Runtime-only synthetic material: no credential-shaped values live in Git.
const named = (...parts) => parts.join("_");
const jwt = (role, iss = "supabase") => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role, iss, ref: "fictional-project", exp: 2_000_000_000 })).toString("base64url"),
  opaque(),
].join(".");
const types = (findings) => findings.map((finding) => finding.type);

async function repository(t) {
  const cwd = await mkdtemp(join(tmpdir(), "powerbuild-secret-guard-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await execute("git", ["-C", cwd, "init", "--quiet"]);
  const track = async (path, contents) => {
    const absolute = join(cwd, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, contents);
    await execute("git", ["-C", cwd, "add", "--", path]);
  };
  return { cwd, track };
}

test("private paths are blocked before contents, including innocuous client/model notes", () => {
  for (const path of [
    ".env", ".env.local", "web/.env.production", ".env.example.local",
    ".envrc", ".env-backup",
    "ai/data/private/readme.json", "AI/data/Private/notes.md", "ai/evals/results/run.json",
    "ai/training/local-state.json", "ai/training/local-state.json.tmp", "docs/vault/Handoff.md",
    "ai/knowledge/uploaded-programs.json", "ai/knowledge/uploaded-personal-plans.json",
    "ai/knowledge/program-examples.json", "ai/knowledge/build_uploaded_personal_plans.py",
    "connector/config.json", "connector/config.json.backup", "connector/runtime.json",
    "connector/logs/latest.txt", "connector/gateway.log", ".vercel/project.json",
    "exports/coach.gguf", "ai/weights/model.safetensors", "snapshots/trainer.ckpt",
    "model.pth", "exports/adapter.onnx", ".ssh/id_ed25519", "backup/id_rsa",
    "keys/identity", "keys/ssh_host_ecdsa_key",
  ]) {
    assert.equal(isPrivatePath(path), true, path);
    assert.deepEqual(inspectFile(path, "Nothing sensitive in this fixture."), [{ type: "private-path", path, line: 1 }]);
  }
  for (const path of [
    ".env.example", ".env.sample", ".env.production.example", "docs/security.md",
    "connector/gateway.mjs", "connector/runtime.test.mjs", "ai/training/README.md",
    "ai/data/public/examples.jsonl", "ai/evals/cases.jsonl",
    ".ssh/id_ed25519.pub", "docs/model-formats.md",
  ]) assert.equal(isPrivatePath(path), false, path);
});

test("Vercel OIDC JWTs and literal OIDC assignments are private, regardless of claimed JWT role", () => {
  const token = jwt("anon", "https://oidc.vercel.com/fictional-team");
  assert.deepEqual(inspectFile("lib/oidc.ts", `// public context\nconst value = "${token}";`), [
    { type: "vercel-oidc-jwt", path: "lib/oidc.ts", line: 2 },
  ]);
  assert.ok(types(inspectFile(".env.example", `VERCEL_OIDC_TOKEN=${opaque()}`)).includes("literal-credential-assignment"));
  assert.ok(types(inspectFile("lib/client.ts", `NEXT_PUBLIC_VERCEL_OIDC_TOKEN="${opaque()}"`)).includes("literal-credential-assignment"));
  assert.deepEqual(inspectFile("lib/oidc.ts", 'const value = process.env.VERCEL_OIDC_TOKEN;'), []);
  assert.deepEqual(inspectFile(".env.example", "VERCEL_OIDC_TOKEN=YOUR_OIDC_TOKEN"), []);
  // Similar domain strings do not imply Vercel's private issuer.
  assert.deepEqual(inspectFile("lib/jwt-example.ts", jwt("anon", "https://oidc.vercel.com.example.invalid/team")), []);
});

test("private model/SSH paths reject even empty or unavailable content without inspecting it", () => {
  for (const path of ["model.gguf", "model.safetensors", "model.ckpt", "model.pth", "model.onnx", ".ssh/id_rsa"]) {
    assert.deepEqual(inspectFile(path, undefined), [{ type: "private-path", path, line: 1 }]);
  }
});

test("privileged Supabase JWTs are blocked; intentional public anon credentials are allowed", () => {
  const privileged = jwt("service_role");
  const anon = jwt("anon");
  const publishable = named("sb", "publishable", opaque());
  assert.deepEqual(types(inspectFile("lib/example.ts", `first line\nexport const key = "${privileged}";`)), ["supabase-service-role-jwt"]);
  assert.equal(inspectFile("lib/example.ts", `first line\n${privileged}`)[0].line, 2);
  assert.deepEqual(inspectFile(".env.example", `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}`), []);
  assert.deepEqual(inspectFile("lib/public.ts", `Authorization: "Bearer ${anon}"\nAuthorization: "Bearer ${publishable}"`), []);
  // Role alone must not exempt a private JWT from a different issuer.
  assert.ok(types(inspectFile("lib/private.ts", `Authorization: "Bearer ${jwt("anon", "https://issuer.invalid")}"`)).includes("literal-bearer-credential"));
});

test("known key families are detected without returning any credential values", () => {
  const samples = [
    ["supabase-secret-key", named("sb", "secret", opaque())],
    ...["p", "o", "u", "s", "r"].map((kind) => ["github-token", named("gh" + kind, randomBytes(25).toString("hex"))]),
    ["github-token", named("github", "pat", randomBytes(40).toString("hex"))],
    ...["p", "i", "a", "r", "k"].map((kind) => ["vercel-token", named("vc" + kind, opaque())]),
  ];
  for (const [type, value] of samples) {
    const findings = inspectFile("settings.ts", Buffer.from(`// public setup\nconst credential = "${value}";\n`));
    assert.deepEqual(findings, [{ type, path: "settings.ts", line: 2 }]);
    assert.equal(formatFindings(findings).includes(value), false);
    assert.deepEqual(Object.keys(findings[0]), ["type", "path", "line"]);
  }
});

test("literal Bearer and legacy assigned credentials are blocked, not env references or placeholders", () => {
  const value = opaque();
  for (const content of [
    `Authorization: "Bearer ${value}"`, `export VERCEL_TOKEN=${value}`,
    `const GITHUB_TOKEN = "${value}";`, `{"SUPABASE_SERVICE_ROLE_KEY": "${value}"}`,
  ]) assert.ok(inspectFile("config.example.ts", content).length);
  const safe = [
    'Authorization: `Bearer ${token}`', 'const VERCEL_TOKEN = process.env.VERCEL_TOKEN;',
    'SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY', 'VERCEL_TOKEN=<replace-me>',
    'SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key"', 'SUPABASE_SERVICE_ROLE_KEY: "different-synthetic-key"',
    'Authorization: "Bearer PLACEHOLDER_TOKEN"', 'Authorization: "Bearer process.env.GATEWAY_TOKEN"',
    `SUPABASE_SECRET_KEY=${named("sb", "secret", "YOUR_PRIVATE_KEY_HERE")}`,
  ].join("\n");
  assert.deepEqual(inspectFile(".env.example", safe), []);
});

test("named mail sender credentials are redacted, including compact or spaced Gmail App Passwords", () => {
  const password = [...randomBytes(16)].map((byte) => String.fromCharCode(97 + byte % 26)).join("");
  const spaced = password.match(/.{4}/g).join(" ");
  const tabbed = password.match(/.{4}/g).join("\t");
  for (const name of ["SMTP_PASSWORD", "SMTP_PASS", "NEXT_PUBLIC_SMTP_PASSWORD", "VITE_SMTP_PASS"]) {
    for (const value of [password, spaced, tabbed]) {
      for (const assignment of [`${name}="${value}"`, `export ${name}=${value}`, `{"${name}": "${value}"}`]) {
        const findings = inspectFile("settings.example.ts", `// synthetic runtime fixture\n${assignment}`);
        assert.deepEqual(findings, [{ type: "literal-credential-assignment", path: "settings.example.ts", line: 2 }]);
        assert.equal(formatFindings(findings).includes(value), false);
      }
    }
  }
  for (const name of ["SMTP_PASSWORD", "SMTP_PASS", "SMTP2GO_API_KEY", "RESEND_API_KEY", "BREVO_API_KEY"]) {
    const value = opaque();
    const findings = inspectFile(".env.example", `${name}=${value}`);
    assert.deepEqual(findings, [{ type: "literal-credential-assignment", path: ".env.example", line: 1 }]);
    assert.equal(formatFindings(findings).includes(value), false);
  }
  assert.ok(inspectFile(".env.example", `SMTP_PASSWORD=${spaced} # copied password`).length);
});

test("mail sender environment references and explicit placeholders remain safe without treating prose as a password", () => {
  const names = ["SMTP_PASSWORD", "SMTP_PASS", "SMTP2GO_API_KEY", "RESEND_API_KEY", "BREVO_API_KEY"];
  for (const name of names) {
    for (const value of ["synthetic-test-credential", "EXAMPLE_MAIL_PASSWORD", "YOUR_MAIL_KEY", "<replace-me>", "${" + name + "}", "process.env." + name]) {
      assert.deepEqual(inspectFile("settings.example.ts", `${name}="${value}"`), []);
    }
    assert.deepEqual(inspectFile("settings.example.ts", `const value = process.env.${name};`), []);
    assert.deepEqual(inspectFile("settings.example.ts", `const value = import.meta.env.${name};`), []);
  }
  assert.deepEqual(inspectFile("docs/email.md", "SMTP_PASSWORD is entered directly in the provider dashboard."), []);
  assert.deepEqual(inspectFile("docs/email.md", 'SMTP_PASSWORD="Enter the password from your sender"'), []);
  assert.deepEqual(inspectFile("config.ts", 'SMTP_USERNAME="powerbuildsender"'), []);
});

test("private PEM material, including a truncated key, is detected but a public certificate/header example is allowed", () => {
  const header = "-----BEGIN " + "PRIVATE" + " KEY-----";
  const footer = "-----END " + "PRIVATE" + " KEY-----";
  const material = randomBytes(80).toString("base64");
  for (const body of [`${header}\n${material}\n${footer}`, `${header}\n${material}\n`]) {
    assert.deepEqual(types(inspectFile("key.txt", body)), ["private-pem-key"]);
  }
  assert.deepEqual(types(inspectFile("key.js", JSON.stringify({ key: `${header}\n${material}\n${footer}` }))), ["private-pem-key"]);
  assert.deepEqual(inspectFile("docs/example.md", `${header}\n<key material>\n${footer}`), []);
  assert.deepEqual(inspectFile("certificate.pem", "-----BEGIN CERTIFICATE-----\n" + material + "\n-----END CERTIFICATE-----"), []);
});

test("line numbers stay accurate across signature types and duplicate tokens are redacted once per type/line", () => {
  const supabase = named("sb", "secret", opaque());
  const vercel = named("vc" + "p", opaque());
  const findings = inspectFile("mixed.ts", `one\r\n${supabase} ${supabase}\r\nthree\r\nBearer ${vercel}\r\n`);
  assert.deepEqual(findings, [
    { type: "supabase-secret-key", path: "mixed.ts", line: 2 },
    { type: "literal-bearer-credential", path: "mixed.ts", line: 4 },
    { type: "vercel-token", path: "mixed.ts", line: 4 },
  ]);
});

test("staged mode checks actual index bytes even after a secret is edited away; working mode does not scan untracked files", async (t) => {
  const { cwd, track } = await repository(t);
  const value = named("sb", "secret", opaque());
  await track("src/config.ts", `// sample\nexport const key = "${value}";\n`);
  await writeFile(join(cwd, "src/config.ts"), "export const key = process.env.KEY;\n");
  await writeFile(join(cwd, "untracked.txt"), value);
  assert.deepEqual(await scanRepository({ cwd }), []);
  assert.deepEqual(await scanRepository({ cwd, staged: true }), [{ type: "supabase-secret-key", path: "src/config.ts", line: 2 }]);
  // No HEAD/commit exists: the scan must still read the staged blob.
  let result;
  try { await execute(process.execPath, [script, "--staged"], { cwd }); }
  catch (error) { result = error; }
  assert.equal(result?.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes(value), false);
  assert.deepEqual(JSON.parse(result.stderr), { type: "supabase-secret-key", path: "src/config.ts", line: 2 });
  await execute("git", ["-C", cwd, "add", "--", "src/config.ts"]);
  assert.deepEqual(await scanRepository({ cwd, staged: true }), []);
});

test("private indexed paths are rejected even with harmless content and with staged removal respected", async (t) => {
  const { cwd, track } = await repository(t);
  await track("docs/vault/synthetic-note.md", "Only a generated test note.");
  assert.deepEqual(await scanRepository({ cwd, staged: true }), [{ type: "private-path", path: "docs/vault/synthetic-note.md", line: 1 }]);
  await execute("git", ["-C", cwd, "rm", "--cached", "--", "docs/vault/synthetic-note.md"]);
  assert.deepEqual(await scanRepository({ cwd, staged: true }), []);
});

test("Git file names are arguments, never shell commands, and diagnostics escape newlines", async (t) => {
  const { cwd, track } = await repository(t);
  const path = "notes;$(touch SHOULD_NOT_EXIST)\ncontinued.txt";
  const value = named("vc" + "p", opaque());
  await track(path, value);
  const findings = await scanRepository({ cwd, staged: true });
  assert.deepEqual(findings, [{ type: "vercel-token", path, line: 1 }]);
  const output = formatFindings(findings);
  assert.equal(output.split("\n").length, 1);
  assert.deepEqual(JSON.parse(output), findings[0]);
  await assert.rejects(readFile(join(cwd, "SHOULD_NOT_EXIST")), { code: "ENOENT" });
});

test("CLI failures are redacted and fail closed rather than printing Git stderr", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "powerbuild-secret-guard-no-git-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let failure;
  try { await execute(process.execPath, [script, "--staged"], { cwd }); }
  catch (error) { failure = error; }
  assert.equal(failure?.code, 2);
  assert.deepEqual(JSON.parse(failure.stderr), { type: "scan-error", path: ".", line: 1 });
  assert.equal(failure.stdout, "");
  assert.equal(failure.stderr.includes(cwd), false);
  assert.equal(failure.stderr.includes("fatal:"), false);
});

test("reachable history detects removed credential blobs and private paths without exposing values", async (t) => {
  const { cwd, track } = await repository(t);
  const value = named("sb", "secret", opaque());
  await track("legacy/config.ts", `// old setup\nconst key = "${value}";\n`);
  await track("ai/data/private/fixture.json", '{"fictional":true}');
  const commit = async () => execute("git", ["-C", cwd, "-c", "user.name=SecretGuardFixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Synthetic guard fixture"]);
  await commit();
  await execute("git", ["-C", cwd, "rm", "--", "legacy/config.ts", "ai/data/private/fixture.json"]);
  await track("README.md", "Public, fictional fixture.\n");
  await commit();
  assert.deepEqual(await scanRepository({ cwd }), []);
  assert.deepEqual(await scanRepository({ cwd, staged: true }), []);
  const history = await scanRepository({ cwd, history: true });
  assert.deepEqual(history, [
    { type: "private-path", path: "ai/data/private/fixture.json", line: 1 },
    { type: "supabase-secret-key", path: "legacy/config.ts", line: 2 },
  ]);
  assert.equal(formatFindings(history).includes(value), false);
  let failure;
  try { await execute(process.execPath, [script, "--history"], { cwd }); }
  catch (error) { failure = error; }
  assert.equal(failure?.code, 1);
  assert.equal(failure.stderr.includes(value), false);
  assert.deepEqual(failure.stderr.trim().split("\n").map((line) => JSON.parse(line)), history);
  await assert.rejects(scanRepository({ cwd, history: true, staged: true }), { message: "Secret guard could not inspect the repository." });
});

test("history includes other reachable local branches and preserves NUL-delimited historical filenames", async (t) => {
  const { cwd, track } = await repository(t);
  await track("README.md", "Clean base.\n");
  const commit = async () => execute("git", ["-C", cwd, "-c", "user.name=SecretGuardFixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Synthetic guard fixture"]);
  await commit();
  const base = (await execute("git", ["-C", cwd, "rev-parse", "HEAD"])).stdout.trim();
  await execute("git", ["-C", cwd, "switch", "--quiet", "-c", "fixture-history-branch"]);
  const path = "old\nfixture.txt";
  await track(path, named("vc" + "i", opaque()));
  await commit();
  await execute("git", ["-C", cwd, "switch", "--quiet", "--detach", base]);
  assert.deepEqual(await scanRepository({ cwd }), []);
  assert.deepEqual(await scanRepository({ cwd, history: true }), [{ type: "vercel-token", path, line: 1 }]);
});
