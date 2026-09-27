// Diagnóstico somente de leitura. Sem login, cookies, dados pessoais ou arquivos de saída.
// node scripts/apk-baseline.mjs [--online]
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--online') || args.length > 1) {
  console.error('Uso: node scripts/apk-baseline.mjs [--online]');
  process.exit(2);
}
const origin = 'https://adote-gestao.da0602766.chatgpt.site';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rounded = value => Math.round(value * 10) / 10;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const revision = directory => {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim();
  } catch { return null; }
};
const dirty = directory => {
  try {
    return Boolean(execFileSync('git', ['-C', directory, 'status', '--porcelain'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim());
  } catch { return null; }
};

async function inspectFile(relativePath) {
  const absolutePath = resolve(root, relativePath);
  const bytes = await readFile(absolutePath);
  return { path: relativePath, bytes: bytes.length, sha256: hash(bytes) };
}

async function measure(path, expectedStatus) {
  const started = performance.now();
  const response = await fetch(new URL(path, origin), {
    redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'Vinkulo-APK-Baseline/1' },
  });
  const headersMs = performance.now() - started;
  const chunks = [];
  let bytes = 0;
  // Bounded download; never log the response body or cookies.
  for await (const chunk of response.body ?? []) {
    bytes += chunk.byteLength;
    if (bytes > 16 * 1024 * 1024) throw new Error('Resposta acima do limite de 16 MiB.');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  return {
    status: response.status, expectedStatus, ok: response.status === expectedStatus,
    headersMs: rounded(headersMs), totalMs: rounded(performance.now() - started),
    decodedBytes: bytes, sha256: hash(body),
  };
}

const result = {
  measuredAt: new Date().toISOString(), node: process.version,
  webCommit: revision(root),
  webWorkingTreeDirty: dirty(root),
  androidCommit: revision(resolve(root, '.task-tools/android-p3')),
  androidWorkingTreeDirty: dirty(resolve(root, '.task-tools/android-p3')),
  scope: 'Artefatos locais e, com --online, HTTP sem autenticação. Não mede renderização, bateria, memória ou abertura Android.',
  apks: [], nativeSource: null, http: [], failures: [],
};

try {
  const names = (await readdir(resolve(root, 'public/downloads'))).filter(name => name.endsWith('.apk')).sort();
  for (const name of names) result.apks.push(await inspectFile(`public/downloads/${name}`));
  const gradlePath = '.task-tools/android-p3/Vinkulo-Android/app/build.gradle.kts';
  try {
    await stat(resolve(root, gradlePath));
    const gradle = await readFile(resolve(root, gradlePath), 'utf8');
    result.nativeSource = {
      path: gradlePath,
      versionName: gradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1] ?? null,
      versionCode: Number(gradle.match(/versionCode\s*=\s*(\d+)/)?.[1]) || null,
      minSdk: Number(gradle.match(/minSdk\s*=\s*(\d+)/)?.[1]) || null,
      targetSdk: Number(gradle.match(/targetSdk\s*=\s*(\d+)/)?.[1]) || null,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    result.nativeSource = { available: false, note: 'Checkout Android opcional não localizado; use o commit do relatório.' };
  }
  if (args.includes('--online')) {
    for (const [path, expectedStatus] of [['/login', 200], ['/comunidades', 200], ['/api/pilot/pessoas', 401]]) {
      const samples = [];
      for (let sample = 1; sample <= 3; sample++) {
        try {
          const measured = await measure(path, expectedStatus);
          samples.push({ sample, ...measured });
          if (!measured.ok) result.failures.push(`${path}: HTTP ${measured.status}, esperado ${expectedStatus}`);
        } catch (error) {
          // Name/code only; an error message could contain an unintended URL.
          samples.push({ sample, error: error.name, code: error.cause?.code ?? null });
          result.failures.push(`${path}: falha de transporte`);
          break;
        }
      }
      const good = samples.filter(sample => sample.ok);
      result.http.push({ path, samples, medianTotalMs: good.length === 3 ? median(good.map(sample => sample.totalMs)) : null });
    }
    // A newer native candidate must not change the stable baseline implicitly.
    const apk = result.apks.filter(item => /VINKULO_ANDROID_\d+\.\d+\.\d+\.apk$/.test(item.path))
      .sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true })).at(-1);
    if (apk) {
      result.publishedApkPath = apk.path;
      try {
        const remote = await measure(`/${apk.path.replace(/^public\//, '')}`, 200);
        const matchesLocal = remote.ok && remote.sha256 === apk.sha256 && remote.decodedBytes === apk.bytes;
        result.publishedApk = { ...remote, matchesLocal };
        if (!matchesLocal) result.failures.push('APK público diferente do artefato local ou indisponível.');
      } catch (error) {
        result.publishedApk = { error: error.name, code: error.cause?.code ?? null };
        result.failures.push('Falha de transporte ao conferir o APK público.');
      }
    } else {
      result.failures.push('Sem versão Android/local correspondente para conferir o APK público.');
    }
  }
} catch (error) {
  result.failures.push(`Diagnóstico local incompleto: ${error.code ?? error.name}`);
}
console.log(JSON.stringify(result, null, 2));
if (result.failures.length) process.exitCode = 1;
