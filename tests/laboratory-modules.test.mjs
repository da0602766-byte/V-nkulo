import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';
async function fixture(){
 const {database,d1}=await createPilotD1(),worker=(await import('../dist/server/index.js')).default;
 const env={DB:d1,AUTH_SECRET:'lab-test-only',SYSTEM_OWNER_EMAIL:'owner@lab.test',SYSTEM_OWNER_LOCKED_BEFORE:'2099-01-01',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};
 for(const [nome,email,papel,comunidadeId] of [['Owner',env.SYSTEM_OWNER_EMAIL,'MEMBRO',1],['Leader','leader@lab.test','PASTOR',1],['Member','member@lab.test','MEMBRO',1],['Other','other@lab.test','PASTOR',2]])await createPilotUser(database,{nome,email,senha:'LabTestOnly123!',memberships:[{papel,comunidadeId}]});
 const login=async email=>{const r=await worker.fetch(await cpfLoginRequest(env,new Request('https://test.invalid/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha:'LabTestOnly123!'})})),env,ctx);assert.equal(r.status,200,await r.clone().text());return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
 const owner=await login(env.SYSTEM_OWNER_EMAIL),leader=await login('leader@lab.test'),member=await login('member@lab.test'),other=await login('other@lab.test');
 const call=(path,body,cookie=owner)=>worker.fetch(new Request('https://test.invalid'+path,{method:body?'POST':'GET',headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
 const ok=async(path,body,cookie)=>{const r=await call(path,body,cookie);assert.equal(r.status,200,await r.clone().text());return r.json();};
 const definition={name:'Agenda de visitas',description:'Teste isolado',fields:[{id:'f_nome',label:'Nome',type:'text',required:true,options:[]},{id:'f_status',label:'Status',type:'select',required:true,options:['Pendente','Feito']}],communities:[1,2],readers:['PASTOR','MEMBRO'],writers:['PASTOR'],allowCreate:true,allowEdit:true,allowArchive:true};
 return {database,call,ok,owner,leader,member,other,definition};
}
test('laboratório publica snapshots, isola comunidades, valida registros e restaura versões',async()=>{
 const f=await fixture();try{
  const endpoint='/api/proprietario/modulos';
  assert.equal((await f.call(endpoint,undefined,f.member)).status,403);
  assert.equal((await f.call(endpoint,{action:'create',definition:f.definition},f.leader)).status,403);
  let m=(await f.ok(endpoint,{action:'create',definition:f.definition})).module;
  const runtime='/api/modulos/'+m.id;
  assert.equal((await f.call(runtime,undefined,f.leader)).status,403,'draft never appears in runtime');
  m=(await f.ok(endpoint,{action:'publish',id:m.id,revision:m.revision})).module;
  assert.equal(m.published.version,1);
  assert.equal((await f.ok('/api/modulos',undefined,f.member)).modules.length,1);
  assert.equal((await f.ok(runtime,undefined,f.member)).canWrite,false);
  assert.equal((await f.call(runtime,{action:'create',version:1,values:{f_nome:'Teste',f_status:'Pendente'}},f.member)).status,403);
  assert.equal((await f.call(runtime,{action:'create',version:1,values:{f_nome:'',f_status:'Pendente'}},f.leader)).status,400);
  assert.equal((await f.call(runtime,{action:'create',version:1,values:{f_nome:'Nome',f_status:'Inventado'}},f.leader)).status,400);
  let record=(await f.ok(runtime,{action:'create',version:1,values:{f_nome:'Registro de teste',f_status:'Pendente'}},f.leader)).record;
  assert.equal((await f.ok(runtime,undefined,f.other)).records.length,0,'other community cannot read data');
  assert.equal((await f.call(runtime,{action:'save',version:1,id:record.id,revision:1,values:{f_nome:'Intruso',f_status:'Feito'}},f.other)).status,404);
  record=(await f.ok(runtime,{action:'save',version:1,id:record.id,revision:1,values:{f_nome:'Atualizado',f_status:'Feito'}},f.leader)).record;
  assert.equal((await f.call(runtime,{action:'save',version:1,id:record.id,revision:1,values:{f_nome:'Antigo',f_status:'Feito'}},f.leader)).status,409);
  const originalRevision=m.revision;
  m=(await f.ok(endpoint,{action:'save',id:m.id,revision:m.revision,definition:{...f.definition,name:'Visitas atualizadas'}})).module;
  assert.equal((await f.ok(runtime,undefined,f.leader)).definition.name,'Agenda de visitas','draft edits do not leak');
  assert.equal((await f.call(endpoint,{action:'publish',id:m.id,revision:originalRevision})).status,409);
  m=(await f.ok(endpoint,{action:'publish',id:m.id,revision:m.revision})).module;
  assert.equal((await f.call(runtime,{action:'create',version:1,values:{f_nome:'Velho formulário',f_status:'Pendente'}},f.leader)).status,409);
  m=(await f.ok(endpoint,{action:'rollback',id:m.id,revision:m.revision,version:1})).module;
  assert.equal(m.published.version,3);assert.equal(m.published.definition.name,'Agenda de visitas');
  assert.equal(m.draft.name,'Visitas atualizadas');
  record=(await f.ok(runtime,{action:'archive',version:3,id:record.id,revision:record.revision},f.leader)).record;
  assert.equal((await f.ok(runtime,undefined,f.leader)).records.length,0);
  assert.equal((await f.ok(runtime+'?archived=true',undefined,f.leader)).records.length,1);
  await f.ok(runtime,{action:'restore',version:3,id:record.id,revision:record.revision},f.leader);
  m=(await f.ok(endpoint,{action:'unpublish',id:m.id,revision:m.revision})).module;
  assert.equal((await f.call(runtime,undefined,f.leader)).status,403);
  assert.equal((await f.ok('/api/modulos',undefined,f.leader)).modules.length,0);
  m=(await f.ok(endpoint,{action:'publish',id:m.id,revision:m.revision})).module;
  assert.equal((await f.ok(runtime,undefined,f.leader)).records[0].values.f_nome,'Atualizado');
  assert.ok(f.database.prepare("SELECT COUNT(*) n FROM auditoria_piloto WHERE evento LIKE 'LAB_%'").get().n>0);
 }finally{f.database.close();}
});
test('bloqueia publicação incompleta, mudança de tipo publicado e destino não ativo',async()=>{
 const f=await fixture();try{
  const endpoint='/api/proprietario/modulos';let m=(await f.ok(endpoint,{action:'create',definition:{...f.definition,communities:[]}})).module;
  assert.equal((await f.call(endpoint,{action:'publish',id:m.id,revision:m.revision})).status,400);
  m=(await f.ok(endpoint,{action:'save',id:m.id,revision:m.revision,definition:f.definition})).module;
  m=(await f.ok(endpoint,{action:'publish',id:m.id,revision:m.revision})).module;
  m=(await f.ok(endpoint,{action:'save',id:m.id,revision:m.revision,definition:{...f.definition,fields:[{...f.definition.fields[0],type:'number'}]}})).module;
  assert.equal((await f.call(endpoint,{action:'publish',id:m.id,revision:m.revision})).status,400);
  m=(await f.ok(endpoint,{action:'save',id:m.id,revision:m.revision,definition:{...f.definition,communities:[99999]}})).module;
  assert.equal((await f.call(endpoint,{action:'publish',id:m.id,revision:m.revision})).status,400);
  const copy=(await f.ok(endpoint,{action:'duplicate',id:m.id,revision:m.revision})).module;
  assert.equal(copy.published,null);assert.equal(copy.releases.length,0);
  assert.notEqual(copy.id,m.id);
 }finally{f.database.close();}
});
