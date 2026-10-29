// Windows equivalent of the Linux install lock, bounded npm ci and fingerprint.
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.sites-runtime');
mkdirSync(runtime, { recursive: true });
const lock = path.join(runtime, 'install-portable.lock');
const descriptor = openSync(lock, 'wx');
try {
  if (!process.env.npm_execpath) throw new Error('Run through npm run install:ci.');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^npm_config_cache$/i.test(key)) delete env[key];
  env.npm_config_cache = path.join(runtime, 'npm-cache');
  env.npm_config_fetch_retries = '0';
  env.npm_config_fetch_timeout = '30000';
  const child = spawn(process.execPath, [process.env.npm_execpath, 'ci', '--no-fund'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 480000);
  let code;
  try {
    code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  } finally { clearTimeout(timer); }
  if (timedOut || code !== 0) throw new Error(timedOut ? 'npm ci exceeded 8 minutes.' : `npm ci exited with ${code}.`);
  const lockfile_sha256 = createHash('sha256').update(readFileSync(path.join(root, 'package-lock.json'))).digest('hex');
  writeFileSync(path.join(root, 'node_modules/.sites-install.json'), JSON.stringify({ lockfile_sha256, node: process.version, platform: `${process.platform}-${process.arch}` }) + '\n');
} finally {
  closeSync(descriptor);
  unlinkSync(lock);
}
