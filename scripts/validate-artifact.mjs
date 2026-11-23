import { readFile, readdir } from 'node:fs/promises';

const manifest = new URL('../dist/.openai/hosting.json', import.meta.url);
const workerUrl = new URL('../dist/server/index.js', import.meta.url);
JSON.parse(await readFile(manifest, 'utf8'));
const client = new URL('../dist/client/', import.meta.url);
const clientFiles = new Set(
  (await readdir(client, { recursive: true })).map(path => '/' + path.replaceAll('\\', '/')),
);
for (const server of ['server', 'server/ssr']) {
  const assetsUrl = new URL(`../dist/${server}/__vite_rsc_assets_manifest.js`, import.meta.url);
  const { default: assets } = await import(assetsUrl.href);
  const references = [
    ...Object.values(assets.clientReferenceDeps),
    ...Object.values(assets.serverResources),
  ];
  const missing = new Set(references.flatMap(({ js, css }) => [...js, ...css])
    .filter(path => path.startsWith('/') && !clientFiles.has(path)));
  if (missing.size) {
    throw new Error(`${server} RSC manifest references missing client assets: ${[...missing].join(', ')}`);
  }
}
workerUrl.searchParams.set('sites-validation', `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== 'function') {
  throw new Error('dist/server/index.js must have an ESM default export with fetch(request, env, ctx)');
}
console.log('Validated Sites artifact: ESM Worker, hosting manifest and RSC assets.');
