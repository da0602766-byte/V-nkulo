import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { restoreArchive } from '../scripts/recovery/restore.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const secret = 'isolated-recovery-test-secret';
const cpf = '52998224725';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'vinkulo-recovery-test-'));
  const { database: db, d1 } = await createPilotD1();
  const handles = [db];
  t.after(async () => { for (const handle of handles) handle.close(); await rm(directory, { recursive: true, force: true }); });
  const ownerId = await createPilotUser(db, { nome: 'Proprietário atual', email: 'owner@recovery.invalid', senha: 'CurrentOwner123!', memberships: [] });
  const memberId = await createPilotUser(db, { nome: 'Pessoa a recuperar', email: 'member@recovery.invalid', senha: 'OldMember123!' });
  db.prepare('INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) VALUES(?,?,?)').run(ownerId, createHmac('sha256', secret).update(`cpf:v1:${cpf}`).digest('hex'), '25');
  db.prepare('INSERT INTO identidades_cpf(usuario_id,cpf_hash,finais) VALUES(?,?,?)').run(memberId, 'member-cpf', '08');
  db.prepare('INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES(?,?,?)').run(memberId, 'expired-session', '2099-01-01');
  db.prepare("INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES('secret-integration',?,'test')").run('do-not-restore');
  const list = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all().filter(row => !/^(sqlite_|_cf_|__drizzle|platform_reset_)|^d1_migrations$/.test(row.name) && !['planos_plataforma','planos_rede','controlled_auth_rate_limits','auth_rate_limits','supabase_storage_copies'].includes(row.name));
  const tables = list.map(table => ({ name: table.name, schema: table.sql, rows: db.prepare(`SELECT * FROM "${table.name}"`).all().filter(row => table.name === 'usuarios' ? row.id !== ownerId : ['identidades_cpf','sessoes'].includes(table.name) ? row.usuario_id !== ownerId : table.name === 'configuracoes' ? row.chave !== 'supabase_integration' : true) }));
  const archive = { format: 'vinkulo-reset-v1', ownerId, createdAt: new Date().toISOString(), tables, files: ['images/test.jpg'], summary: { rows: tables.reduce((n, table) => n + table.rows.length, 0), users: tables.find(table => table.name === 'usuarios').rows.length, communities: tables.find(table => table.name === 'comunidades').rows.length, files: 1, tables: tables.map(table => ({ name: table.name, rows: table.rows.length })) } };
  const baselinePath = join(directory, 'baseline.sqlite');
  const archivePath = join(directory, 'archive.json');
  const outputPath = join(directory, 'restored.sqlite');
  db.prepare('VACUUM main INTO ?').run(baselinePath);
  async function save() { await writeFile(archivePath, JSON.stringify(archive)); }
  await save();
  return { db, d1, handles, directory, archive, ownerId, memberId, save, options: { baselinePath, archivePath, outputPath, ownerEmail: 'owner@recovery.invalid' } };
}

test('recupera dados reais em outro SQLite, preserva proprietário e não reabre credenciais ou integrações', async t => {
  const f = await fixture(t);
  const baselineHash = hash(await readFile(f.options.baselinePath));
  const archiveHash = hash(await readFile(f.options.archivePath));
  const report = await restoreArchive(f.options);
  const restored = new DatabaseSync(f.options.outputPath, { readOnly: true });
  f.handles.push(restored);
  assert.equal(report.integrity, 'ok');
  assert.equal(report.archiveSha256, archiveHash);
  assert.equal(report.filesNotRestored, 1);
  assert.equal(hash(await readFile(f.options.baselinePath)), baselineHash);
  assert.equal(hash(await readFile(f.options.archivePath)), archiveHash);
  assert.deepEqual(restored.prepare('SELECT * FROM usuarios WHERE id=?').get(f.ownerId), f.db.prepare('SELECT * FROM usuarios WHERE id=?').get(f.ownerId));
  assert.equal(restored.prepare('SELECT nome FROM usuarios WHERE id=?').get(f.memberId).nome, 'Pessoa a recuperar');
  assert.deepEqual({ ...restored.prepare('SELECT ativo,senha_hash,senha_salt FROM usuarios WHERE id=?').get(f.memberId) }, { ativo: 0, senha_hash: null, senha_salt: null });
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM sessoes').get().n, 0);
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM configuracoes').get().n, 0);
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM usuario_comunidades WHERE usuario_id=?').get(f.memberId).n, 1);
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(restored.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all(), f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all());
  assert.ok(!JSON.stringify(report).includes('member@recovery'));
  assert.ok(!JSON.stringify(report).includes('do-not-restore'));
  assert.equal((await readFile(f.options.outputPath)).includes(Buffer.from('do-not-restore')), false);
  assert.equal((await readFile(f.options.outputPath)).includes(Buffer.from('expired-session')), false);
  assert.equal((await readdir(f.directory)).some(name => name.startsWith('.vinkulo-recovery-')), false);
});

test('não executa SQL fornecido no arquivo e não sobrescreve saída existente', async t => {
  const f = await fixture(t);
  f.archive.tables.find(table => table.name === 'usuarios').schema = 'DROP TABLE usuarios';
  await f.save();
  await restoreArchive(f.options);
  const bytes = await readFile(f.options.outputPath);
  await assert.rejects(restoreArchive(f.options), /já existe/);
  assert.equal(hash(await readFile(f.options.outputPath)), hash(bytes));
  await assert.rejects(restoreArchive({ ...f.options, outputPath: f.options.baselinePath }), /arquivo novo/);
});

for (const [name, mutate, pattern] of [
  ['contagens adulteradas', f => f.archive.summary.rows++, /contagens/],
  ['tabela ausente', f => f.archive.tables.pop(), /incompleto/],
  ['tabela repetida', f => f.archive.tables.push(f.archive.tables[0]), /repetida/],
  ['coluna desconhecida', f => f.archive.tables.find(x => x.name === 'usuarios').rows[0].extra = 'injected', /Colunas/],
  ['proprietário no arquivo', f => f.archive.tables.find(x => x.name === 'usuarios').rows[0].id = f.ownerId, /proprietário/],
  ['vínculo quebrado', f => f.archive.tables.find(x => x.name === 'usuario_comunidades').rows[0].usuario_id = 999999, /vínculos quebrados/],
]) {
  test(`recusa ${name} sem entregar banco parcial`, async t => {
    const f = await fixture(t);
    const before = hash(await readFile(f.options.baselinePath));
    mutate(f); await f.save();
    await assert.rejects(restoreArchive(f.options), pattern);
    assert.equal(hash(await readFile(f.options.baselinePath)), before);
    assert.deepEqual((await readdir(f.directory)).sort(), ['archive.json', 'baseline.sqlite']);
  });
}

test('recusa tabela nova no esquema e proprietário desativado', async t => {
  const f = await fixture(t);
  let baseline = new DatabaseSync(f.options.baselinePath);
  baseline.exec('CREATE TABLE unreviewed_data(id INTEGER)'); baseline.close();
  await assert.rejects(restoreArchive(f.options), /não revisada/);
  baseline = new DatabaseSync(f.options.baselinePath);
  baseline.exec('DROP TABLE unreviewed_data');
  baseline.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(f.ownerId); baseline.close();
  await assert.rejects(restoreArchive(f.options), /conta ativa/);
});

test('arquivo exportado pelo Worker é recuperável e proprietário entra com a senha atual', async t => {
  const f = await fixture(t);
  const worker = (await import('../dist/server/index.js')).default;
  const env = { DB: f.d1, AUTH_SECRET: secret, SYSTEM_OWNER_EMAIL: f.options.ownerEmail, SYSTEM_OWNER_LOCKED_BEFORE: '2099-01-01', ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  const context = { waitUntil(p) { p.catch(() => {}); }, passThroughOnException() {} };
  let cookie = '';
  const call = (path, body) => worker.fetch(new Request(`https://test.invalid${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://test.invalid', cookie }, body: JSON.stringify(body) }), env, context);
  const login = await call('/api/auth/proprietario', { cpf, senha: 'CurrentOwner123!' });
  assert.equal(login.status, 200, await login.clone().text());
  cookie = login.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0];
  const preview = await call('/api/proprietario/reset', { action: 'PREVIEW' });
  assert.equal(preview.status, 200, await preview.clone().text());
  const reset = await call('/api/proprietario/reset', { action: 'EXECUTE', mode: 'ARCHIVE', token: (await preview.json()).token, password: 'CurrentOwner123!', acknowledged: true, confirmation: 'ARQUIVAR E REINICIAR' });
  assert.equal(reset.status, 200, await reset.clone().text());
  const downloaded = await call('/api/proprietario/reset', { action: 'DOWNLOAD', id: (await reset.json()).resetId, password: 'CurrentOwner123!' });
  assert.equal(downloaded.status, 200, await downloaded.clone().text());
  await writeFile(f.options.archivePath, await downloaded.text());
  const report = await restoreArchive(f.options);
  assert.equal(report.integrity, 'ok');
  const recovered = new DatabaseSync(f.options.outputPath);
  f.handles.push(recovered);
  // D1 adapter now points only to the new disposable database.
  f.d1.database = recovered;
  const expired = await worker.fetch(new Request('https://test.invalid/api/proprietario/reset', { headers: { cookie } }), env, context);
  assert.equal(expired.status, 401);
  cookie = '';
  const after = await call('/api/auth/proprietario', { cpf, senha: 'CurrentOwner123!' });
  assert.equal(after.status, 200, await after.clone().text());
});
