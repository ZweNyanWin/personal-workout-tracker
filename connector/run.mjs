#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import net from 'node:net';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const privateDir = path.join(os.homedir(), 'workout-ai', 'powerbuild-connector');
const configPath = path.join(privateDir, 'config.json');
const lockPath = path.join(privateDir, 'launcher.lock.json');
const runtimePath = path.join(privateDir, 'runtime.json');
const backgroundLogPath = path.join(privateDir, 'launcher.log');
const localGateway = 'http://127.0.0.1:11435';
const statusBytesLimit = 16384;
const dnsCache = new Map();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function parseLauncherFlags(flags) {
  const accepted = new Set(['--help', '--status', '--stop', '--no-publish', '--background']);
  const exclusive = flags.some((flag) => ['--help', '--status', '--stop'].includes(flag));
  if (flags.some((flag) => !accepted.has(flag)) || new Set(flags).size !== flags.length || (exclusive && flags.length !== 1)) {
    throw new Error('Use --status, --stop, --no-publish, or --background. Only --background and --no-publish may be combined.');
  }
  return new Set(flags);
}

/** Detach only the normal launcher; its own gateway, tunnel and keep-awake lifecycle stays unchanged. */
export async function launchBackground({ launcherScript, launcherArgs = [], projectRoot, logPath }) {
  const log = await open(logPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const stat = await log.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('The background log must be a private file owned by you.');
    }
    await log.write(`\nPowerBuild launcher requested at ${new Date().toISOString()}\n`);
    const launcher = spawn(process.execPath, [launcherScript, ...launcherArgs], {
      cwd: projectRoot, detached: true, stdio: ['ignore', log.fd, log.fd],
      env: { ...process.env, POWERBUILD_LAUNCHER_BACKGROUND: '1' },
    });
    await new Promise((resolve, reject) => {
      launcher.once('spawn', resolve);
      launcher.once('error', () => reject(new Error('The background launcher could not start.')));
    });
    launcher.unref();
    return launcher.pid;
  } finally { await log.close(); }
}

export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid connector configuration.');
  if (typeof value.token !== 'string' || value.token.length < 43 || /\s/.test(value.token)) {
    throw new Error('The protected connector token is missing or invalid.');
  }
  for (const name of ['cloudflaredPath', 'projectRoot']) {
    if (typeof value[name] !== 'string' || !path.isAbsolute(value[name])) throw new Error(`Configuration requires an absolute ${name}.`);
  }
  if (typeof value.vercelScope !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value.vercelScope)) throw new Error('Invalid Vercel scope.');
  if (typeof value.vercelProjectId !== 'string' || !/^prj_[a-zA-Z0-9]+$/.test(value.vercelProjectId)) throw new Error('Invalid Vercel project.');
  let appUrl;
  try { appUrl = new URL(value.appUrl); } catch { throw new Error('Invalid PowerBuild app URL.'); }
  if (appUrl.protocol !== 'https:' || !appUrl.hostname.endsWith('.vercel.app') || appUrl.username || appUrl.password || appUrl.port || appUrl.search || appUrl.hash || appUrl.pathname !== '/') {
    throw new Error('The PowerBuild app URL must be its HTTPS Vercel root URL.');
  }
  return { ...value, appUrl: appUrl.origin };
}

export function extractTunnelUrl(output) {
  const matches = output.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=$|[\s|"'<>])/gi) ?? [];
  for (const candidate of matches) {
    const url = new URL(candidate);
    if (url.protocol === 'https:' && /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/i.test(url.hostname)) return url.origin;
  }
  return null;
}

function isRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function readJson(file, optional = false) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error(`Connector file must be owned by you and readable only by you: ${path.basename(file)}.`);
    }
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new Error(`Invalid connector file: ${path.basename(file)}.`);
    throw error;
  }
}

async function processStamp(pid) {
  const { stdout } = await execFileAsync('/bin/ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], { maxBuffer: 4096, timeout: 2000 });
  return stdout.trim();
}

async function ownsProcess(lock) {
  if (!lock || !isRunning(lock.pid) || lock.scriptPath !== scriptPath || typeof lock.processStamp !== 'string') return false;
  try {
    return await processStamp(lock.pid) === lock.processStamp;
  } catch { return false; }
}

async function removeOwnFile(file, key, expected) {
  const current = await readJson(file, true);
  if (current?.[key] === expected) await unlink(file).catch((error) => { if (error.code !== 'ENOENT') throw error; });
}

async function claimLock(lock) {
  try {
    await writeFile(lockPath, JSON.stringify(lock), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readJson(lockPath);
    if (isRunning(existing.pid)) throw new Error('A connector launcher already has this lock. Use --status or --stop; do not start a second copy.');
    await removeOwnFile(lockPath, 'id', existing.id);
    await writeFile(lockPath, JSON.stringify(lock), { flag: 'wx', mode: 0o600 });
  }
}

async function portIsOpen() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 11435 });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(new Error('Unable to check the local connector port.'));
    });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Local connector port check timed out.')); });
  });
}

function parsedStatus(status, text) {
  let body = null;
  try { body = JSON.parse(text); } catch { /* Non-JSON Cloudflare error pages are not gateway health. */ }
  return { status, body };
}

async function boundedText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > statusBytesLimit) { await reader.cancel(); throw new Error('Gateway status response was too large.'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

async function publicAddress(hostname) {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.address;
  const query = new URL('https://cloudflare-dns.com/dns-query');
  query.searchParams.set('name', hostname);
  query.searchParams.set('type', 'A');
  const response = await fetch(query, {
    headers: { accept: 'application/dns-json' },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('The public tunnel DNS lookup failed.');
  const answer = JSON.parse(await boundedText(response));
  const address = answer.Status === 0 && answer.Answer?.find((record) => {
    if (record.type !== 1 || typeof record.data !== 'string' || !net.isIPv4(record.data)) return false;
    const [first, second, third] = record.data.split('.').map(Number);
    return first !== 0 && first !== 10 && first !== 127 && first < 224 &&
      !(first === 100 && second >= 64 && second <= 127) &&
      !(first === 169 && second === 254) &&
      !(first === 172 && second >= 16 && second <= 31) &&
      !(first === 192 && (second === 168 || (second === 0 && [0, 2].includes(third)))) &&
      !(first === 198 && ([18, 19].includes(second) || (second === 51 && third === 100))) &&
      !(first === 203 && second === 0 && third === 113);
  })?.data;
  if (!address) throw new Error('The public tunnel has no public IPv4 DNS record.');
  dnsCache.set(hostname, { address, expiresAt: Date.now() + 30000 });
  return address;
}

async function statusWithDnsFallback(base, headers) {
  const url = new URL(base);
  const address = await publicAddress(url.hostname);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: url.hostname,
      servername: url.hostname,
      port: 443,
      path: '/v1/status',
      method: 'GET',
      headers,
      lookup(_hostname, options, callback) {
        if (options.all) callback(null, [{ address, family: 4 }]);
        else callback(null, address, 4);
      },
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > statusBytesLimit) request.destroy(new Error('Gateway status response was too large.'));
        else chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => resolve(parsedStatus(response.statusCode, Buffer.concat(chunks).toString('utf8'))));
    });
    const timeout = setTimeout(() => request.destroy(new Error('The protected HTTPS status check timed out.')), 5000);
    request.once('close', () => clearTimeout(timeout));
    request.once('error', reject);
    request.end();
  });
}

/** Fixed status route only; DNS fallback preserves HTTPS hostname verification. */
export async function requestGatewayStatus(base, token) {
  const isPublicTunnel = extractTunnelUrl(base) === base;
  if (base !== localGateway && !isPublicTunnel) throw new Error('Unsupported gateway status address.');
  const headers = token === undefined ? {} : { Authorization: `Bearer ${token}` };
  try {
    const response = await fetch(`${base}/v1/status`, {
      headers,
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    return parsedStatus(response.status, await boundedText(response));
  } catch (error) {
    if (isPublicTunnel && ['ENOTFOUND', 'EAI_AGAIN'].includes(error.cause?.code)) {
      return statusWithDnsFallback(base, headers);
    }
    throw error;
  }
}

async function statusAt(base, token) {
  try {
    const { status, body } = await requestGatewayStatus(base, token);
    return status === 200 && body?.online === true && body.model === 'workout-coach' && body.experimental === true ? body : null;
  } catch { return null; }
}

async function waitForStatus(base, token, isAlive, milliseconds, failureMessage) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('The connector stopped before it was ready.');
    const status = await statusAt(base, token);
    if (status) return status;
    await sleep(750);
  }
  throw new Error(failureMessage);
}

async function main() {
  const flags = parseLauncherFlags(process.argv.slice(2));
  if (flags.has('--help')) {
    console.log('PowerBuild personal Mac AI connector\n\nnode connector/run.mjs                Start in this terminal and update the deployed connection\nnode connector/run.mjs --background  Start in the background; this terminal may close\nnode connector/run.mjs --status      Check the launcher and coach connection\nnode connector/run.mjs --stop        Stop this launcher and its own children\nnode connector/run.mjs --no-publish  Start locally; do not change Vercel\n\nBackground progress is saved privately at $HOME/workout-ai/powerbuild-connector/launcher.log. Keep the Mac awake with its lid open. Stop with --stop, or Control-C for a foreground launcher.');
    return;
  }

  if (flags.has('--status') || flags.has('--stop')) {
    const lock = await readJson(lockPath, true);
    if (!await ownsProcess(lock)) {
      console.log('PowerBuild launcher is not running.');
      if (lock && isRunning(lock.pid)) console.log('The lock belongs to another process; it was left untouched.');
      if (await portIsOpen()) console.log('Port 11435 is still occupied. Existing AI services may remain active, but the launcher cannot manage them. They were left untouched; do not start a second copy.');
      return;
    }
    if (flags.has('--stop')) {
      process.kill(lock.pid, 'SIGTERM');
      const deadline = Date.now() + 10000;
      while (isRunning(lock.pid) && Date.now() < deadline) await sleep(200);
      console.log(isRunning(lock.pid) ? 'Stop requested; wait for the launcher terminal to finish.' : 'PowerBuild connector stopped. Ollama was left running.');
      return;
    }
    const config = validateConfig(await readJson(configPath));
    const runtime = await readJson(runtimePath, true);
    if (runtime?.pid === lock.pid && typeof runtime.url === 'string' && extractTunnelUrl(runtime.url) === runtime.url) {
      const gatewayStatus = await statusAt(runtime.url, config.token);
      console.log(gatewayStatus ? `PowerBuild connector is running${gatewayStatus.busy ? '; the coach is busy' : ' and the coach is online'}.` : 'PowerBuild launcher is running, but its coach connection is unavailable. Check Ollama and this Mac’s internet connection.');
    } else {
      console.log('PowerBuild connector is starting.');
    }
    console.log(`Open PowerBuild: ${config.appUrl}`);
    return;
  }

  if (process.platform !== 'darwin') throw new Error('This launcher is configured for the personal macOS computer.');
  const config = validateConfig(await readJson(configPath));
  if (await realpath(config.projectRoot) !== await realpath(path.join(path.dirname(scriptPath), '..'))) throw new Error('The connector configuration points to a different project.');
  await access(config.cloudflaredPath, constants.X_OK);
  await access(path.join(config.projectRoot, 'connector', 'gateway.mjs'), constants.R_OK);
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  const previousRuntime = await readJson(runtimePath, true);
  if (previousRuntime && isRunning(previousRuntime.pid)) throw new Error('A previous connector runtime is still active. Use --status or --stop first.');
  if (flags.has('--background')) {
    const existing = await readJson(lockPath, true);
    if (existing && isRunning(existing.pid)) throw new Error('A connector launcher already has this lock. Use --status or --stop; do not start a second copy.');
    if (await portIsOpen()) throw new Error('Port 11435 is already occupied. Existing services were left untouched; check --status before restarting.');
    const pid = await launchBackground({
      launcherScript: scriptPath, launcherArgs: flags.has('--no-publish') ? ['--no-publish'] : [],
      projectRoot: config.projectRoot, logPath: backgroundLogPath,
    });
    // Confirm the normal child acquired its own lock before reporting a start.
    const deadline = Date.now() + 5000;
    let started = false;
    while (Date.now() < deadline && isRunning(pid)) {
      const current = await readJson(lockPath, true);
      if (current?.pid === pid && await ownsProcess(current)) { started = true; break; }
      await sleep(100);
    }
    if (!started) throw new Error('The background launcher did not finish starting. Check $HOME/workout-ai/powerbuild-connector/launcher.log.');
    console.log(`PowerBuild launcher started in the background (PID ${pid}). This terminal may close.`);
    console.log('Connection setup and deployment continue in the background. Check with node connector/run.mjs --status.');
    console.log('Progress log: $HOME/workout-ai/powerbuild-connector/launcher.log');
    console.log(`Open PowerBuild: ${config.appUrl}`);
    return;
  }
  const lock = { pid: process.pid, id: randomUUID(), scriptPath, nodePath: process.execPath, processStamp: await processStamp(process.pid), startedAt: new Date().toISOString() };
  await claimLock(lock);
  const children = new Set();
  let stopping = false;
  let ready = false;
  let resolveExit;
  const finished = new Promise((resolve) => { resolveExit = resolve; });

  function child(command, args, options = {}) {
    const result = spawn(command, args, { cwd: config.projectRoot, stdio: ['pipe', 'pipe', 'pipe'], detached: true, ...options });
    children.add(result);
    return result;
  }

  function signalChild(result, signal) {
    if (!result.pid) return;
    try { process.kill(-result.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }

  async function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const result of children) signalChild(result, 'SIGTERM');
    const deadline = Date.now() + 5000;
    while ([...children].some((result) => result.exitCode === null && result.signalCode === null) && Date.now() < deadline) await sleep(100);
    for (const result of children) if (result.exitCode === null && result.signalCode === null) signalChild(result, 'SIGKILL');
    await removeOwnFile(runtimePath, 'pid', process.pid);
    await removeOwnFile(lockPath, 'id', lock.id);
    process.exitCode = code;
    resolveExit();
  }

  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });

  function watch(result, label) {
    result.once('error', () => {
      if (!stopping) { console.error(`${label} could not start. The connector is stopping.`); void shutdown(1); }
    });
    result.once('exit', () => {
      if (!stopping) { console.error(`${label} stopped. The connector is offline.`); void shutdown(1); }
    });
  }

  async function runVercel(args, input) {
    if (stopping) throw new Error('Connector startup was interrupted.');
    const result = child('npx', ['--yes', 'vercel@62.0.0', ...args, '--scope', config.vercelScope, '--non-interactive', '--no-color']);
    result.stdout.resume();
    result.stderr.resume();
    result.stdin.on('error', () => {});
    result.stdin.end(input ?? '');
    const exitCode = await new Promise((resolve, reject) => {
      result.once('error', () => reject(new Error('Vercel CLI could not start.')));
      result.once('exit', (code) => resolve(code));
    });
    if (exitCode !== 0) throw new Error('Vercel could not update the deployed connection. Run npx --yes vercel@62.0.0 login normally, then restart. Confirm the existing production COACH_GATEWAY_URL variable and project access if sign-in is already active.');
  }

  try {
    if (await portIsOpen()) throw new Error('Port 11435 is already occupied. The launcher will not stop that process.');
    console.log('Starting the Mac AI gateway and checking Ollama…');
    const gateway = child(process.execPath, [path.join(config.projectRoot, 'connector', 'gateway.mjs')], {
      env: { ...process.env, POWERBUILD_GATEWAY_TOKEN: config.token, POWERBUILD_GATEWAY_PORT: '11435' },
    });
    gateway.stdout.resume();
    gateway.stderr.resume();
    watch(gateway, 'The local AI gateway');
    await waitForStatus(localGateway, config.token, () => !stopping && gateway.exitCode === null && gateway.signalCode === null, 30000,
      'The connector could not reach the original workout-coach model. Check that Ollama is running and the model is installed.');

    console.log('Ollama’s original workout-coach model is online. Starting the protected HTTPS connection…');
    const caffeinate = child('/usr/bin/caffeinate', ['-di', '-w', String(process.pid)], { stdio: 'ignore' });
    watch(caffeinate, 'Mac keep-awake');
    const tunnel = child(config.cloudflaredPath, ['tunnel', '--url', localGateway, '--no-autoupdate']);
    watch(tunnel, 'The protected HTTPS connection');
    const tunnelUrl = await new Promise((resolve, reject) => {
      let pending = '';
      const timeout = setTimeout(() => reject(new Error('The HTTPS connection did not start. Check this Mac’s internet connection.')), 45000);
      function consume(buffer) {
        pending = (pending + buffer.toString()).slice(-8192);
        const found = extractTunnelUrl(pending);
        if (found) {
          clearTimeout(timeout);
          tunnel.stdout.off('data', consume);
          tunnel.stderr.off('data', consume);
          tunnel.stdout.resume();
          tunnel.stderr.resume();
          resolve(found);
        }
      }
      tunnel.stdout.on('data', consume);
      tunnel.stderr.on('data', consume);
      tunnel.once('error', () => { clearTimeout(timeout); reject(new Error('The HTTPS connection could not start.')); });
      tunnel.once('exit', () => { clearTimeout(timeout); reject(new Error('The HTTPS connection stopped during startup.')); });
    });
    console.log('The HTTPS connection was created. Verifying its private authentication…');
    await waitForStatus(tunnelUrl, config.token, () => !stopping && tunnel.exitCode === null && tunnel.signalCode === null, 45000,
      'The protected HTTPS connection was not reachable. Check this Mac’s internet connection and try again.');
    const unauthorized = await requestGatewayStatus(tunnelUrl);
    if (unauthorized.status !== 401) throw new Error('The gateway did not enforce its private token. The connection was stopped.');
    if (stopping) throw new Error('Connector startup was interrupted.');
    await writeFile(runtimePath, JSON.stringify({ pid: process.pid, url: tunnelUrl, startedAt: lock.startedAt }), { mode: 0o600 });
    console.log('Your Mac’s protected AI connection is ready.');
    if (flags.has('--no-publish')) {
      console.log('Vercel was left unchanged. This mode is for initial setup and local verification.');
    } else {
      console.log('Updating PowerBuild’s production connection and rebuilding its existing hosted source. This can take a few minutes.');
      await runVercel(['env', 'update', 'COACH_GATEWAY_URL', 'production', '--project', config.vercelProjectId, '--yes'], tunnelUrl);
      await runVercel(['redeploy', config.appUrl, '--target', 'production']);
      console.log('PowerBuild’s deployed AI connection is updated.');
    }
    ready = true;
    console.log(`Open PowerBuild: ${config.appUrl}`);
    console.log(process.env.POWERBUILD_LAUNCHER_BACKGROUND === '1'
      ? 'The launcher is running in the background. Keep the Mac awake with its lid open. Stop with node connector/run.mjs --stop.'
      : 'Keep this terminal open and the Mac awake with its lid open. Stop with Control-C.');
    await finished;
  } catch (error) {
    if (!stopping) console.error(error.message);
    await shutdown(stopping ? process.exitCode ?? 0 : 1);
    await finished;
  } finally {
    if (ready) console.log('PowerBuild’s Mac AI connection stopped. Ollama was left running.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
