import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { launchBackground, parseLauncherFlags } from './run.mjs';

const execFileAsync = promisify(execFile);

async function directory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'powerbuild-launcher-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('background may combine only with no-publish; control commands remain exclusive', () => {
  assert.deepEqual([...parseLauncherFlags(['--background', '--no-publish'])], ['--background', '--no-publish']);
  assert.equal(parseLauncherFlags([]).size, 0);
  for (const flags of [['--background', '--stop'], ['--status', '--no-publish'], ['--help', '--background'], ['--background', '--background'], ['--unknown']]) {
    assert.throws(() => parseLauncherFlags(flags), /Only --background and --no-publish/);
  }
});

test('a detached launcher survives its starting process and logs privately', async (t) => {
  const root = await directory(t);
  const writer = path.join(root, 'fixture-writer.mjs');
  const parent = path.join(root, 'fixture-parent.mjs');
  const logPath = path.join(root, 'launcher.log');
  await writeFile(writer, "console.log('Fixture launcher started'); setInterval(() => console.log('Fixture heartbeat'), 50); setTimeout(() => process.exit(0), 5000);\n");
  await writeFile(logPath, 'Earlier private progress\n', { mode: 0o600 });
  await writeFile(parent, `import { launchBackground } from ${JSON.stringify(new URL('./run.mjs', import.meta.url).href)};
const pid = await launchBackground(${JSON.stringify({ launcherScript: writer, projectRoot: root, logPath })});
console.log(pid);
`);
  const { stdout } = await execFileAsync(process.execPath, [parent], { timeout: 3000 });
  const pid = Number(stdout.trim());
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  t.after(async () => {
    // Stop only this newly created fixture process, even if a test fails.
    try {
      const { stdout: command } = await execFileAsync('/bin/ps', ['-p', String(pid), '-o', 'command=']);
      if (command.trim() === `${process.execPath} ${writer}`) process.kill(pid, 'SIGTERM');
    } catch { /* The fixture also stops itself after five seconds. */ }
  });
  let text = '';
  for (let attempt = 0; attempt < 30; attempt++) {
    text = await readFile(logPath, 'utf8');
    if (text.includes('Fixture heartbeat')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  process.kill(pid, 0);
  assert.match(text, /Earlier private progress/);
  assert.match(text, /Fixture launcher started/);
  assert.match(text, /Fixture heartbeat/);
  assert.equal((await stat(logPath)).mode & 0o777, 0o600);
});

test('background startup refuses a shared log before appending or spawning', async (t) => {
  const root = await directory(t);
  const logPath = path.join(root, 'launcher.log');
  await writeFile(logPath, 'Preserved\n');
  await chmod(logPath, 0o644);
  await assert.rejects(launchBackground({ launcherScript: 'unused', projectRoot: root, logPath }), /private file owned by you/);
  assert.equal(await readFile(logPath, 'utf8'), 'Preserved\n');
});

test('background startup refuses a symlink log and leaves its target unchanged', async (t) => {
  const root = await directory(t);
  const target = path.join(root, 'target.log');
  const logPath = path.join(root, 'launcher.log');
  await writeFile(target, 'Preserved target\n', { mode: 0o600 });
  await symlink(target, logPath);
  await assert.rejects(launchBackground({ launcherScript: 'unused', projectRoot: root, logPath }));
  assert.equal(await readFile(target, 'utf8'), 'Preserved target\n');
});
