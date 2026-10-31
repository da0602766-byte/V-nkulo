// Keep the Linux CI workflow and run the same tools without Bash on Windows.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [command, ...extra] = process.argv.slice(2);
const env = { ...process.env, WRANGLER_WRITE_LOGS: 'false' };
env.WRANGLER_LOG_PATH ||= path.join(root, '.wrangler/logs');
env.MINIFLARE_REGISTRY_PATH ||= path.join(root, '.wrangler/registry');

function run(executable, args, timeout = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    let expired = false;
    const timer = timeout ? setTimeout(() => {
      expired = true;
      // Terminate only this command's process tree, including Vite/workerd.
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill('SIGKILL');
    }, timeout) : null;
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (expired) reject(new Error(`${command} exceeded its time limit.`));
      else if (signal || code !== 0) reject(new Error(`${command} failed (${signal || code}).`));
      else resolve();
    });
  });
}

function cli(packageName, binary = packageName) {
  const directory = path.join(root, 'node_modules', packageName);
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  return path.join(directory, typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[binary]);
}

try {
  const linux = { 'install:ci': 'install-ci.sh', build: 'build-verified.sh' };
  if (process.platform !== 'win32' && command in linux) {
    await run('bash', [path.join(root, 'scripts', linux[command]), ...extra]);
  } else if (command === 'install:ci') {
    await run(process.execPath, [path.join(root, 'scripts/install-portable.mjs'), ...extra]);
  } else if (command === 'build') {
    const duration = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(env.SITES_BUILD_TIMEOUT || '3m');
    if (!duration || Number(duration[1]) <= 0) throw new Error('Invalid SITES_BUILD_TIMEOUT. Use e.g. 180s or 3m.');
    const timeout = Number(duration[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[duration[2] || 's']);
    await run(process.execPath, [cli('vinext'), 'build', ...extra], timeout);
    await run(process.execPath, [path.join(root, 'scripts/validate-artifact.mjs')]);
  } else {
    const commands = {
      dev: ['vite', []], start: ['vinext', ['start']],
      lint: ['eslint', ['.']], 'db:generate': ['drizzle-kit', ['generate']],
    };
    if (!(command in commands)) throw new Error(`Unknown project command: ${command}`);
    const [name, args] = commands[command];
    await run(process.execPath, [cli(name), ...args, ...extra]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
