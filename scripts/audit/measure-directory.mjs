// Measures only synthetic local requests; never connects to production.
// Run after building: node scripts/audit/measure-directory.mjs
import assert from 'node:assert/strict';
import {createPilotD1, createPilotUser} from '../../tests/helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from '../../tests/helpers/cpf-login.mjs';
const {database: db, d1} = await createPilotD1();
try {
  const worker = (await import('../../dist/server/index.js')).default;
  const env = {DB: d1, AUTH_SECRET: 'local-audit-only', ASSETS: {fetch: async () => new Response('', {status: 404})}};
  const ctx = {waitUntil() {}, passThroughOnException() {}};
  const user = await createPilotUser(db, {nome: 'Auditoria fictícia', email: 'audit@example.test', senha: 'LocalAudit123'});
  db.prepare("INSERT INTO visitante_acessos(comunidade_id,usuario_id,papel) VALUES(1,?,'READ')").run(user);
  const login = await worker.fetch(await cpfLoginRequest(env, new Request('https://localhost/api/auth/login', {
    method: 'POST', body: new URLSearchParams({email: 'audit@example.test', senha: 'LocalAudit123'}),
  })), env, ctx);
  assert.equal(login.status, 303);
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const prepare = d1.prepare.bind(d1);
  let count = 0;
  d1.prepare = query => {count++; return prepare(query);};
  const samples = [];
  for (let i = 0; i < 7; i++) {
    count = 0;
    const start = performance.now();
    const response = await worker.fetch(new Request('https://localhost/api/pilot/visitantes/listas', {headers: {cookie}}), env, ctx);
    const body = await response.text();
    assert.equal(response.status, 200, body);
    assert.equal(JSON.parse(body).lists.length, 1);
    if (i >= 2) samples.push({queries: count, bytes: Buffer.byteLength(body), ms: +(performance.now() - start).toFixed(2)});
  }
  console.log(JSON.stringify({scenario: 'one explicit shared grant, local SQLite, 2 warmups + 5 samples', samples}, null, 2));
} finally {db.close();}
