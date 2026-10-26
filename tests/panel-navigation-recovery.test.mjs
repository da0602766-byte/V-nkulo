import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(process.env.SW_TEST_SOURCE || new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://vinkulo.test';
function harness({ fetcher = async () => new Response('online'), cached, cacheError, addError, fastTimeout = false } = {}) {
  const handlers = {}, requests = [], writes = [], additions = [], lifetimes = [], delays = [];
  let claimed = false, skipped = false;
  const failCache = (operation) => { if (cacheError === operation || cacheError === 'all') throw new Error(`storage ${operation} unavailable`); };
  const cache = {
    async match() { failCache('match'); return cached?.clone(); },
    async put(key, response) { failCache('put'); writes.push({ key, body: await response.text() }); },
    async add(key) { additions.push(key); if (key === addError) throw Error('asset unavailable'); },
  };
  runInNewContext(source, {
    URL, Response, AbortController, Set,
    setTimeout(callback, delay) { delays.push(delay); return setTimeout(callback, fastTimeout ? 5 : delay); }, clearTimeout,
    self: { location: new URL(origin), addEventListener: (name, fn) => { handlers[name] = fn; },
      async skipWaiting() { skipped = true; }, clients: { async claim() { claimed = true; } } },
    caches: { async open() { failCache('open'); return cache; }, async match() { failCache('match'); return cached?.clone(); },
      async keys() { failCache('keys'); return []; }, async delete() { failCache('delete'); } },
    async fetch(request, options) { requests.push({ request, options }); return fetcher(request, options, requests.length); },
  });
  return { requests, writes, additions, delays, get claimed() { return claimed; }, get skipped() { return skipped; },
    async lifecycle(name) { handlers[name]({ waitUntil: p => lifetimes.push(p) }); await Promise.all(lifetimes); },
    dispatch(overrides = {}) {
      let result;
      handlers.fetch({ request: { url: `${origin}/painel?view=visitantes`, method: 'GET', mode: 'navigate', ...overrides },
        respondWith: value => { result = value; }, waitUntil: p => lifetimes.push(p) });
      return result;
    }, async settled() { await Promise.all(lifetimes); },
  };
}
const offline = async () => { throw Error('connection reset'); };
const script = { mode: 'cors', destination: 'script', url: `${origin}/assets/panel.js` };

test('navigation survives a transient connection failure on its one retry', async () => {
  const h = harness({ fetcher: async (request, options, count) => count === 1 ? offline() : new Response('Visitantes') });
  const response = await h.dispatch();
  assert.equal(await response.text(), 'Visitantes'); assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].request.url, `${origin}/painel?view=visitantes`);
  assert.equal(h.requests[1].options.cache, 'no-store'); assert.equal(h.writes.length, 0);
});

test('offline navigation with an empty cache always returns a usable HTML page', async () => {
  const h = harness({ fetcher: offline });
  const response = await h.dispatch();
  assert.ok(response instanceof Response); assert.equal(response.status, 503);
  assert.match(response.headers.get('Content-Type'), /text\/html/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const html = await response.text();
  assert.match(html, /Tentar novamente/); assert.match(html, /location.reload\(\)/);
  assert.doesNotMatch(html, /https?:\/\//); assert.equal(h.requests.length, 2);
});

test('unavailable storage cannot break the navigation recovery page', async () => {
  const h = harness({ fetcher: offline, cacheError: 'all' });
  assert.match(await (await h.dispatch()).text(), /Não foi possível carregar agora/);
});

test('cached recovery page is used with a no-store 503 response', async () => {
  const h = harness({ fetcher: offline, cached: new Response('<h1>Cached recovery</h1>', { headers: { 'Content-Type': 'text/html' } }) });
  const response = await h.dispatch();
  assert.equal(response.status, 503); assert.match(await response.text(), /Cached recovery/);
});

test('gateway errors retry once then show recovery, not a broken navigation', async () => {
  for (const status of [502, 503, 504]) {
    const h = harness({ fetcher: async () => new Response('gateway error', { status }) });
    assert.match(await (await h.dispatch()).text(), /Tentar novamente/); assert.equal(h.requests.length, 2);
  }
});

test('stalled requests are aborted and recovery remains bounded', async () => {
  let aborted = 0;
  const h = harness({ fastTimeout: true, fetcher: (request, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted++; reject(new Error('timeout')); });
  }) });
  assert.equal((await h.dispatch()).status, 503); assert.equal(aborted, 2);
  assert.deepEqual(h.delays, [12000, 12000]);
});

test('successful responses, login redirects and access errors are preserved without retry', async () => {
  for (const status of [200, 302, 401, 403, 404, 500]) {
    const h = harness({ fetcher: async () => new Response('original', { status, headers: { Location: '/login' } }) });
    const response = await h.dispatch();
    assert.equal(response.status, status); assert.equal(await response.text(), 'original'); assert.equal(h.requests.length, 1);
  }
});

test('API writes, cross-origin requests and the Android bundle are never intercepted', () => {
  const h = harness();
  for (const overrides of [{ method: 'POST' }, { method: 'DELETE' }, { url: `${origin}/api/pilot/visitantes` },
    { url: `${origin}/mobile-app/index.html` }, { url: 'https://other.test/painel' }]) assert.equal(h.dispatch(overrides), undefined);
  assert.equal(h.requests.length, 0);
});

test('a cache read failure cannot block a healthy script or stylesheet response', async () => {
  for (const cacheError of ['open', 'match']) {
    const h = harness({ cacheError });
    assert.equal(await (await h.dispatch(script)).text(), 'online'); await h.settled();
  }
});

test('a cache write failure never rejects a successful network response', async () => {
  const h = harness({ cacheError: 'put', fetcher: async () => {
    const response = new Response('current code'); Object.defineProperty(response, 'type', { value: 'basic' }); return response;
  } });
  assert.equal(await (await h.dispatch(script)).text(), 'current code'); await h.settled();
});

test('offline scripts use the exact cached URL or a valid 503, never undefined', async () => {
  const h = harness({ fetcher: offline, cached: new Response('cached script') });
  assert.equal(await (await h.dispatch(script)).text(), 'cached script'); await h.settled();
  const missing = harness({ fetcher: offline });
  assert.equal((await missing.dispatch(script)).status, 503); await missing.settled();
});

test('an individual missing shell asset does not prevent worker installation', async () => {
  const h = harness({ addError: '/vinkulo-app-icon-192.png' }); await h.lifecycle('install');
  assert.ok(h.additions.includes('/offline.html')); assert.ok(!h.additions.includes('/'));
  assert.ok(h.skipped);
});

test('installation and activation tolerate unavailable storage', async () => {
  const h = harness({ cacheError: 'all' }); await h.lifecycle('install'); await h.lifecycle('activate');
  assert.ok(h.skipped); assert.ok(h.claimed);
});

test('an image cache hit keeps the background refresh alive until it finishes', async () => {
  let resolve;
  const h = harness({ cached: new Response('cached image'), fetcher: () => new Promise(done => { resolve = done; }) });
  assert.equal(await (await h.dispatch({ ...script, destination: 'image' })).text(), 'cached image');
  const response = new Response('updated image'); Object.defineProperty(response, 'type', { value: 'basic' });
  resolve(response); await h.settled(); assert.equal(h.writes[0].body, 'updated image');
});
