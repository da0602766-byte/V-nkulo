import { readFile } from 'node:fs/promises';

const manifest = new URL('../dist/.openai/hosting.json', import.meta.url);
const workerUrl = new URL('../dist/server/index.js', import.meta.url);
JSON.parse(await readFile(manifest, 'utf8'));
workerUrl.searchParams.set('sites-validation', `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== 'function') {
  throw new Error('dist/server/index.js must have an ESM default export with fetch(request, env, ctx)');
}
console.log('Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.');
