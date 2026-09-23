import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('laboratory distinguishes loading, failure and a confirmed empty list', () => {
  const source = read('app/components/OwnerLaboratoryWorkspace.tsx');
  assert.match(source, /setLoadState\("loading"\)/);
  assert.match(source, /setLoadState\("ready"\)/);
  assert.match(source, /setLoadState\("error"\)/);
  assert.ok(source.indexOf('Laboratório indisponível') < source.indexOf('Nenhum experimento aqui'));
  assert.match(source, /Tentar novamente/);
});
function worker(hostname, networkFails = false) {
  const handlers = {};
  const cached = { origin: 'cached' };
  const network = { origin: 'network', ok: false };
  const deleted = [];
  const context = {
    URL, Response,
    self: { location: { hostname, origin: `http://${hostname}` }, addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => ({ match: async () => cached, put() {} }), keys: async () => ['vinkulo-static-v4', 'unrelated-cache', 'vinkulo-shell-v5'], delete: async (key) => deleted.push(key) },
    fetch: async () => { if (networkFails) throw Error('offline'); return network; },
  };
  vm.runInNewContext(read('public/sw.js'), context);
  return { handlers, cached, network, deleted };
}
test('preview never intercepts changing scripts and styles', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const { handlers } = worker(host);
    let intercepted = false;
    handlers.fetch({ request: { url: `http://${host}/app/globals.css`, method: 'GET', destination: 'style' }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
test('deployed scripts and styles prefer fresh network responses', async () => {
  for (const destination of ['script', 'style']) {
    const { handlers, network } = worker('example.test');
    let response;
    handlers.fetch({ request: { url: 'http://example.test/app.css', method: 'GET', destination }, respondWith(promise) { response = promise; } });
    assert.equal(await response, network);
  }
});
test('deployed code keeps an offline fallback', async () => {
  const { handlers, cached } = worker('example.test', true);
  let response;
  handlers.fetch({ request: { url: 'http://example.test/app.js', method: 'GET', destination: 'script' }, respondWith(promise) { response = promise; } });
  assert.equal(await response, cached);
});
test('activation deletes only obsolete application caches', async () => {
  const { handlers, deleted } = worker('example.test');
  let finished;
  handlers.activate({ waitUntil(promise) { finished = promise; } });
  await finished;
  assert.deepEqual(deleted, ['vinkulo-static-v4']);
});
test('plan normalization preserves the first benefit across repeated reads', () => {
  const source = ts.transpileModule(read('app/lib/platform-plans.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({ getD1() { throw Error('No database access in this unit test'); } }) });
  const once = exports.parseLandingPlans(exports.DEFAULT_LANDING_PLANS);
  const twice = exports.parseLandingPlans(once);
  assert.equal(twice[0].items[0], exports.DEFAULT_LANDING_PLANS[0].items[0]);
  assert.equal(twice[0].items.length, exports.DEFAULT_LANDING_PLANS[0].items.length);
});
test('administrative plans never substitute defaults for missing or invalid configuration', async () => {
  const source = ts.transpileModule(read('app/lib/platform-plans.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({ getD1: () => ({ prepare: () => ({ bind: () => ({ first: async () => null }) }) }) }) });
  assert.equal((await exports.getConfiguredLandingPlans()).length, 0);
  for (const invalid of [null, [], [{}], [{ name: '', price: '', cta: '', items: [] }]]) assert.equal(exports.parseConfiguredLandingPlans(invalid), null);
  const route = read('app/api/pilot/platform-plans/route.ts');
  assert.doesNotMatch(route, /\bgetLandingPlans\b|\bparseLandingPlans\b|DEFAULT_LANDING_PLANS/);
  assert.match(route, /status: 400/);
});
test('owner CSS is loaded last and mobile menu sits above its backdrop', () => {
  const layout = read('app/layout.tsx');
  assert.ok(layout.indexOf('./owner-workspace.css') > layout.indexOf('./ministry-desktop.css'));
  const css = read('app/owner-workspace.css');
  assert.match(css, /owner-sidebar \{ z-index: 80/);
  assert.match(css, /owner-sidebar-backdrop \{ z-index: 70/);
  assert.match(css, /owner-brand-desktop \{ flex: 0 0 auto/);
  assert.match(css, /font-size: 12px/);
  assert.doesNotMatch(read('app/components/OwnerWorkspace.tsx'), /data-smart-scroll-header/);
});
