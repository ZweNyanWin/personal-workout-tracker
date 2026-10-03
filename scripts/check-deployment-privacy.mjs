import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { inspectFile } from "./secret-guard.mjs";

const PRIVATE_DIRECTORIES = new Set([
  "ai", "connector", "docs", "scripts", "supabase", "node_modules", ".next",
  "out", "build", "coverage", ".git", ".vercel", ".ssh", ".codex", ".githooks", ".github",
]);
const SERVER_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY",
  "COACH_GATEWAY_TOKEN", "COACH_REMOTE_TOKEN", "GATEWAY_TOKEN", "POWERBUILD_AI_TOKEN",
  "VERCEL_TOKEN", "VERCEL_API_TOKEN", "VERCEL_ACCESS_TOKEN", "VERCEL_APP_CLIENT_SECRET", "VERCEL_OIDC_TOKEN",
  "GITHUB_TOKEN", "GITHUB_PAT", "GH_TOKEN",
];
const TEXT_ASSET = /\.(?:[cm]?js|map|json|html?|txt|css|svg|xml|webmanifest)$/i;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/i;

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function filesUnder(directory) {
  const files = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...await filesUnder(file));
    else if (item.isFile() || item.isSymbolicLink()) files.push(file);
  }
  return files;
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

/** Local cached CLI only: never invokes deployment, login, or any network call. */
export async function loadOfflineVercelCollector(root, packageOverride = process.env.VERCEL_CLI_PACKAGE) {
  const candidates = [];
  if (packageOverride) candidates.push(path.resolve(packageOverride));
  else {
    try {
      const require = createRequire(path.join(root, "package.json"));
      candidates.push(path.dirname(require.resolve("vercel/package.json")));
    } catch { /* Vercel is commonly installed through npm exec instead. */ }
    const cache = path.join(process.env.HOME || "", ".npm", "_npx");
    if (process.env.HOME && await exists(cache)) {
      for (const item of await fs.readdir(cache, { withFileTypes: true })) {
        if (item.isDirectory()) candidates.push(path.join(cache, item.name, "node_modules", "vercel"));
      }
    }
  }
  const installed = [];
  for (const candidate of candidates) {
    try {
      const metadata = JSON.parse(await fs.readFile(path.join(candidate, "package.json"), "utf8"));
      if (metadata.name === "vercel") installed.push({ root: candidate, version: metadata.version });
    } catch { /* A cache entry may belong to a different package. */ }
  }
  installed.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  for (const installation of installed) {
    const chunks = path.join(installation.root, "dist", "chunks");
    if (!await exists(chunks)) continue;
    for (const name of await fs.readdir(chunks)) {
      if (!name.endsWith(".js")) continue;
      const modulePath = path.join(chunks, name);
      const source = await fs.readFile(modulePath, "utf8");
      if (!source.includes("async function inspectDeploymentFiles") || !source.includes("require_dist2 as require_dist")) continue;
      const loaded = await import(pathToFileURL(modulePath).href);
      const api = loaded.require_dist?.();
      if (typeof api?.buildFileTree === "function" && typeof api.inspectDeploymentFiles === "function") {
        return { api, version: installation.version };
      }
    }
  }
  throw new Error("No compatible local Vercel file collector found. Install/cache Vercel CLI or set VERCEL_CLI_PACKAGE to its package directory; this check never downloads it.");
}

export function sensitiveUploadReason(filename) {
  const normalized = filename.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) return "upload-path-outside-project";
  const parts = normalized.split("/");
  const lowerParts = parts.map(part => part.toLowerCase());
  if (lowerParts.some(part => part.startsWith(".env"))) return "environment-file";
  // Vercel deliberately adds routes metadata to a source upload when present.
  if (normalized === ".vercel/routes.json") return null;
  if (PRIVATE_DIRECTORIES.has(lowerParts[0]) || lowerParts.some(part => [".git", "node_modules", "__pycache__"].includes(part))) {
    return "private-local-directory";
  }
  if (/\.(?:gguf|safetensors|ckpt|pth|pt|onnx)$/i.test(normalized)) return "local-model-artifact";
  if (/\.(?:log|tsbuildinfo)$/i.test(normalized)) return "local-build-artifact";
  if (/\.(?:pem|key)$/i.test(normalized) || /(?:^|\/)[^/]*(?:id_rsa|id_ed25519)$/i.test(normalized)) return "private-key-file";
  return null;
}

/** This is the same file-tree routine used by Vercel's deployment collector. */
export async function collectUploadManifest(root, collector) {
  root = await fs.realpath(root);
  const tree = await collector.api.buildFileTree(root, { isDirectory: true, prebuilt: false }, () => {});
  const entries = [];
  for (const file of tree.fileList) {
    const stat = await fs.lstat(file);
    const entry = { path: relative(root, file), directory: stat.isDirectory(), symlink: stat.isSymbolicLink() };
    if (entry.symlink) {
      // Inspect link metadata, never follow a link into secret contents.
      entry.target = relative(root, path.resolve(path.dirname(file), await fs.readlink(file)));
    }
    entries.push(entry);
  }
  return { entries, version: collector.version, warning: Boolean(tree.warning) };
}

export function auditUploadManifest(manifest) {
  const findings = [];
  for (const entry of manifest.entries) {
    // The CLI retains zero-byte directory entries after ignoring their contents.
    if (entry.directory) continue;
    const reason = sensitiveUploadReason(entry.path);
    if (reason) findings.push({ file: entry.path, reason });
    if (entry.symlink) {
      const targetReason = sensitiveUploadReason(entry.target);
      if (targetReason) findings.push({ file: entry.path, reason: `symlink-${targetReason}` });
    }
  }
  return findings;
}

function decodeJavascriptEscapes(text) {
  return text.replace(/\\u(?:\{([\da-f]{1,6})\}|([\da-f]{4}))/gi, (match, braces, plain) => {
    const code = Number.parseInt(braces || plain, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).replace(/\\x([\da-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** Returns categories only, never matched tokens, payloads, or source excerpts. */
export function browserSecretReasons(text) {
  const decoded = decodeJavascriptEscapes(text);
  const reasons = new Set();
  if (SERVER_ENV_NAMES.some(name => decoded.includes(name))) reasons.add("server-secret-environment-name");
  for (const finding of inspectFile("browser-artifact.js", decoded)) reasons.add(finding.type);
  return [...reasons].sort();
}

export async function auditBrowserBuild(root, { requireFresh = true } = {}) {
  const findings = [];
  const buildId = path.join(root, ".next", "BUILD_ID");
  const staticRoot = path.join(root, ".next", "static");
  if (!await exists(buildId) || !await exists(staticRoot)) {
    return { findings: [{ file: ".next", reason: "production-browser-build-missing" }], textFiles: 0, javascriptFiles: 0 };
  }
  const buildTime = (await fs.stat(buildId)).mtimeMs;
  if (requireFresh) {
    const source = [];
    for (const directory of ["app", "components", "lib", "types", "public"]) {
      if (await exists(path.join(root, directory))) source.push(...await filesUnder(path.join(root, directory)));
    }
    for (const name of ["package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "yarn.lock", "bun.lock", "bun.lockb", ".npmrc", "next.config.ts", "next.config.js", "next.config.mjs", "proxy.ts", "tsconfig.json", "postcss.config.mjs", "postcss.config.js"]) {
      if (await exists(path.join(root, name))) source.push(path.join(root, name));
    }
    for (const file of source) {
      if ((await fs.lstat(file)).mtimeMs > buildTime) findings.push({ file: relative(root, file), reason: "browser-build-older-than-source" });
    }
  }
  const candidates = await filesUnder(staticRoot);
  if (await exists(path.join(root, "public"))) candidates.push(...await filesUnder(path.join(root, "public")));
  let textFiles = 0;
  let javascriptFiles = 0;
  for (const file of candidates) {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) {
      findings.push({ file: relative(root, file), reason: "browser-asset-symlink" });
      continue;
    }
    if (!TEXT_ASSET.test(file)) continue;
    textFiles++;
    if (file.startsWith(`${staticRoot}${path.sep}`) && /\.[cm]?js$/i.test(file)) javascriptFiles++;
    const reasons = browserSecretReasons(await fs.readFile(file, "utf8"));
    for (const reason of reasons) findings.push({ file: relative(root, file), reason });
  }
  if (!javascriptFiles) findings.push({ file: ".next/static", reason: "browser-javascript-build-empty" });
  return { findings, textFiles, javascriptFiles };
}

export async function auditServerBoundaries(root) {
  const findings = [];
  const admin = path.join(root, "lib", "supabase", "admin.ts");
  if (!await exists(admin)) findings.push({ file: "lib/supabase/admin.ts", reason: "admin-client-boundary-missing" });
  else if (!sourceBoundary(await fs.readFile(admin, "utf8"), admin).serverOnly) {
    findings.push({ file: "lib/supabase/admin.ts", reason: "admin-client-server-only-marker-missing" });
  }
  for (const directory of ["app", "components", "lib"]) {
    const dir = path.join(root, directory);
    if (!await exists(dir)) continue;
    for (const file of await filesUnder(dir)) {
      if (!SOURCE_FILE.test(file) || (await fs.lstat(file)).isSymbolicLink()) continue;
      const source = await fs.readFile(file, "utf8");
      const boundary = sourceBoundary(source, file);
      if (boundary.client && browserSecretReasons(source).length) {
        findings.push({ file: relative(root, file), reason: "client-module-server-secret-access" });
      }
      const serverRoute = /^app\/.*\/route\.[cm]?[jt]s$/.test(relative(root, file));
      if (file !== admin && boundary.ambientEnvironment && boundary.backendSecretName
          && !boundary.serverOnly && !boundary.server && !serverRoute) {
        findings.push({ file: relative(root, file), reason: "server-secret-module-marker-missing" });
      }
    }
  }
  return findings;
}

function sourceBoundary(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const result = { client: false, server: false, serverOnly: false, ambientEnvironment: false, backendSecretName: false };
  for (const statement of tree.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") result.client = true;
    if (statement.expression.text === "use server") result.server = true;
  }
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && !statement.importClause && ts.isStringLiteral(statement.moduleSpecifier)
        && statement.moduleSpecifier.text === "server-only") result.serverOnly = true;
  }
  function visit(node) {
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && SERVER_ENV_NAMES.some(name => node.text.includes(name))) {
      result.backendSecretName = true;
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === "process" && node.name.text === "env") result.ambientEnvironment = true;
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === "process" && ts.isStringLiteral(node.argumentExpression)
        && node.argumentExpression.text === "env") result.ambientEnvironment = true;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

export async function checkDeploymentPrivacy(root, collector) {
  const manifest = await collectUploadManifest(root, collector || await loadOfflineVercelCollector(root));
  const [browser, boundaries] = await Promise.all([auditBrowserBuild(root), auditServerBoundaries(root)]);
  const findings = [...auditUploadManifest(manifest), ...browser.findings, ...boundaries];
  return {
    findings,
    vercelVersion: manifest.version,
    uploadFiles: manifest.entries.filter(entry => !entry.directory).length,
    directoryPlaceholders: manifest.entries.filter(entry => entry.directory).length,
    browserTextFiles: browser.textFiles,
    browserJavascriptFiles: browser.javascriptFiles,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkDeploymentPrivacy(path.resolve(process.argv[2] || process.cwd()));
    // Intentionally report only paths, categories, and counts. Never print file contents.
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.findings.length) process.exitCode = 1;
  } catch {
    process.stderr.write("Deployment privacy check could not complete. Use an existing local Vercel CLI package and a fresh production build. No deployment was attempted.\n");
    process.exitCode = 1;
  }
}
