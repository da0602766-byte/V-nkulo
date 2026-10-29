import assert from 'node:assert/strict';
import test from 'node:test';
import { isVisitorDate, parseVisitorCare, visitorAge, visitorAgeGroup, visitorBoolean } from '../app/lib/visitor-care.ts';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

test('datas reais, aniversário e respostas desconhecidas', () => {
  assert.equal(isVisitorDate('2026-02-30'), false);
  assert.equal(isVisitorDate('2024-02-29'), true);
  assert.equal(visitorAge('2008-10-15', '2026-10-14'), 17);
  assert.equal(visitorAgeGroup('2008-10-14', '2026-10-14'), 'Adulto');
  assert.equal(visitorBoolean('false'), false);
  assert.equal(visitorBoolean('on'), true);
  assert.equal(parseVisitorCare({}).values.discipulado, 'NAO_INFORMADO');
  assert.ok(parseVisitorCare({ discipulado: 'SIM' }).error);
  assert.ok(parseVisitorCare({ oficial: 'SIM' }).error);
  assert.ok(parseVisitorCare({ dataProximaAcao: '2026-10-14' }).error);
  assert.equal(parseVisitorCare({ status: 'INTEGRADO' }, { discipulado: 'SIM', discipulador: 'Ana' }).values.discipulador, 'Ana');
});

test('ficha completa, filtros, exportação, histórico e isolamento no Worker real', async () => {
  const {database, d1} = await createPilotD1();
  try {
    const worker = (await import('../dist/server/index.js')).default;
    const env = { DB:d1, AUTH_SECRET:'visitor-care-test-only-secret', ASSETS:{fetch:async()=>new Response('',{status:404})} };
    const ctx = {waitUntil(){},passThroughOnException(){}};
    await createPilotUser(database,{nome:'Gestora',email:'gestora@example.test',senha:'TestCare123',memberships:[{comunidadeId:1,papel:'PASTOR'}]});
    await createPilotUser(database,{nome:'Membro',email:'membro@example.test',senha:'TestCare123',memberships:[{comunidadeId:1,papel:'MEMBRO'}]});
    async function login(email) {
      const response=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email,senha:'TestCare123'})})),env,ctx);
      assert.equal(response.status,303);
      return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    }
    const cookie=await login('gestora@example.test');
    const call=(path,method='GET',body,auth=cookie)=>worker.fetch(new Request('http://localhost'+path,{method,headers:{cookie:auth,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
    assert.notEqual((await call('/api/pilot/visitantes','GET',null,'')).status,200);
    const member=await login('membro@example.test');
    assert.equal((await call('/api/pilot/visitantes','GET',null,member)).status,403);
    assert.equal((await call('/api/pilot/visitantes/exportar','GET',null,member)).status,403);
    assert.equal((await call('/api/pilot/visitantes/planilha','GET',null,member)).status,403);
    let response=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Pessoa completa de teste',dataEntrada:'2026-01-10',dataNascimento:'1990-04-21',batizado:'SIM',certificadoBatismo:'NAO',discipulado:'SIM',discipulador:'Ana',oficial:'SIM',funcaoOficial:'Diácono',doaADoa:'SIM',doaReceber:'SIM',doacoesRealizadas:'2026-10-01: alimentos',responsavelAcompanhamento:'Carlos',proximaAcao:'Visita',dataProximaAcao:'2000-01-01',tipoPessoa:'MEMBRO'});
    assert.equal(response.status,201,await response.clone().text());
    const {id}=await response.json();
    response=await call(`/api/pilot/visitantes/${id}`,'PATCH',{status:'INTEGRADO'});
    assert.equal(response.status,200,await response.clone().text());
    let person=database.prepare('SELECT * FROM visitantes WHERE id=?').get(id);
    assert.equal(person.discipulador,'Ana'); assert.equal(person.tipo_pessoa,'MEMBRO'); assert.equal(person.nome_completo,'Pessoa completa de teste');
    assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{dataNascimento:'2026-02-30'})).status,400);
    assert.equal((await call('/api/pilot/visitantes','POST',{nomeCompleto:'Data inválida',dataEntrada:'2026-02-30'})).status,400);
    assert.equal((await call('/api/pilot/acompanhamentos','POST',{visitanteId:id,tipo:'VISITA',resultado:'Visitada',proximoContato:'2026-02-30'})).status,400);
    response=await call('/api/pilot/acompanhamentos','POST',{visitanteId:id,tipo:'VISITA',resultado:'Visitada'});
    assert.equal(response.status,201,await response.clone().text());
    assert.equal(database.prepare('SELECT status FROM visitantes WHERE id=?').get(id).status,'INTEGRADO');
    for(const vision of ['sem_celula','sem_ministerio','certificado','apoio_social','pendencias']) {
      response=await call('/api/pilot/visitantes?visao='+vision); assert.equal(response.status,200,await response.clone().text());
      const result=await response.json(); assert.ok(result.visitantes.some(v=>v.id===id),vision); assert.ok(result.contagens[vision]>0);
    }
    const foreign=Number(database.prepare("INSERT INTO visitantes (comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES (2,'Outra comunidade','2026-01-01','other',1)").run().lastInsertRowid);
    assert.equal((await call(`/api/pilot/visitantes/${foreign}`,'PATCH',{status:'INTEGRADO'})).status,404);
    for(let i=0;i<16;i++) database.prepare("INSERT INTO visitantes (comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES (1,?,'2026-01-01','test',1)").run('Página extra '+i);
    const exported=await (await call('/api/pilot/visitantes/exportar')).json();
    assert.ok(exported.rows.length>10); assert.ok(!exported.rows.some(r=>r.ID===foreign)); assert.equal(exported.rows.find(r=>r.ID===id).Discipulador,'Ana');
    assert.equal((await call(`/api/pilot/visitantes/${id}`,'DELETE')).status,200);
    const history=await (await call('/api/pilot/acompanhamentos?visitanteId='+id)).json(); assert.equal(history.acompanhamentos.length,1);
    assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{reativar:true})).status,200);
    assert.equal(database.prepare('SELECT ativo FROM visitantes WHERE id=?').get(id).ativo,1);
    response=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Irmão um',parente:'Mesmo familiar',dataEntrada:'2026-01-01'}); assert.equal(response.status,201);
    response=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Irmão dois',parente:'Mesmo familiar',dataEntrada:'2026-01-01'}); assert.equal(response.status,201);
    response=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Irmão dois',dataEntrada:'2026-01-01'}); assert.equal(response.status,409);
    response=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Irmão dois',dataEntrada:'2026-01-01',confirmarDuplicidade:true}); assert.equal(response.status,201);
  } finally {database.close();}
});
