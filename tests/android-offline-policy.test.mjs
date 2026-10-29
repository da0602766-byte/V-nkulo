import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';

async function moduleAt(file, dependencies) {
  const exports = {};
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; }, Response, URL, Date });
  return exports;
}
test('old APKs request an update and newer versions keep their capabilities', async () => {
  const { needsAndroidPolicyUpdate: check } = await moduleAt('app/lib/android-version.ts', {});
  for (const version of [undefined, 'invalid', '1.7.1', '1.22.0']) assert.equal(check(version), true);
  for (const version of ['1.23.0', '1.23.1', '1.24.0', '2.0.0']) assert.equal(check(version), false);
});
async function fixture(t) {
  const { database, d1 } = await createPilotD1(); t.after(() => database.close());
  const id = await createPilotUser(database, { nome: 'Owner test', email: 'offline-owner@example.test', senha: 'Ficticia123' });
  let user = { id, ativo: true, system_owner: true };
  const policy = await moduleAt('app/lib/android-offline-policy.ts', { '../../db': { getD1: () => d1 } });
  const deps = { '../../../../db': { getD1: () => d1 }, '../../../lib/local-auth': { getSessionUser: async () => user }, '../../../lib/android-offline-policy': policy };
  return { database, policy, owner: await moduleAt('app/api/proprietario/android/route.ts', deps), public: await moduleAt('app/api/mobile/policy/route.ts', deps), user: value => { user = value; } };
}
function update(value, headers = {}) {
  return new Request('https://vinkulo.test/api/proprietario/android', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: 'https://vinkulo.test', ...headers }, body: JSON.stringify(value) });
}
test('owner policy persists globally, audits and can be re-enabled', async t => {
  const f = await fixture(t);
  assert.equal((await f.policy.getAndroidOfflinePolicy()).offlineEnabled, true);
  assert.equal((await f.owner.PATCH(update({ offlineEnabled: false }))).status, 200);
  assert.equal((await f.policy.getAndroidOfflinePolicy()).offlineEnabled, false);
  assert.equal((await f.policy.rejectDisabledOffline()).status, 403);
  f.database.prepare("INSERT INTO feature_flags(flag_key,scope_type,scope_id,enabled) VALUES ('android_offline_enabled','COMMUNITY',1,1)").run();
  assert.equal((await f.policy.getAndroidOfflinePolicy()).offlineEnabled, false, 'tenant cannot bypass owner');
  assert.equal(f.database.prepare("SELECT count(*) AS count FROM auditoria_piloto WHERE evento='ANDROID_OFFLINE_ATUALIZADO'").get().count, 1);
  assert.equal((await f.owner.PATCH(update({ offlineEnabled: true }))).status, 200);
  assert.equal(await f.policy.rejectDisabledOffline(), null);
});
test('owner control denies unauthenticated, inactive, ordinary admin and cross-origin writes', async t => {
  const f = await fixture(t);
  assert.equal((await f.owner.PATCH(update({ offlineEnabled: false }, { Origin: 'https://other.test' }))).status, 403);
  assert.equal((await f.owner.PATCH(update({ offlineEnabled: 'false' }))).status, 400);
  for (const user of [null, { ativo: false, system_owner: true }, { ativo: true, system_owner: false, perfil: 'SUPERADMIN' }]) {
    f.user(user);
    assert.equal((await f.owner.GET()).status, user ? 403 : 401);
    assert.equal((await f.owner.PATCH(update({ offlineEnabled: false }))).status, user ? 403 : 401);
  }
  assert.equal((await f.policy.getAndroidOfflinePolicy()).offlineEnabled, true);
});
test('public policy returns only operational flags and an uncached challenge', async t => {
  const f = await fixture(t); f.user(null);
  const challenge = 'a'.repeat(64);
  const response = await f.public.GET(new Request('https://vinkulo.test/api/mobile/policy?challenge=' + challenge));
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await response.json(), { protocol: 1, challenge, offlineEnabled: true, minimumVersion: '1.23.0' });
  assert.equal((await f.public.GET(new Request('https://vinkulo.test/api/mobile/policy?challenge=bad'))).status, 400);
});
test('disabled policy blocks every new offline grant before issuing data', async () => {
  for (const [file, verb] of [['bootstrap','GET'], ['snapshot','GET'], ['write-bootstrap','POST'], ['modules/prepare','POST']]) {
    const prefix = file.includes('/') ? '../../../../' : '../../../';
    const policy = { rejectDisabledOffline: async () => Response.json({ code: 'OFFLINE_DISABLED' }, { status: 403 }) };
    const deps = { '../../../../db': {}, [prefix+'lib/android-offline-policy']: policy,
      '../../../lib/local-auth': {}, '../../../lib/tenant': {}, '../../../lib/community-theme': {},
      '../../../lib/mobile-write': { prepareMobileWrite() { throw Error('must not prepare'); } },
      '../../../../lib/mobile-modules': { prepareModule() { throw Error('must not prepare'); } } };
    const route = await moduleAt('app/api/mobile/' + file + '/route.ts', deps);
    assert.equal((await route[verb](new Request('https://vinkulo.test/api/mobile/' + file))).status, 403);
  }
});
