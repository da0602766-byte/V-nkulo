import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

async function fixture(t){
  const {database:db,d1}=await createPilotD1();t.after(()=>db.close());
  const id=await createPilotUser(db,{nome:'Module test',email:'module@example.test',senha:'Teste123!'});
  db.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES(?,'module-session',datetime('now','+1 day'))").run(id);
  const permissions=['dashboard.view','followups.view','followups.manage','ministries.view','schedules.view','cells.view','parking.reserve','parking.edit'];
  const access={user:{id,email:'module@example.test',ativo:true},context:{comunidadeId:1,comunidadeNome:'Teste',communityAccess:'MEMBER',permissions}};
  const deps={'../../db':{getD1:()=>d1},'./local-auth':{getCurrentSessionTokenHash:async()=>'module-session'},
    './tenant':{requireTenantPermission:async p=>permissions.includes(p)?access:{error:new Response('',{status:403})}},
    './push-delivery-queue':{scheduleWebPushDelivery(){}},
    './access-security':{secureToken:()=>createHash('sha256').update(randomUUID()).digest('hex'),privateHash:async(p,v)=>createHash('sha256').update(p+v).digest('hex'),rateLimit:async()=>true}};
  for(const name of ['mobile-write','mobile-module-contract','mobile-module-storage','mobile-module-snapshot','mobile-module-operations','mobile-modules']){
    const exports={};const source=await readFile(new URL('../app/lib/'+name+'.ts',import.meta.url),'utf8');
    runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in deps,n);return deps[n];},Response,URL,Date,TextEncoder,TextDecoder,Uint8Array});deps['./'+name]=exports;
  }
  const api=deps['./mobile-modules'],deviceId=randomUUID(),tokens={};
  const req=(body,headers={})=>new Request('https://vinkulo.test/api/mobile/modules/operations',{method:'POST',headers:{origin:'https://vinkulo.test','content-type':'application/json','x-vinkulo-client':'android-modules-1','x-vinkulo-challenge':'a'.repeat(64),...headers},body:JSON.stringify(body)});
  const prepare=async module=>{const r=await api.prepareModule(req({module,deviceId}));assert.equal(r.status,200,await r.clone().text());const g=await r.json();tokens[module]=g.token;return g;};
  const write=(module,payload,operationId=randomUUID(),headers={})=>api.writeModule(req({module,payload,operationId,deviceId},{authorization:'Bearer '+tokens[module],...headers}));
  return {db,d1,id,access,permissions,prepare,write,api,req,deviceId,tokens,contract:deps['./mobile-module-contract']};
}
test('modules: all six preparations run against real schema and isolate own snapshots',async t=>{
  const f=await fixture(t);
  for(const kind of ['requests','notes','followups','checklists','cells','parking']){const g=await f.prepare(kind);assert.equal(g.module,kind);assert.ok(Array.isArray(g.snapshot.items));assert.ok(g.expiresAt-g.issuedAt<=8*3600000);}
  const other=await createPilotUser(f.db,{nome:'Other',email:'other-module@example.test',senha:'Teste123!'});
  f.db.prepare("INSERT INTO solicitacoes_comunidade(comunidade_id,solicitante_id,tipo,titulo,descricao,visibilidade) VALUES(1,?,'OUTRO','Secret','Other data','PRIVADA')").run(other);
  assert.equal((await f.prepare('requests')).snapshot.items.some(i=>i.label==='Secret'),false);
});
const note={titulo:'Private note',texto:'Saved text',cor:'amarelo'};
test('modules: notes append atomically, replay once, reject changed payload, never evict quota',async t=>{
  const f=await fixture(t);await f.prepare('notes');const op=randomUUID();
  const first=await f.write('notes',note,op);assert.equal(first.status,200,await first.clone().text());const receipt=await first.json();
  assert.deepEqual(await(await f.write('notes',note,op)).json(),receipt);
  assert.equal((await f.write('notes',{...note,texto:'Changed'},op)).status,409);
  assert.equal((await f.prepare('notes')).snapshot.items.length,1);
  for(let i=1;i<80;i++)assert.equal((await f.write('notes',note)).status,200);
  assert.equal((await f.write('notes',note)).status,409);
  const row=f.db.prepare("SELECT configuracao FROM layouts_interface WHERE escopo=?").get('care-notes:user:'+f.id);assert.equal(JSON.parse(row.configuracao).notes.length,80);
  assert.equal(f.db.prepare('SELECT count(*) n FROM mobile_module_receipts WHERE result=?').get('CONFIRMED').n,80);
});
test('modules: request receipt, audience, care repository and notifications commit once',async t=>{
  const f=await fixture(t);const pastor=await createPilotUser(f.db,{nome:'Pastor',email:'pastor-module@example.test',senha:'Teste123!',memberships:[{comunidadeId:1,papel:'PASTOR'}]});
  await f.prepare('requests');const op=randomUUID(),p={tipo:'ORACAO',titulo:'Pedido fictício',descricao:'Descrição de teste de oração',visibilidade:'PRIVADA'};
  const first=await f.write('requests',p,op);assert.equal(first.status,200,await first.clone().text());const receipt=await first.json();
  assert.equal(f.db.prepare('SELECT count(*) n FROM solicitacao_repositorio_itens WHERE solicitacao_id=?').get(receipt.resultId).n,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM solicitacao_destinatarios WHERE solicitacao_id=? AND usuario_id=?').get(receipt.resultId,pastor).n,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM notificacoes_sistema WHERE entidade_id=? AND area=?').get(receipt.resultId,'SOLICITACOES').n,1);
  assert.deepEqual(await(await f.write('requests',p,op)).json(),receipt);
  assert.equal(f.db.prepare('SELECT count(*) n FROM solicitacao_eventos WHERE solicitacao_id=?').get(receipt.resultId).n,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM notificacoes_sistema WHERE entidade_id=? AND area=?').get(receipt.resultId,'SOLICITACOES').n,1);
  f.db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=?").run(pastor);
  const next=await(await f.write('requests',p)).json();assert.equal(f.db.prepare('SELECT count(*) n FROM solicitacao_destinatarios WHERE solicitacao_id=? AND usuario_id=?').get(next.resultId,pastor).n,0);
});
test('modules: rollback preserves retry and no partial notification/audit',async t=>{
  const f=await fixture(t);await f.prepare('parking');const op=randomUUID(),p={tipo:'DANO',gravidade:'BAIXA',descricao:'Ocorrência de teste'};
  f.db.exec("CREATE TRIGGER fail_module_audit BEFORE INSERT ON auditoria_piloto WHEN NEW.evento='MODULO_MOBILE_CONFIRMADO' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  await assert.rejects(f.write('parking',p,op),/test rollback/);assert.equal(f.db.prepare('SELECT count(*) n FROM mobile_module_receipts').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM estacionamento_ocorrencias WHERE descricao=?').get(p.descricao).n,0);
  f.db.exec('DROP TRIGGER fail_module_audit');assert.equal((await f.write('parking',p,op)).status,200);
});
test('modules: followup validates tenant/active person, current permission, session and module grants',async t=>{
  const f=await fixture(t);await f.prepare('followups');
  const id=Number(f.db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,data_entrada,criado_por,escopo_confirmado) VALUES(1,'Test','2026-09-27','test',1)").run().lastInsertRowid);
  const p={visitanteId:id,tipo:'PRESENCIAL',resultado:'Contact made',descricao:'',proximoContato:''};const op=randomUUID();
  assert.equal((await f.write('followups',p,op)).status,200);assert.equal((await f.prepare('followups')).snapshot.options.length,1);
  assert.equal((await f.write('followups',{...p,proximoContato:'2026-02-30'})).status,422);
  f.db.prepare('UPDATE visitantes SET ativo=0 WHERE id=?').run(id);assert.equal((await f.write('followups',p)).status,409);
  f.permissions.splice(f.permissions.indexOf('followups.manage'),1);assert.equal((await f.write('followups',p,op)).status,403);
  await f.prepare('notes');assert.equal((await f.write('notes',note,randomUUID(),{authorization:'Bearer '+f.tokens.followups})).status,401);
  assert.equal((await f.write('notes',note,randomUUID(),{origin:'https://evil.test'})).status,403);
  f.access.context.comunidadeId=2;assert.equal((await f.write('notes',note)).status,401);
});
test('modules: own checklist CAS observes online changes, assignment removal, replay and version trigger',async t=>{
  const f=await fixture(t),run=(s,...a)=>Number(f.db.prepare(s).run(...a).lastInsertRowid);
  const m=run("INSERT INTO ministerios_comunidade(comunidade_id,nome) VALUES(1,'Module test')");
  const v=run("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,funcao) VALUES(1,?,?,'Test')",m,f.id);
  const e=run("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES(1,?,'Test','2026-09-27','2026-09-28','PUBLICADA')",m);
  const d=run("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao) VALUES(1,?,?,?,'Test')",e,v,f.id);
  const id=run("INSERT INTO ministerio_checklist_itens(comunidade_id,escala_id,designacao_id,tarefa) VALUES(1,?,?,'Task')",e,d);
  const g=await f.prepare('checklists');assert.equal(g.snapshot.items[0].version,0);
  const p={itemId:id,version:0,status:'FEITO',observacao:'Done'},op=randomUUID();assert.equal((await f.write('checklists',p,op)).status,200);
  assert.equal((await f.write('checklists',p,op)).status,200);assert.equal(f.db.prepare('SELECT version FROM mobile_checklist_versions WHERE item_id=?').get(id).version,1);
  assert.equal((await f.write('checklists',p)).status,409);
  f.db.prepare("UPDATE ministerio_checklist_itens SET observacao='Online' WHERE id=?").run(id);
  assert.equal((await f.write('checklists',{...p,version:1})).status,409);
  f.db.prepare('UPDATE escala_designacoes SET ativo=0 WHERE id=?').run(d);
  assert.equal((await f.write('checklists',{...p,version:2})).status,409);assert.equal((await f.prepare('checklists')).snapshot.items.length,0);
});
test('modules: built Worker rechecks real permissions, plan and unauthenticated requests',async t=>{
  const f=await fixture(t),tasks=[];t.after(async()=>Promise.allSettled(tasks));
  f.db.prepare("UPDATE usuario_comunidades SET papel='PASTOR' WHERE usuario_id=?").run(f.id);
  const worker=(await import('../dist/server/index.js')).default,env={DB:f.d1,AUTH_SECRET:'module-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(p){tasks.push(p);},passThroughOnException(){}};
  const login=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'module@example.test',senha:'Teste123!'})})),env,ctx);
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0];
  const call=(path,body,token='',auth=cookie)=>worker.fetch(new Request('http://localhost/api/mobile/modules/'+path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','x-vinkulo-client':'android-modules-1','x-vinkulo-challenge':'b'.repeat(64),cookie:auth,authorization:'Bearer '+token},body:JSON.stringify(body)}),env,ctx);
  const body={module:'notes',deviceId:f.deviceId};assert.equal((await call('prepare',body,'','')).status,401);
  const prep=await call('prepare',body);assert.equal(prep.status,200,await prep.clone().text());const grant=await prep.json();
  const operation={...body,operationId:randomUUID(),payload:note};assert.equal((await call('operations',operation,grant.token)).status,200);
  const requests={module:'requests',deviceId:f.deviceId};assert.equal((await call('prepare',requests)).status,200);
  const plan={id:'gratuito',nome:'Contrato teste',descricao:'',valor_centavos:0,periodicidade:'MENSAL',duracao_dias:null,ativo:true,contratavel:true,destaque:false,personalizado:false,modulos:['events','ministries','visitors','cells','parking','people'],recursos:['feed','reports'],limites:{usuarios:null,administradores:null,cadastros:null,celulas:null,ministerios:null},condicoes:'',versao:1};
  f.db.prepare("INSERT INTO assinaturas_comunidade(comunidade_id,plano_id,status,contrato,fundamento,aprovado_por) VALUES(1,'gratuito','ATIVA',?,'GRATUITO',?)").run(JSON.stringify(plan),f.id);
  assert.equal((await call('prepare',requests)).status,403);
  f.db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=?").run(f.id);
  assert.equal((await call('operations',operation,grant.token)).status,403);
});
test('notes: online compare-and-set cannot overwrite an intervening offline append',async t=>{
  const f=await fixture(t);await f.prepare('notes');assert.equal((await f.write('notes',note)).status,200);
  const exports={},deps={'../../../../db':{getD1:()=>f.d1},'../../../lib/tenant-audit':{recordTenantAudit:async()=>{}},'../../../lib/tenant':{requireTenantPermission:async()=>f.access}};
  const source=await readFile(new URL('../app/api/pilot/anotacoes/route.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source+'\nexport {readNotes,saveNotes};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>deps[n],Response,URL,Date,crypto:globalThis.crypto});
  const before=await exports.readNotes(1,f.id);assert.equal((await f.write('notes',{...note,titulo:'Offline second'})).status,200);
  assert.equal(await exports.saveNotes(1,f.id,before.notes,before.version),false);
  const after=await exports.readNotes(1,f.id);assert.equal(after.notes.length,2);
  assert.equal(await exports.saveNotes(1,f.id,after.notes,after.version),true);
});
test('modules: cells, parking and personal notes export no unrelated people or contact fields',async t=>{
  const f=await fixture(t),run=(sql,...params)=>Number(f.db.prepare(sql).run(...params).lastInsertRowid);
  const other=await createPilotUser(f.db,{nome:'Other reader',email:'other-reader@example.test',senha:'Teste123!'});
  const cell=(name,members,created)=>run("INSERT INTO celulas(comunidade_id,nome,responsavel,membros,criado_por,ativo,escopo_confirmado) VALUES(1,?,'Responsible',?,?,1,1)",name,JSON.stringify(members),created);
  const mine=cell('Own cell',[{kind:'COMMUNITY',userId:f.id,name:'My name'},{kind:'COMMUNITY',userId:other,name:'Do not export'}],'not-me');
  cell('Other cell',[{kind:'COMMUNITY',userId:other}], 'not-me');cell('Legacy array',['Legacy name'], 'not-me');
  const cells=await f.prepare('cells');assert.deepEqual(cells.snapshot.items.map(i=>i.id),[mine]);assert.doesNotMatch(JSON.stringify(cells.snapshot),/Do not export|Legacy name|Other cell/);assert.equal(cells.canWrite,false);
  assert.equal((await f.write('cells',{celulaId:mine,data:'2026-09-27',observacoes:'Draft'})).status,422);
  const sector=run("INSERT INTO estacionamento_setores(comunidade_id,nome) VALUES(1,'Module sector')"),space=run("INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo) VALUES(1,?,'TEST-01')",sector);
  const reserve=(user,code)=>run("INSERT INTO estacionamento_reservas(comunidade_id,vaga_id,usuario_id,nome_completo,email,documento_hash,documento_mascarado,inicio_em,fim_em,codigo) VALUES(1,?,?,'Private person','private@example.test','secret-hash','secret-doc','2026-09-27','2026-09-28',?)",space,user,code);
  const own=reserve(f.id,'OWN-RECEIPT');reserve(other,'OTHER-RECEIPT');const parking=await f.prepare('parking');assert.deepEqual(parking.snapshot.items.map(i=>i.id),[own]);assert.match(JSON.stringify(parking.snapshot),/OWN-RECEIPT/);assert.doesNotMatch(JSON.stringify(parking.snapshot),/OTHER-RECEIPT|private@example|secret-doc|secret-hash|Private person/);
  run("INSERT INTO layouts_interface(comunidade_id,usuario_id,escopo,configuracao) VALUES(1,?,?,?)",other,'care-notes:user:'+other,JSON.stringify({notes:[{id:'other',titulo:'Secret note',texto:'Other private data'}]}));
  assert.equal((await f.prepare('notes')).snapshot.items.length,0);
  f.db.prepare('UPDATE mobile_module_grants SET expires_at=0').run();assert.equal((await f.write('notes',note)).status,401);
});
