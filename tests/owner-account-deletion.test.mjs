import assert from 'node:assert/strict';
import test from 'node:test';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

async function fixture() {
  const { database: db, d1 } = await createPilotD1();
  const worker = (await import('../dist/server/index.js')).default;
  const env = { DB: d1, AUTH_SECRET: 'delete-test-only', SYSTEM_OWNER_EMAIL: 'owner@deletion.test', SYSTEM_OWNER_LOCKED_BEFORE: '2099-01-01', ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  const ctx = { waitUntil(p) { p.catch(() => {}); }, passThroughOnException() {} };
  const make = (nome, email, papel = 'MEMBRO') => createPilotUser(db, { nome, email, senha: 'LocalOnly123!', memberships: [{ comunidadeId: 1, papel }] });
  const owner = await make('Proprietário', env.SYSTEM_OWNER_EMAIL);
  const target = await make('Pessoa removida', 'target@deletion.test');
  const leader = await make('Líder', 'leader@deletion.test', 'PASTOR');
  const other = await createPilotUser(db, { nome: 'Outra comunidade', email: 'other@deletion.test', senha: 'LocalOnly123!', memberships: [{ comunidadeId: 2, papel: 'PASTOR' }] });
  const login = async email => {
    const r = await worker.fetch(await cpfLoginRequest(env, new Request('https://test.invalid/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, senha: 'LocalOnly123!' }) })), env, ctx);
    assert.equal(r.status, 200, await r.clone().text());
    return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  };
  const auth = await login(env.SYSTEM_OWNER_EMAIL), member = await login('target@deletion.test');
  const call = (userId = target, cookie = auth, path = '/api/proprietario', body = {}) => worker.fetch(new Request('https://test.invalid' + path, { method: path === '/api/proprietario' ? 'PATCH' : 'DELETE', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'EXCLUIR_USUARIO_DEFINITIVO', userId, ...body }) }), env, ctx);
  const directory = async () => (await worker.fetch(new Request("https://test.invalid/api/proprietario?section=users", {headers:{cookie:auth}}),env,ctx)).json();
  return { db, owner, target, leader, other, auth, member, call, directory };
}

test('proprietário exclui conta vinculada, preserva dados compartilhados e avisa líderes uma vez por comunidade', async () => {
  const f = await fixture();
  try {
    const ministry = Number(f.db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,responsavel_usuario_id,criado_por) VALUES (1,'Equipe',?,?)").run(f.leader, f.target).lastInsertRowid);
    const volunteer = Number(f.db.prepare("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao) VALUES (1,?,?,'Apoio')").run(ministry, f.target).lastInsertRowid);
    const schedule = Number(f.db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,responsavel_usuario_id) VALUES (1,?,'Escala teste','2026-11-01 10:00:00','2026-11-01 12:00:00',?)").run(ministry, f.leader).lastInsertRowid);
    f.db.prepare("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao) VALUES (1,?,?,?,'Apoio')").run(schedule, volunteer, f.target);
    f.db.prepare("INSERT INTO convites_comunidade(comunidade_id,email,token_hash,expira_em,criado_por) VALUES (1,'invite@test.invalid','hash','2099-01-01',?)").run(f.target);
    f.db.prepare("INSERT INTO community_drive_storage(comunidade_id,proprietario_usuario_id,pasta_raiz_id,pasta_midias_id,pasta_conversas_id) VALUES (1,?,'root','media','chat')").run(f.target);
    f.db.prepare("INSERT INTO celulas(nome,responsavel,criado_por,comunidade_id,lider_usuario_id,vice_lider_usuario_id) VALUES ('Célula teste','Líder','test',1,?,?)").run(f.leader, f.target);
    f.db.prepare("INSERT INTO notificacoes_sistema(titulo,mensagem,area,usuario_id,criado_por) VALUES ('Privada','Não pode virar aviso público','USUARIOS',?,'test')").run(f.target);
    f.db.prepare("INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado) VALUES (1,?,'HISTORICO','SUCESSO')").run(f.target);
    const r = await f.call();
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal(f.db.prepare('SELECT id FROM usuarios WHERE id=?').get(f.target), undefined);
    assert.equal(f.db.prepare('SELECT criado_por FROM ministerios_comunidade WHERE id=?').get(ministry).criado_por, null);
    assert.equal(f.db.prepare("SELECT usuario_id FROM auditoria_piloto WHERE evento='HISTORICO'").get().usuario_id, null);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id=?').get(f.target).n, 0);
    assert.ok(f.db.prepare('SELECT id FROM escalas_ministerio WHERE id=?').get(schedule));
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM escala_designacoes WHERE usuario_id=?').get(f.target).n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM convites_comunidade WHERE criado_por=?').get(f.target).n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM notificacoes_sistema WHERE titulo='Privada'").get().n, 0);
    const notices = f.db.prepare("SELECT usuario_id,comunidade_id FROM notificacoes_sistema WHERE titulo='Conta excluída pelo proprietário'").all();
    assert.equal(notices.filter(n => n.usuario_id === f.leader).length, 1);
    assert.equal(notices.filter(n => n.usuario_id === f.other || n.usuario_id === f.target || n.usuario_id === null).length, 0);
    assert.ok(notices.every(n => n.comunidade_id === 1));
    assert.equal((await f.call(f.target, f.member)).status, 401);
  } finally { f.db.close(); }
});

test('nega membro e autoexclusão; falha durante lote reverte conta, vínculos, avisos e auditoria', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call(f.leader, f.member)).status, 403);
    assert.equal((await f.call(f.owner)).status, 409);
    f.db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON usuarios BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    const r = await f.call();
    assert.equal(r.status, 500); assert.match((await r.json()).error, /Nenhuma alteração/);
    assert.ok(f.db.prepare('SELECT id FROM usuarios WHERE id=?').get(f.target));
    assert.ok(f.db.prepare('SELECT id FROM usuario_comunidades WHERE usuario_id=?').get(f.target));
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM notificacoes_sistema WHERE titulo='Conta excluída pelo proprietário'").get().n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auditoria_piloto WHERE evento='CONTA_EXCLUIDA_DEFINITIVAMENTE'").get().n, 0);
  } finally { f.db.close(); }
});

test('exclusão na comunidade usa a mesma regra global', async () => {
  const f = await fixture();
  try {
    const membershipId = f.db.prepare('SELECT id FROM usuario_comunidades WHERE usuario_id=?').get(f.target).id;
    const r = await f.call(f.target, f.auth, '/api/pilot/pessoas', { action: 'DELETE_ACCOUNT', membershipId });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal(f.db.prepare('SELECT id FROM usuarios WHERE id=?').get(f.target), undefined);
  } finally { f.db.close(); }
});


test('identifica assinante e membro separadamente e preserva assinatura ao excluir responsável', async () => {
  const f = await fixture();
  try {
    f.db.prepare('UPDATE comunidades SET proprietario_usuario_id=? WHERE id=1').run(f.target);
    f.db.prepare("INSERT INTO assinaturas_comunidade(comunidade_id,plano_id,status,contrato,fundamento,aprovado_por) VALUES(1,'gratuito','ATIVA','{}','GRATUITO',?)").run(f.target);
    const directory=await f.directory();
    const subscriber=directory.users.find(row=>row.id===f.target), member=directory.users.find(row=>row.id===f.leader);
    assert.equal(JSON.parse(subscriber.assinaturas_detalhes)[0].vigente,1);
    assert.equal(JSON.parse(subscriber.vinculos_detalhes)[0].papel,'MEMBRO');
    assert.equal(JSON.parse(member.assinaturas_detalhes).length,0);
    const result=await f.call();assert.equal(result.status,200,await result.clone().text());
    assert.equal(f.db.prepare('SELECT id FROM usuarios WHERE id=?').get(f.target),undefined);
    const subscription=f.db.prepare('SELECT * FROM assinaturas_comunidade WHERE comunidade_id=1').get();
    assert.equal(subscription.status,'ATIVA');assert.equal(subscription.aprovado_por,f.owner);
    assert.equal(f.db.prepare('SELECT proprietario_usuario_id FROM comunidades WHERE id=1').get().proprietario_usuario_id,null);
  } finally { f.db.close(); }
});
