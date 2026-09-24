import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';

const worker = (await import('../dist/server/index.js')).default;
const password = 'ResetTest123!';
const secret = 'reset-tests-isolated-secret';
const cpf = '52998224725';
const key = 'images/post-image/1/aaaa-bbbb.jpg';

async function fixture() {
  const { database: db, d1 } = await createPilotD1();
  const ownerId = await createPilotUser(db, { nome: 'Proprietário', email: 'reset-owner@test.invalid', senha: password, memberships: [] });
  const memberId = await createPilotUser(db, { nome: 'Pessoa a excluir', email: 'member@test.invalid', senha: password });
  db.prepare('INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) VALUES (?,?,?)').run(ownerId, createHmac('sha256', secret).update(`cpf:v1:${cpf}`).digest('hex'), '25');
  db.exec("CREATE TABLE future_operational_table(id INTEGER PRIMARY KEY, sensitive TEXT); INSERT INTO future_operational_table VALUES(1,'sensitive-future-value')");
  const files = new Map([[key, 'private-image']]);
  const pending = [];
  const context = { waitUntil(p) { pending.push(p.catch(() => {})); }, passThroughOnException() {} };
  const env = { DB: d1, AUTH_SECRET: secret, SYSTEM_OWNER_EMAIL: 'reset-owner@test.invalid', SYSTEM_OWNER_LOCKED_BEFORE: '2099-01-01',
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    BUCKET: { list: async () => ({ objects: [...files.keys()].map(key => ({ key })), truncated: false }),
      get: async key => files.has(key) ? { body: new Response(files.get(key)).body } : null,
      delete: async key => { files.delete(key); } } };
  let cookie = '';
  async function call(path, { body, method = body ? 'POST' : 'GET', session = cookie, headers = {} } = {}) {
    const r = await worker.fetch(new Request('https://test.invalid' + path, { method, headers: { 'content-type': 'application/json', origin: 'https://test.invalid', cookie: session, ...headers }, body: body ? JSON.stringify(body) : undefined }), env, context);
    await Promise.all(pending.splice(0));
    return r;
  }
  async function login(owner = true) {
    const response = await call(owner ? '/api/auth/proprietario' : '/api/auth/login', { body: { cpf, senha: password }, session: '' });
    assert.equal(response.status, 200, await response.clone().text());
    return response.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0];
  }
  cookie = await login();
  async function preview() { const r = await call('/api/proprietario/reset', { body: { action: 'PREVIEW' } }); assert.equal(r.status, 200, await r.clone().text()); return r.json(); }
  function execute(p, mode = 'DELETE', extra = {}) {
    return call('/api/proprietario/reset', { body: { action: 'EXECUTE', token: p.token, mode, password, confirmation: mode === 'DELETE' ? 'EXCLUIR TODOS OS DADOS' : 'ARQUIVAR E REINICIAR', acknowledged: true, ...extra } });
  }
  return { db, d1, env, files, ownerId, memberId, call, login, preview, execute };
}

test('reset exige Proprietário, senha, confirmação, CSRF e conferência recente', async () => {
  const f = await fixture();
  assert.equal((await f.call('/api/proprietario/reset', { session: '' })).status, 401);
  assert.equal((await f.call('/api/proprietario/reset', { session: await f.login(false) })).status, 403);
  const p = await f.preview();
  assert.ok(p.summary.users > 0); assert.ok(p.summary.communities > 0);
  assert.equal((await f.execute(p, 'DELETE', { password: 'incorrect' })).status, 403);
  assert.equal((await f.execute(p, 'DELETE', { confirmation: 'sim' })).status, 409);
  assert.equal((await f.execute(p, 'DELETE', { acknowledged: false })).status, 409);
  assert.equal((await f.call('/api/proprietario/reset', { body: { action: 'PREVIEW' }, headers: { origin: 'https://attacker.invalid' } })).status, 403);
  f.db.prepare('UPDATE platform_reset_control SET expires_at=0').run();
  assert.equal((await f.execute(p)).status, 409);
  assert.ok(f.db.prepare('SELECT id FROM usuarios WHERE id=?').get(f.memberId));
});

test('exclusão total limpa todas as comunidades e tabelas operacionais e preserva login do Proprietário', async () => {
  const f = await fixture();
  const before = f.db.prepare('SELECT email,senha_hash,senha_salt,criado_em FROM usuarios WHERE id=?').get(f.ownerId);
  const p = await f.preview();
  const response = await f.execute(p);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM comunidades').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM usuarios').get().n, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM future_operational_table').get().n, 0);
  for (const table of p.summary.tables) {
    const count = f.db.prepare(`SELECT COUNT(*) n FROM "${table.name}"`).get().n;
    if (!['usuarios', 'identidades_cpf', 'sessoes'].includes(table.name)) assert.equal(count, 0, table.name);
  }
  assert.deepEqual(f.db.prepare('SELECT email,senha_hash,senha_salt,criado_em FROM usuarios WHERE id=?').get(f.ownerId), before);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(f.files.size, 0);
  assert.equal((await f.call('/proprietario')).status, 200);
  assert.ok(await f.login());
  assert.equal((await f.execute(p)).status, 409);
});

test('arquivo criptografado é consistente, exportável apenas com senha e eliminado pela exclusão definitiva', async () => {
  const f = await fixture();
  const response = await f.execute(await f.preview(), 'ARCHIVE');
  assert.equal(response.status, 200, await response.clone().text());
  const { resetId } = await response.json();
  const chunk = f.db.prepare('SELECT ciphertext FROM platform_reset_chunks LIMIT 1').get().ciphertext;
  assert.ok(!chunk.includes('sensitive-future-value'));
  assert.equal(f.files.size, 1);
  assert.equal((await f.call('/api/pilot/uploads/' + key, { session: '' })).status, 404);
  assert.equal((await f.call('/api/proprietario/reset', { body: { action: 'DOWNLOAD', id: resetId, password: 'incorrect' } })).status, 403);
  const download = await f.call('/api/proprietario/reset', { body: { action: 'DOWNLOAD', id: resetId, password } });
  assert.equal(download.status, 200, await download.clone().text()); assert.equal(download.headers.get('cache-control'), 'no-store');
  const archive = await download.json();
  assert.equal(archive.tables.find(t => t.name === 'future_operational_table').rows[0].sensitive, 'sensitive-future-value');
  assert.ok(archive.tables.find(t => t.name === 'comunidades').rows.length > 0);
  assert.ok(!archive.tables.find(t => t.name === 'usuarios').rows.some(row => row.id === f.ownerId));
  const attachment = await f.call('/api/proprietario/reset', { body: { action: 'DOWNLOAD_FILE', key, password } });
  assert.equal(await attachment.text(), 'private-image');
  const deleted = await f.execute(await f.preview()); assert.equal(deleted.status, 200, await deleted.clone().text());
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM platform_reset_chunks').get().n, 0);
  assert.equal(f.files.size, 0);
  assert.equal((await f.call('/api/proprietario/reset', { body: { action: 'DOWNLOAD', id: resetId, password } })).status, 409);
});

test('mudanças e falhas dentro da transação cancelam a limpeza sem deixar cópia parcial', async () => {
  const f = await fixture();
  const p = await f.preview();
  f.db.prepare("INSERT INTO future_operational_table VALUES(2,'later')").run();
  assert.equal((await f.execute(p)).status, 409);
  const fresh = await f.preview();
  const original = f.d1.batch.bind(f.d1);
  f.d1.batch = async statements => {
    if (statements.some(s => s.query.startsWith('INSERT INTO platform_reset_history'))) {
      f.db.exec("UPDATE future_operational_table SET sensitive='concurrent-edit' WHERE id=1");
    }
    return original(statements);
  };
  assert.equal((await f.execute(fresh, 'ARCHIVE')).status, 409);
  assert.ok(f.db.prepare('SELECT COUNT(*) n FROM comunidades').get().n > 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM platform_reset_chunks').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM platform_reset_history').get().n, 0);
  f.d1.batch = original;
  f.db.exec("CREATE TRIGGER block_reset BEFORE DELETE ON future_operational_table BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await f.execute(await f.preview())).status, 409);
  assert.ok(f.db.prepare('SELECT id FROM usuarios WHERE id=?').get(f.memberId));
  assert.equal(f.files.size, 1);
});

test('falha no armazenamento permanece pendente e pode ser retomada sem refazer a limpeza', async () => {
  const f = await fixture();
  f.env.BUCKET.delete = async () => { throw new Error('storage unavailable'); };
  const r = await f.execute(await f.preview()); assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).history[0].pending_files, 1);
  assert.equal((await f.call('/api/pilot/uploads/' + key, { session: '' })).status, 404);
  f.env.BUCKET.delete = async key => { f.files.delete(key); };
  const retry = await f.call('/api/proprietario/reset', { body: { action: 'RETRY_FILES', password } });
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.equal((await retry.json()).history[0].pending_files, 0);
  assert.equal(f.files.size, 0);
});
