import { execFile } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execute = promisify(execFile);
const MAX_BYTES = 32 * 1024 * 1024;

// These paths contain private client/training material even without a key.
// Match case-insensitively so the policy is consistent across Mac/Linux.
const PRIVATE_PATHS = [
  /^ai\/data\/private(?:\/|$)/i,
  /^ai\/evals\/results(?:\/|$)/i,
  /^ai\/training\/local-state(?:[./-]|$)/i,
  /^docs\/vault(?:\/|$)/i,
  /^ai\/knowledge\/(?:uploaded-programs|uploaded-personal-plans|program-examples)(?:[./-]|$)/i,
  /^ai\/knowledge\/build_uploaded_personal_plans\.py$/i,
  /^(?:.*\/)?(?:connector|powerbuild-connector)\/(?:config|runtime)(?:\.json(?:\..*)?|\/.*)?$/i,
  /^connector\/logs?(?:\/|\.|$)/i,
  /^connector\/local-state(?:\.json(?:\..*)?|\/.*)?$/i,
  /^connector\/.*\.(?:log|pid)$/i,
  /(?:^|\/)\.vercel(?:\/|$)/i,
  /(?:^|\/)\.codex\/(?:auth\.json|sessions|sqlite)(?:\/|$)/i,
  /\.(?:gguf|safetensors|ckpt|pth|onnx)$/i,
  /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519|ecdsa_sk|ed25519_sk)(?:\.(?:pem|key))?|identity(?:\.pem)?|ssh_host_(?:rsa|dsa|ecdsa|ed25519)_key)$/i,
];

const CREDENTIAL_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
  "VERCEL_TOKEN", "VERCEL_API_TOKEN", "VERCEL_ACCESS_TOKEN", "VERCEL_APP_CLIENT_SECRET", "VERCEL_OIDC_TOKEN",
  "GITHUB_TOKEN", "GITHUB_PAT", "GH_TOKEN",
  "COACH_GATEWAY_TOKEN", "COACH_REMOTE_TOKEN", "GATEWAY_TOKEN", "POWERBUILD_AI_TOKEN",
];
const credentialName = `(?:(?:NEXT_PUBLIC_|VITE_)?(?:${CREDENTIAL_NAMES.join("|")}))`;

function placeholder(value) {
  const text = value.trim().replace(/^(?:sb_(?:secret|publishable)|gh[pousr]|github_pat|vc[piark])_/i, "");
  return text === "" ||
    /^<[^<>\r\n]+>$/.test(text) ||
    /^\$\{[^{}\r\n]+\}$/.test(text) ||
    /^(?:process\.env\.|import\.meta\.env\.|os\.environ\b)/.test(text) ||
    /^(?:YOUR|REPLACE|EXAMPLE|SAMPLE|DUMMY|PLACEHOLDER)(?:[-_ ][a-z0-9]+)*$/i.test(text) ||
    /^(?:change[-_]?me|replace[-_]?me|redacted|not[-_](?:set|configured)|todo|tbd)$/i.test(text) ||
    /^(?:different[-_])?synthetic(?:[-_][a-z0-9]+)*$/i.test(text) ||
    /^(?:[A-Z][A-Z0-9_]*_(?:KEY|TOKEN)|x{8,}|\*{4,})$/.test(text);
}

function jwtPayload(value) {
  const segments = value.split(".");
  if (segments.length !== 3 || !segments.every((part) => /^[a-z0-9_-]+$/i.test(part))) return null;
  try {
    const header = JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    if (!header || typeof header.alg !== "string" || !payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function publicSupabaseCredential(value) {
  if (/^sb_publishable_[a-z0-9_-]{16,}$/i.test(value)) return true;
  const payload = jwtPayload(value);
  return payload?.role === "anon" && (
    payload.iss === "supabase" ||
    (typeof payload.iss === "string" && /^https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/auth\/v1\/?$/i.test(payload.iss))
  );
}

function vercelOidcCredential(payload) {
  if (typeof payload?.iss !== "string") return false;
  try { return new URL(payload.iss).hostname.toLowerCase() === "oidc.vercel.com"; }
  catch { return false; }
}

function plausibleCredential(value) {
  if (placeholder(value) || publicSupabaseCredential(value)) return false;
  if (!/^[a-z0-9._~+\/-]{16,}={0,2}$/i.test(value)) return false;
  // Ordinary prose and short identifier names should not be treated as keys.
  const unique = new Set(value).size;
  return unique >= 8 && (
    (/[a-z]/i.test(value) && /[0-9]/.test(value)) ||
    (/[a-z]/.test(value) && /[A-Z]/.test(value)) ||
    (value.length >= 24 && /^[a-z]+$/i.test(value))
  );
}

function normalizedPath(filePath) {
  return String(filePath).replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isPrivatePath(filePath) {
  const name = normalizedPath(filePath);
  const envName = name.split("/").at(-1);
  if (/^\.env/i.test(envName) && !/^\.env(?:\.[a-z0-9_-]+)*\.(?:example|sample)$/i.test(envName)) {
    return true;
  }
  return PRIVATE_PATHS.some((rule) => rule.test(name));
}

/** Pure content inspection. Returned records never contain matched values. */
export function inspectFile(filePath, contents) {
  const path = normalizedPath(filePath);
  if (isPrivatePath(path)) return [{ type: "private-path", path, line: 1 }];
  const buffer = typeof contents === "string" ? Buffer.from(contents) : Buffer.from(contents);
  if (buffer.byteLength > MAX_BYTES) return [{ type: "oversized-file", path, line: 1 }];
  const text = buffer.toString("utf8");
  const findings = [];
  const seen = new Set();
  let lineStart = 0;
  let lineNumber = 1;
  let nextNewline = text.indexOf("\n");
  const add = (type, index) => {
    // Match positions increase within each pattern. Rewind between patterns;
    // do not repeatedly copy/scan the full prefix for every matched token.
    if (index < lineStart) {
      lineStart = 0;
      lineNumber = 1;
      nextNewline = text.indexOf("\n");
    }
    while (nextNewline !== -1 && nextNewline < index) {
      lineNumber += 1;
      lineStart = nextNewline + 1;
      nextNewline = text.indexOf("\n", lineStart);
    }
    const line = lineNumber;
    const key = `${type}:${line}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push({ type, path, line });
    }
  };
  const tokens = [
    ["supabase-secret-key", /\bsb_secret_([a-z0-9_-]{16,})\b/gi],
    ["github-token", /\bgh[pousr]_([a-z0-9]{36,})\b/gi],
    ["github-token", /\bgithub_pat_([a-z0-9_]{50,})\b/gi],
    // Official formats: https://vercel.com/changelog/new-token-formats-and-secret-scanning
    ["vercel-token", /\bvc[piark]_([a-z0-9_-]{20,})\b/gi],
  ];
  for (const [type, pattern] of tokens) {
    for (const match of text.matchAll(pattern)) {
      if (!placeholder(match[1])) add(type, match.index);
    }
  }
  for (const match of text.matchAll(/\b[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{16,}\b/gi)) {
    const payload = jwtPayload(match[0]);
    if (payload?.role === "service_role") add("supabase-service-role-jwt", match.index);
    if (vercelOidcCredential(payload)) add("vercel-oidc-jwt", match.index);
  }
  for (const match of text.matchAll(/\bBearer[ \t]+([a-z0-9._~+\/-]{16,}={0,2})/gi)) {
    if (plausibleCredential(match[1])) add("literal-bearer-credential", match.index);
  }
  const assignments = [
    new RegExp(`\\b${credentialName}\\s*=\\s*["']([^"'\\r\\n]+)["']`, "gi"),
    new RegExp(`["']?\\b${credentialName}["']?\\s*:\\s*["']([^"'\\r\\n]+)["']`, "gi"),
    new RegExp(`^\\s*(?:export\\s+)?${credentialName}\\s*=\\s*([^\\s#"']+)`, "gim"),
  ];
  for (const pattern of assignments) {
    for (const match of text.matchAll(pattern)) {
      if (plausibleCredential(match[1])) add("literal-credential-assignment", match.index);
    }
  }
  // A quoted PEM header alone can be documentation. Require key-like material,
  // including leaked/truncated private keys without an END marker.
  for (const match of text.matchAll(/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g)) {
    const body = text.slice(match.index + match[0].length, match.index + 16_384).split("-----END ")[0]
      .replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
    const material = body.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[a-z0-9+/=]+$/i.test(line)).join("");
    if (material.length >= 32) add("private-pem-key", match.index);
  }
  return findings.sort((a, b) => a.line - b.line || a.type.localeCompare(b.type));
}

class InspectionError extends Error {
  constructor() {
    super("Secret guard could not inspect the repository.");
  }
}

async function git(cwd, args) {
  try {
    const { stdout } = await execute("git", ["-C", cwd, ...args], {
      encoding: "buffer", maxBuffer: MAX_BYTES, windowsHide: true,
    });
    return stdout;
  } catch {
    // Never propagate Git stderr, command text, or a buffer of file contents.
    throw new InspectionError();
  }
}

async function repositoryRoot(cwd) {
  return (await git(cwd, ["rev-parse", "--show-toplevel"])).toString("utf8").trimEnd();
}

/**
 * Reachable local refs/HEAD only: no fetch and no reflog/unreachable-object scan.
 * Inspect each unique blob once and every historical path separately; private
 * path findings never require reading the corresponding private blob.
 */
export async function scanHistory({ cwd = process.cwd() } = {}) {
  const root = await repositoryRoot(cwd);
  const commits = (await git(root, ["rev-list", "--all"])).toString("utf8").split("\n").filter(Boolean);
  const findings = [];
  const privatePaths = new Set();
  const inspected = new Set();
  const contentFindings = new Map();
  for (const commit of commits) {
    if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new InspectionError();
    const tree = await git(root, ["ls-tree", "--full-tree", "-r", "-z", commit]);
    for (const record of tree.toString("utf8").split("\0").filter(Boolean)) {
      const tab = record.indexOf("\t");
      const [mode, kind, object] = record.slice(0, tab).split(" ");
      if (tab < 0 || !/^[0-9a-f]{40,64}$/.test(object) || !["blob", "commit"].includes(kind)) throw new InspectionError();
      const path = record.slice(tab + 1);
      const inspection = `${object}\0${path}`;
      if (inspected.has(inspection)) continue;
      inspected.add(inspection);
      if (isPrivatePath(path)) {
        if (!privatePaths.has(path)) findings.push({ type: "private-path", path: normalizedPath(path), line: 1 });
        privatePaths.add(path);
      } else if (mode === "160000" || kind !== "blob") {
        findings.push({ type: "uninspected-submodule", path: normalizedPath(path), line: 1 });
      } else {
        if (!contentFindings.has(object)) {
          // Only store redacted findings, not all historical file buffers.
          contentFindings.set(object, inspectFile("historical-blob", await git(root, ["cat-file", "blob", object])));
        }
        findings.push(...contentFindings.get(object).map((finding) => ({ ...finding, path: normalizedPath(path) })));
      }
    }
  }
  return uniqueFindings(findings);
}

function uniqueFindings(findings) {
  const unique = new Map(findings.map((finding) => [JSON.stringify(finding), finding]));
  return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.type.localeCompare(b.type));
}

/** --staged scans the complete index, not HEAD or the working tree. */
export async function scanRepository({ cwd = process.cwd(), staged = false, history = false } = {}) {
  if (history && staged) throw new InspectionError();
  if (history) return scanHistory({ cwd });
  const root = await repositoryRoot(cwd);
  const index = await git(root, ["ls-files", "--stage", "-z"]);
  const entries = index.toString("utf8").split("\0").filter(Boolean).map((record) => {
    const tab = record.indexOf("\t");
    const [mode, object, stage] = record.slice(0, tab).split(" ");
    if (tab < 0 || !/^[0-9a-f]{40,64}$/.test(object) || !/^[0-3]$/.test(stage)) throw new InspectionError();
    return { mode, object, stage, path: record.slice(tab + 1) };
  });
  const findings = [];
  const inspected = new Set();
  for (const entry of entries) {
    if (entry.stage !== "0") findings.push({ type: "unmerged-index", path: normalizedPath(entry.path), line: 1 });
    if (isPrivatePath(entry.path)) {
      findings.push({ type: "private-path", path: normalizedPath(entry.path), line: 1 });
      continue;
    }
    if (entry.mode === "160000") {
      findings.push({ type: "uninspected-submodule", path: normalizedPath(entry.path), line: 1 });
      continue;
    }
    let content;
    if (staged) {
      content = await git(root, ["cat-file", "blob", entry.object]);
    } else {
      if (inspected.has(entry.path)) continue;
      inspected.add(entry.path);
      const absolute = resolve(root, entry.path);
      try {
        const metadata = await lstat(absolute);
        // Git stores a symlink's target text, not the content of the target.
        // Never follow a tracked symlink into an external/private file.
        if (metadata.isSymbolicLink()) content = await readlink(absolute, { encoding: "buffer" });
        else if (metadata.isFile() && metadata.size <= MAX_BYTES) content = await readFile(absolute);
        else {
          findings.push({ type: "uninspectable-file", path: normalizedPath(entry.path), line: 1 });
          continue;
        }
      } catch (error) {
        // Working deletions have no new content. Index mode still checks blobs.
        if (error.code === "ENOENT") continue;
        throw new InspectionError();
      }
    }
    findings.push(...inspectFile(entry.path, content));
  }
  return uniqueFindings(findings);
}

/** JSON escaping prevents filenames with newlines from forging diagnostics. */
export function formatFindings(findings) {
  return findings.map(({ type, path, line }) => JSON.stringify({ type, path, line })).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/secret-guard.mjs [--staged | --history]\nDefault: tracked working files. --staged: complete index. --history: reachable local refs/HEAD, without network or reflog-only objects.\n");
    return;
  }
  if (args.some((arg) => !["--staged", "--history"].includes(arg)) || args.length > 1) {
    process.stderr.write(formatFindings([{ type: "invalid-arguments", path: ".", line: 1 }]) + "\n");
    process.exitCode = 2;
    return;
  }
  try {
    const findings = await scanRepository({ staged: args.includes("--staged"), history: args.includes("--history") });
    if (findings.length) {
      process.stderr.write(formatFindings(findings) + "\n");
      process.exitCode = 1;
    } else {
      process.stdout.write("Secret guard passed.\n");
    }
  } catch {
    process.stderr.write(formatFindings([{ type: "scan-error", path: ".", line: 1 }]) + "\n");
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
