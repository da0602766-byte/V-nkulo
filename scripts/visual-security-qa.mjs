import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const workerFile = new URL('worker/index.ts', root);
const fixtureDir = new URL('app/qa-security-fixture/', root);
const marker = `  // TEMPORARY QA ONLY: isolated synthetic route can be framed for viewport testing.
  if (pathname === "/qa-security-fixture") {
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Content-Security-Policy", contentSecurityPolicy(nonce).replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
  }
`;
let worker = await readFile(workerFile, 'utf8');
if (process.argv[2] === 'start') {
  const fixture = await readFile(new URL('tests/fixtures/security-visual-page.fixture', root), 'utf8');
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(new URL('page.tsx', fixtureDir), fixture, { flag: 'wx' });
  if (!worker.includes(marker)) {
    const anchor = '  headers.set(\n    "Strict-Transport-Security",';
    if (!worker.includes(anchor)) throw Error('Worker structure changed; update the isolated QA harness.');
    worker = worker.replace(anchor, marker + anchor);
  }
  await writeFile(workerFile, worker);
  console.log('Synthetic fixture prepared. Use only the local preview, then run this script with stop.');
} else if (process.argv[2] === 'stop') {
  await writeFile(workerFile, worker.replace(marker, ''));
  await rm(fixtureDir, { recursive: true, force: true });
  console.log('Synthetic fixture removed; frame protection restored.');
} else throw Error('Usage: node scripts/visual-security-qa.mjs start|stop');
