import assert from 'node:assert/strict';
import test from 'node:test';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

test('página dedicada protege acesso, redireciona links antigos e mantém cadastro, histórico e arquivados',async()=>{
 const {database:db,d1}=await createPilotD1();
 try {
  const worker=(await import('../dist/server/index.js')).default;
  const env={DB:d1,AUTH_SECRET:'visitors-page-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(){},passThroughOnException(){}};
  await createPilotUser(db,{nome:'Gestor da página',email:'vp@example.test',senha:'PaginaTest123',memberships:[{comunidadeId:1,papel:'ADMIN_COMUNIDADE'}]});
  await createPilotUser(db,{nome:'Sem acesso',email:'vp-member@example.test',senha:'PaginaTest123',memberships:[{comunidadeId:1,papel:'MEMBRO'}]});
  async function login(email){const r=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',body:new URLSearchParams({email,senha:'PaginaTest123'})})),env,ctx);assert.equal(r.status,303);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
  const auth=await login('vp@example.test'),member=await login('vp-member@example.test');
  const call=(path,method='GET',body,cookie=auth)=>worker.fetch(new Request('http://localhost'+path,{method,headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
  for(const cookie of [member,''])assert.notEqual((await call('/api/pilot/visitantes/pagina','GET',null,cookie)).status,200);
  const denied=await call('/painel/visitantes','GET',null,member);assert.equal(denied.status,200);assert.match(await denied.text(),/Acesso a Visitantes indisponível/);
  const signedOut=await call('/painel/visitantes','GET',null,'');assert.ok([302,303,307].includes(signedOut.status));assert.match(signedOut.headers.get('location'),/login/);
  let r=await call('/painel?view=visitantes&sheetSetup=authorized&visitante=19');assert.ok([302,303,307].includes(r.status));assert.equal(new URL(r.headers.get('location'),'http://localhost').pathname+new URL(r.headers.get('location'),'http://localhost').search,'/painel/visitantes?sheetSetup=authorized&visitante=19');
  r=await call('/painel/visitantes');assert.equal(r.status,200);assert.match(await r.text(),/Visitantes/);
  db.prepare("INSERT INTO visitante_campos(comunidade_id,nome,chave,tipo,criado_por) VALUES(1,'Campo local','campo local','TEXTO','test'),(2,'Campo privado','campo privado','TEXTO','foreign')").run();
  const snapshot=await (await call('/api/pilot/visitantes/pagina')).json();
  assert.ok(snapshot.campos.some(f=>f.nome==='Campo local'));assert.equal(snapshot.campos.some(f=>f.nome==='Campo privado'),false);
  assert.ok(Array.isArray(snapshot.categorias));assert.ok(Array.isArray(snapshot.celulas));
  assert.ok(snapshot.responsaveis.some(p=>p.nome==='Gestor da página'));assert.ok(Array.isArray(snapshot.ministerios));
  r=await call('/api/pilot/visitantes','POST',{nomeCompleto:'Pessoa da página dedicada',dataEntrada:'2026-10-01',dataNascimento:'2000-10-22',proximaAcao:'Receber na célula',dataProximaAcao:'2026-10-20'});assert.equal(r.status,201);const {id}=await r.json();
  db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES(2,'Pessoa privada','2026-10-01','foreign',1)").run();
  r=await call('/api/pilot/acompanhamentos','POST',{visitanteId:id,tipo:'PRESENCIAL',resultado:'Contato de teste',proximoContato:'2026-10-21'});assert.equal(r.status,201);
  r=await call('/api/pilot/visitantes/pagina');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);let body=await r.json();assert.equal(body.visitantes.some(p=>p.nome_completo==='Pessoa privada'),false);let p=body.visitantes.find(p=>p.id===id);assert.equal(p.status,'EM_ACOMPANHAMENTO');assert.equal(p.proximo_contato,'2026-10-21');assert.equal(p.data_proxima_acao,'2026-10-20');assert.ok(p.ultimo_contato);
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{nomeCompleto:'Pessoa atualizada'})).status,200);
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'DELETE')).status,200);
  body=await (await call('/api/pilot/visitantes/pagina')).json();p=body.visitantes.find(p=>p.id===id);assert.equal(p.ativo,0);assert.equal(p.nome_completo,'Pessoa atualizada');assert.equal(p.data_nascimento,'2000-10-22');
  assert.equal((await call(`/api/pilot/visitantes/${id}`,'PATCH',{reativar:true})).status,200);
  body=await (await call('/api/pilot/visitantes/pagina')).json();assert.equal(body.visitantes.find(p=>p.id===id).ativo,1);
 }finally{db.close();}
});
