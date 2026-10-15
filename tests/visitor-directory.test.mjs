import assert from 'node:assert/strict';
import test from 'node:test';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

test('central: filtros combinados, ordem global, paginação, histórico e isolamento', async () => {
  const { database, d1 } = await createPilotD1();
  try {
    const worker = (await import('../dist/server/index.js')).default;
    const env = { DB: d1, AUTH_SECRET: 'directory-local-test', ASSETS: { fetch: async () => new Response('', {status: 404}) } };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    await createPilotUser(database, { nome: 'Gestor teste', email: 'directory@example.test', senha: 'OnlyLocal123', memberships: [{ comunidadeId: 1, papel: 'PASTOR' }] });
    await createPilotUser(database, { nome: 'Membro teste', email: 'directory-member@example.test', senha: 'OnlyLocal123', memberships: [{ comunidadeId: 1, papel: 'MEMBRO' }] });
    const login = async email => {
      const response = await worker.fetch(await cpfLoginRequest(env, new Request('http://localhost/api/auth/login', {method: 'POST', body: new URLSearchParams({email, senha: 'OnlyLocal123'})})), env, ctx);
      return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    };
    const auth = await login('directory@example.test');
    const member = await login('directory-member@example.test');
    const request = (params='', cookie=auth) => worker.fetch(new Request('http://localhost/api/pilot/visitantes?diretorio=1&'+params, {headers: {cookie}}), env, ctx);
    const get = async params => { const res = await request(params); assert.equal(res.status, 200, await res.clone().text()); return res.json(); };
    assert.equal((await request('', member)).status, 403);
    assert.notEqual((await request('', '')).status, 200);
    for(let i=30;i>=0;i--) database.prepare("INSERT INTO visitantes (comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado,ministerio,responsavel_acompanhamento,status,proxima_acao,data_proxima_acao) VALUES (1,?,'2026-10-01','test',1,?,?,'NOVO','Retornar',?)").run('QA Pessoa '+String(i).padStart(2,'0'), i%2?'Louvor':'Acolhimento', i%2?'Ana':'Carlos', i===1?'2000-01-01':null);
    database.prepare("INSERT INTO visitantes (comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado,ministerio) VALUES (2,'QA Outra comunidade','2026-10-01','test',1,'Segredo')").run();
    let data = await get('busca=QA&ordem=nome');
    assert.equal(data.total, 31); assert.equal(data.paginas, 3); assert.equal(data.visitantes[0].nome_completo, 'QA Pessoa 00');
    assert.ok(!data.ministerios.includes('Segredo'));
    const second = await get('busca=QA&ordem=nome&pagina=2');
    assert.equal(second.visitantes[0].nome_completo, 'QA Pessoa 15');
    assert.equal(new Set([...data.visitantes,...second.visitantes].map(p=>p.id)).size,30);
    data=await get('busca=QA&status=NOVO&ministerio=Louvor&responsavel=Ana&periodo=nunca');
    assert.equal(data.total,15); assert.equal(data.visitantes[0].nome_completo,'QA Pessoa 01');
    assert.equal((await get('busca=QA&ministerio=Louvor&responsavel=Carlos')).total,0);
    assert.equal((await get('busca=QA&contexto=acompanhamentos')).total,0);
    assert.equal((await get('busca=%25')).total,0);
    const id=data.visitantes[0].id;
    database.prepare("INSERT INTO acompanhamentos (comunidade_id,visitante_id,responsavel_email,tipo,resultado,escopo_confirmado) VALUES (1,?,'directory@example.test','TELEFONE','Contato registrado',1)").run(id);
    data=await get('busca=QA&periodo=7'); assert.equal(data.total,1); assert.equal(data.visitantes[0].id,id);
    assert.equal((await get('busca=QA&pagina=999')).pagina,3);
  } finally {database.close();}
});
