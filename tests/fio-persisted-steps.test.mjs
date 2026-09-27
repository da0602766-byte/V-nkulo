import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';
test('Fio persisted JSON can be toggled and edited without losing progress; missing steps are rejected',async()=>{
 const {database:db,d1}=await createPilotD1();
 const tasks=[];const ctx={waitUntil(p){tasks.push(p)},passThroughOnException(){}};
 const env={DB:d1,AUTH_SECRET:'fio-integration-secret',ASSETS:{fetch:async()=>new Response('',{status:404})}};
 const worker=(await import('../dist/server/index.js')).default;
 const id=await createPilotUser(db,{nome:'Lider teste',email:'fio@test.invalid',senha:'Teste123!',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
 const login=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'fio@test.invalid',senha:'Teste123!'})})),env,ctx);
 const cookie=login.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0];
 const ministry=Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,categoria,status,responsavel_usuario_id,criado_por,atualizado_por) VALUES(1,'Louvor','LOUVOR','ATIVO',?,?,?)").run(id,id,id).lastInsertRowid);
 const steps=[{id:'etapa-1',titulo:'Som testado',feito:false,feitoEm:null,feitoPor:null},{id:'etapa-2',titulo:'Equipe avisada',feito:false,feitoEm:null,feitoPor:null}];
 const schedule=Number(db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status,fio_etapas,criado_por,atualizado_por) VALUES(1,?,'Encontro','2026-10-01T18:00:00Z','2026-10-01T20:00:00Z','PUBLICADA',?,?,?)").run(ministry,JSON.stringify(steps),id,id).lastInsertRowid);
 const patch=(body,auth=cookie)=>worker.fetch(new Request('http://localhost/api/pilot/escalas/'+schedule,{method:'PATCH',headers:{cookie:auth,'content-type':'application/json'},body:JSON.stringify(body)}),env,ctx);
 try{
  let r=await patch({acao:'FIO_ETAPA',etapaId:'etapa-1',feito:true});assert.equal(r.status,200,await r.clone().text());
  let stored=JSON.parse(db.prepare('SELECT fio_etapas FROM escalas_ministerio WHERE id=?').get(schedule).fio_etapas);assert.equal(stored[0].feito,true);assert.equal(stored[0].feitoPor,id);
  r=await patch({acao:'FIO_ETAPAS_DEFINIR',fioEtapas:steps});assert.equal(r.status,200,await r.clone().text());
  stored=JSON.parse(db.prepare('SELECT fio_etapas FROM escalas_ministerio WHERE id=?').get(schedule).fio_etapas);assert.equal(stored[0].feito,true);
  r=await patch({acao:'FIO_ETAPA',etapaId:'etapa-1',feito:false});assert.equal(r.status,200);stored=JSON.parse(db.prepare('SELECT fio_etapas FROM escalas_ministerio WHERE id=?').get(schedule).fio_etapas);assert.equal(stored[0].feito,false);assert.equal(stored[0].feitoEm,null);
  assert.equal((await patch({acao:'FIO_ETAPA',etapaId:'removed-step',feito:true})).status,404);
  assert.equal((await patch({acao:'FIO_ETAPA',etapaId:'etapa-1',feito:true},'')).status,401);
 }finally{await Promise.allSettled(tasks);db.close()}
});
