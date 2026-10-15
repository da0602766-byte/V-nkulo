import assert from 'node:assert/strict';
import test from 'node:test';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';
import { visitorCsv } from '../app/lib/visitor-csv.ts';

test('CSV preserva campos, acentos, quebras de linha e neutraliza fórmulas', () => {
  const csv = visitorCsv([{ Nome: 'José; "Teste"', Observação: 'linha 1\nlinha 2', Telefone: '+5511912345678', Risco: ' =HYPERLINK("x")' }]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"José; ""Teste"""'));
  assert.ok(csv.includes('"linha 1\nlinha 2"'));
  assert.ok(csv.includes('"\'+5511912345678"'));
  assert.ok(csv.includes('"\' =HYPERLINK(""x"")"'));
});

test('auditoria: vínculo real, responsável, busca, ficha por ID, prazos, contagem e exportação', async () => {
  const { database, d1 } = await createPilotD1();
  try {
    const worker = (await import('../dist/server/index.js')).default;
    const env = { DB: d1, AUTH_SECRET: 'completeness-test', ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    await createPilotUser(database, { nome: 'Gestora categoria', email: 'complete@example.test', senha: 'OnlyLocal123', memberships: [{ comunidadeId: 1, papel: 'PASTOR' }] });
    await createPilotUser(database, { nome: 'Membro', email: 'complete-member@example.test', senha: 'OnlyLocal123', memberships: [{ comunidadeId: 1, papel: 'MEMBRO' }] });
    const login = async email => {
      const response = await worker.fetch(await cpfLoginRequest(env, new Request('http://localhost/api/auth/login', { method: 'POST', body: new URLSearchParams({ email, senha: 'OnlyLocal123' }) })), env, ctx);
      return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    };
    const cookie = await login('complete@example.test'), member = await login('complete-member@example.test');
    const request = (path, method = 'GET', body, auth = cookie) => worker.fetch(new Request('http://localhost/api/pilot/' + path, { method, headers: { cookie: auth, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
    const call = async (path, method, body) => { const res = await request(path, method, body); assert.ok(res.ok, await res.clone().text()); return res.json(); };
    const directory = params => call('visitantes?diretorio=1&' + (params || ''));
    const user = database.prepare("SELECT id FROM usuarios WHERE email='complete@example.test'").get().id;
    const ministry = Number(database.prepare("INSERT INTO ministerios_comunidade (comunidade_id,nome) VALUES (1,'QA Acolhimento')").run().lastInsertRowid);
    const category = Number(database.prepare("INSERT INTO visitante_categorias (comunidade_id,nome,ministerio_id,responsavel_usuario_id) VALUES (1,'QA Equipe',?,?)").run(ministry, user).lastInsertRowid);
    const { id } = await call('visitantes', 'POST', { nomeCompleto: 'QA JOSÉ Ação', telefone: '(11) 91234-5678', batizado: 'NAO_INFORMADO', dataEntrada: '2026-10-01', endereco: 'Rua de teste, 10', ministerio: 'Texto antigo' });
    await call('visitantes/' + id, 'PATCH', { categoriaId: category, vincularMinisterio: true });
    const ministries = await call('ministerios');
    assert.equal(ministries.ministerios.find(m => m.id === ministry).categorias_visitantes.find(c => c.id === category).total_visitantes, 1);
    const wrongCategory = Number(database.prepare("INSERT INTO visitante_categorias (comunidade_id,nome) VALUES (2,'Outra comunidade')").run().lastInsertRowid);
    assert.equal((await request('visitantes/' + id, 'PATCH', { categoriaId: wrongCategory, vincularMinisterio: true })).status, 400);
    assert.equal((await request('visitantes/' + id, 'PATCH', { categoriaId: category, vincularMinisterio: true }, member)).status, 403);
    const invalidAge = Number(database.prepare("INSERT INTO visitante_categorias (comunidade_id,nome,ministerio_id,migracao_automatica,idade_minima,idade_maxima) VALUES (1,'QA Crianças',?,1,0,10)").run(ministry).lastInsertRowid);
    assert.equal((await request('visitantes/' + id, 'PATCH', { categoriaId: invalidAge, vincularMinisterio: true })).status, 400);
    database.prepare("INSERT INTO acompanhamentos (comunidade_id,visitante_id,responsavel_email,tipo,resultado,proximo_contato,escopo_confirmado) VALUES (1,?,'autor-diferente@example.test','TELEFONE','Contato','2000-01-01',1)").run(id);
    for (const search of ['qa jose acao', 'QA JOSÉ AÇÃO', '11912345678', '(11) 91234-5678']) {
      const data = await directory('busca=' + encodeURIComponent(search));
      assert.equal(data.total, 1, search); assert.equal(data.visitantes[0].id, id);
      assert.equal(data.visitantes[0].responsavel_nome, 'Gestora categoria');
      assert.equal(data.visitantes[0].ministerio_nome, 'QA Acolhimento');
      assert.equal(data.visitantes[0].ministerio, null);
    }
    await call('visitantes/' + id, 'PATCH', { responsavelAcompanhamento: 'Responsável individual', status: 'EM_CONTATO', proximaAcao: 'Ligar', dataProximaAcao: '2001-01-01' });
    assert.equal((await directory('busca=QA')).visitantes[0].responsavel_nome, 'Responsável individual');
    const previousCount = (await call('visitantes')).contagens.acompanhamento;
    assert.equal((await directory()).indicadores.acompanhamento, previousCount);
    assert.equal((await directory('busca=QA&contexto=acompanhamentos')).total, 0);
    await call('visitantes/' + id, 'PATCH', { status: 'EM_ACOMPANHAMENTO', proximaAcao: '', dataProximaAcao: '' });
    const completed = (await directory('busca=QA')).visitantes[0];
    assert.equal(completed.proxima_acao, null); assert.equal(completed.data_proxima_acao, null);
    assert.equal(completed.proximo_contato, '2000-01-01'); assert.equal(completed.proxima_data, '2000-01-01');
    assert.equal((await directory()).indicadores.acompanhamento, previousCount + 1);
    const others = [];
    for (let i = 0; i < 19; i++) others.push(Number(database.prepare("INSERT INTO visitantes (comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES (1,?,'2026-10-01','test',1)").run('QA Outra ' + i).lastInsertRowid));
    const foreign = Number(database.prepare("INSERT INTO visitantes (comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES (2,'QA Sigilo','2026-10-01','test',1)").run().lastInsertRowid);
    assert.ok(!(await call('visitantes')).visitantes.some(v => v.id === id));
    assert.equal((await call('visitantes?id=' + id)).visitantes[0].endereco, 'Rua de teste, 10');
    assert.equal((await call('visitantes?id=' + foreign)).visitantes.length, 0);
    const filtered = await call('visitantes/exportar?diretorio=1&busca=QA&pagina=2');
    assert.equal(filtered.rows.length, 20); assert.ok(!filtered.rows.some(row => row.ID === foreign));
    const selection = await call(`visitantes/exportar?diretorio=1&busca=QA&selecionados=${id},${others[18]},${foreign}`);
    assert.deepEqual(new Set(selection.rows.map(row => row.ID)), new Set([id, others[18]]));
    assert.equal(selection.rows.find(row => row.ID === id)['Responsável pelo acompanhamento'], 'Responsável individual');
    assert.equal((await request('visitantes/exportar?diretorio=1', 'GET', null, member)).status, 403);
    assert.equal((await request('visitantes/exportar?diretorio=1&selecionados=0')).status, 422);
    await call('visitantes/' + id, 'DELETE');
    assert.equal((await call('visitantes?id=' + id)).visitantes[0].ativo, 0);
    assert.equal((await call(`visitantes/exportar?diretorio=1&selecionados=${id}`)).rows.length, 0);
    assert.ok((await call('visitantes/exportar')).rows.some(row => row.ID === id && row.Arquivado === 'Sim'));
  } finally { database.close(); }
});
