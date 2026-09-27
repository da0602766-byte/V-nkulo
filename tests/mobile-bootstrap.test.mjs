import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';

async function fixture(t) {
  const { database, d1 } = await createPilotD1(); t.after(() => database.close());
  const id = await createPilotUser(database, { nome: 'Mobile Test', email: 'mobile@example.test', senha: 'Ficticia123' });
  database.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?, ?, datetime('now','+1 hour'))").run(id, 'test-session');
  let access = { user: { id, ativo: true }, context: { comunidadeId: 42, comunidadeNome: 'Comunidade teste', communityAccess: 'MEMBER' } };
  let hash = 'test-session';
  const source = await readFile(new URL('../app/api/mobile/bootstrap/route.ts', import.meta.url), 'utf8');
  const exports = {};
  const deps = {
    '../../../../db': { getD1: () => d1 },
    '../../../lib/local-auth': { getCurrentSessionTokenHash: async () => hash },
    '../../../lib/tenant': { requireTenantPermission: async p => { assert.equal(p, 'dashboard.view'); return access; } },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { assert.ok(name in deps); return deps[name]; }, Response, URL, Date });
  return { route: exports, database, id, access: value => { access = value; }, hash: value => { hash = value; } };
}
function request(headers = {}) {
  return new Request('https://vinkulo.test/api/mobile/bootstrap', { headers: {
    Origin: 'https://vinkulo.test', 'X-Vinkulo-Challenge': 'a'.repeat(64), 'X-Vinkulo-Client': 'android-foundation-1', ...headers,
  } });
}

test('mobile bootstrap: snapshot mínimo, prazo limitado à sessão e sem segredo ou permissão operacional', async t => {
  const f = await fixture(t); const response = await f.route.GET(request());
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  const body = await response.json();
  assert.deepEqual(body.capabilities, ['shell.open']);
  assert.equal(body.accountId, f.id); assert.equal(body.communityId, 42); assert.equal(body.challenge, 'a'.repeat(64));
  assert.ok(body.expiresAt > body.issuedAt && body.expiresAt - body.issuedAt <= 3_600_000);
  assert.deepEqual(Object.keys(body).sort(), ['protocol','challenge','accountId','communityId','communityName','issuedAt','expiresAt','capabilities'].sort());
  f.database.prepare("UPDATE sessoes SET expira_em = datetime('now', '+14 days')").run();
  const long = await (await f.route.GET(request())).json(); assert.equal(long.expiresAt - long.issuedAt, 86_400_000);
});

test('mobile bootstrap: recusa origem, challenge, versão e acesso temporário', async t => {
  const f = await fixture(t);
  for (const headers of [{Origin:'https://evil.test'}, {'sec-fetch-site':'cross-site'}]) assert.equal((await f.route.GET(request(headers))).status, 403);
  for (const headers of [{'x-vinkulo-challenge':'bad'}, {'x-vinkulo-client':'old'}]) assert.equal((await f.route.GET(request(headers))).status, 400);
  for (const context of [{ temporaryAccess: { id: 1 } }, { communityAccess: 'FEED_ONLY' }]) {
    f.access({user:{id:f.id,ativo:true},context}); assert.equal((await f.route.GET(request())).status,403);
  }
  f.access({error:Response.json({}, {status:403})}); assert.equal((await f.route.GET(request())).status,403);
  f.access({error:Response.json({}, {status:401})}); assert.equal((await f.route.GET(request())).status,401);
});

test('mobile bootstrap: sessão removida, expirada ou de outra pessoa não prepara contexto', async t => {
  const f = await fixture(t);
  f.hash(null); assert.equal((await f.route.GET(request())).status,401);
  f.hash('test-session'); f.database.prepare("UPDATE sessoes SET expira_em = datetime('now','-1 hour')").run();
  assert.equal((await f.route.GET(request())).status,401);
  f.database.prepare("UPDATE sessoes SET expira_em = datetime('now','+1 hour')").run();
  f.access({user:{id:f.id+1,ativo:true},context:{communityAccess:'MEMBER'}});
  assert.equal((await f.route.GET(request())).status,401);
  f.access({user:{id:f.id,ativo:false},context:{communityAccess:'MEMBER'}});
  assert.equal((await f.route.GET(request())).status,403);
});

test('service worker: não captura a entrada empacotada e continua tratando navegação web offline', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const events = {};
  runInNewContext(source, { self: { location: { hostname: 'vinkulo.test', origin: 'https://vinkulo.test' }, addEventListener: (name, fn) => {events[name]=fn;} }, URL,
    fetch: async () => {throw new Error('offline');}, caches: { match: async () => 'offline-page' } });
  for (const path of ['/mobile-app/index.html','/mobile-app/app.js','/api/mobile/bootstrap']) {
    let handled = false;
    events.fetch({request:{url:`https://vinkulo.test${path}`,method:'GET',mode:'navigate'},respondWith:()=>{handled=true;}});
    assert.equal(handled,false,path);
  }
  let result; events.fetch({request:{url:'https://vinkulo.test/painel',method:'GET',mode:'navigate'},respondWith:value=>{result=value;}});
  assert.equal(await result,'offline-page');
});
