import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import {createPilotD1,createPilotUser} from './helpers/sqlite-d1.mjs';
import {cpfLoginRequest} from './helpers/cpf-login.mjs';

async function fixture(t) {
  const {database:db,d1}=await createPilotD1();t.after(()=>db.close());
  const id=await createPilotUser(db,{nome:'Offline writer',email:'writer@example.test',senha:'Teste123!'});
  db.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES(?,'write-session',datetime('now','+1 day'))").run(id);
  let access={user:{id,email:'writer@example.test',ativo:true},context:{comunidadeId:1,comunidadeNome:'Teste',communityAccess:'MEMBER'}}, session='write-session',limited=false;
  const exports={};const deps={
    './visitor-drive-store':{visitorDriveConfig:async id=>db.prepare('SELECT * FROM visitante_drive WHERE comunidade_id=?').get(id)},'../../db':{getD1:()=>d1},'./local-auth':{getCurrentSessionTokenHash:async()=>session},
    './tenant':{requireTenantPermission:async permission=>{assert.equal(permission,'visitors.create');return access;}},
    './access-security':{secureToken:()=>createHash('sha256').update(randomUUID()).digest('hex'),privateHash:async(p,v)=>createHash('sha256').update(p+v).digest('hex'),rateLimit:async()=>!limited},
  };
  const source=await readFile(new URL('../app/lib/mobile-write.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:n=>{assert.ok(n in deps,n);return deps[n];},Response,URL,Date,TextEncoder,TextDecoder,Uint8Array});
  const deviceId=randomUUID();
  const request=(body,headers={})=>new Request('https://vinkulo.test/api/mobile/visitors',{method:'POST',headers:{origin:'https://vinkulo.test','content-type':'application/json','x-vinkulo-client':'android-write-1','x-vinkulo-challenge':'a'.repeat(64),...headers},body:JSON.stringify(body)});
  const prepared=await exports.prepareMobileWrite(request({deviceId}));assert.equal(prepared.status,200,await prepared.clone().text());const grant=await prepared.json();
  const visitor={nomeCompleto:'Visitante fictício',telefone:'(11) 99999-1234',email:'visitor@example.test',dataEntrada:'2026-09-27'};
  const write=(operationId=randomUUID(),data=visitor,headers={})=>exports.createMobileVisitor(request({deviceId,operationId,visitor:data},{authorization:'Bearer '+grant.token,...headers}));
  return {db,d1,id,grant,deviceId,visitor,write,request,api:exports,setAccess:v=>{access=v;},access,setSession:v=>{session=v;},limit:()=>{limited=true;}};
}
test('mobile write: receipt and visitor are atomic, replay survives lost response without a second audit',async t=>{
  const f=await fixture(t),op=randomUUID();const first=await f.write(op);assert.equal(first.status,200);const receipt=await first.json();
  assert.equal(receipt.result,'CONFIRMED');assert.ok(receipt.visitorId>0);
  assert.deepEqual(await (await f.write(op)).json(),receipt);
  assert.equal(f.db.prepare('SELECT count(*) n FROM visitantes WHERE id=?').get(receipt.visitorId).n,1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM auditoria_piloto WHERE evento='VISITANTE_MOBILE_CRIADO'").get().n,1);
  assert.equal((await f.write(op,{...f.visitor,nomeCompleto:'Changed'})).status,409);
  const stored=f.db.prepare('SELECT * FROM mobile_visitor_receipts').get();assert.equal(stored.visitor_id,receipt.visitorId);
  assert.doesNotMatch(JSON.stringify(stored),/visitor@example|99999|Visitante fict/);
});
test('mobile write: duplicate contacts conflict, other tenant does not leak or prevent creation',async t=>{
  const f=await fixture(t);const a=await (await f.write()).json();assert.ok(a.visitorId);
  const op=randomUUID();assert.equal((await f.write(op,{...f.visitor,nomeCompleto:'Another',telefone:'11 99999 1234',email:''})).status,409);
  f.db.prepare('DELETE FROM visitantes WHERE id=?').run(a.visitorId);
  assert.equal((await f.write(op,{...f.visitor,nomeCompleto:'Another',telefone:'11 99999 1234',email:''})).status,409,'conflict receipt is stable');
  f.db.prepare("INSERT INTO visitantes(comunidade_id,nome_completo,telefone,email,data_entrada,criado_por,escopo_confirmado) VALUES(2,?,?,?,'2026-09-27','writer@example.test',1)").run(f.visitor.nomeCompleto,f.visitor.telefone,f.visitor.email);
  assert.equal((await f.write()).status,200);
});
test('mobile write: transaction failure rolls back visitor, receipt and audit then retry succeeds',async t=>{
  const f=await fixture(t),op=randomUUID();
  f.db.exec("CREATE TRIGGER fail_mobile_audit BEFORE INSERT ON auditoria_piloto WHEN NEW.evento='VISITANTE_MOBILE_CRIADO' BEGIN SELECT RAISE(ABORT,'test failure'); END");
  await assert.rejects(f.write(op),/test failure/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM mobile_visitor_receipts').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM visitantes WHERE email=?').get(f.visitor.email).n,0);
  f.db.exec('DROP TRIGGER fail_mobile_audit');assert.equal((await f.write(op)).status,200);
});
test('mobile write: strict input, actual dates, quota, UUID and origin',async t=>{
  const f=await fixture(t);
  for(const data of [{...f.visitor,nomeCompleto:''},{...f.visitor,dataEntrada:'2026-02-30'},{...f.visitor,admin:true},{...f.visitor,email:'bad'},{...f.visitor,nomeCompleto:'a'.repeat(121)}])assert.equal((await f.write(randomUUID(),data)).status,422);
  assert.equal((await f.write('invalid')).status,400);
  assert.equal((await f.write(randomUUID(),{...f.visitor,nomeCompleto:'a'.repeat(5000)})).status,400);
  assert.equal((await f.write(randomUUID(),f.visitor,{origin:'https://evil.test'})).status,403);
  assert.equal((await f.write(randomUUID(),f.visitor,{'sec-fetch-site':'cross-site'})).status,403);
  f.limit();assert.equal((await f.write()).status,429);
});
test('mobile write: credentials bind to current session, user, community and device; revoke on permission loss',async t=>{
  const f=await fixture(t);
  assert.equal(f.grant.expiresAt-f.grant.issuedAt,8*3600000);
  assert.doesNotMatch(JSON.stringify(f.db.prepare('SELECT * FROM mobile_write_grants').get()),new RegExp(f.grant.token));
  assert.equal((await f.write(randomUUID(),f.visitor,{authorization:'Bearer '+'f'.repeat(64)})).status,401);
  f.access.context.comunidadeId=2;assert.equal((await f.write()).status,401);f.access.context.comunidadeId=1;
  f.access.context.temporaryAccess={id:1};assert.equal((await f.write()).status,403);delete f.access.context.temporaryAccess;
  f.setAccess({error:Response.json({error:'revoked'},{status:403})});assert.equal((await f.write()).status,403);f.setAccess(f.access);
  f.db.prepare('UPDATE mobile_write_grants SET expires_at=0').run();assert.equal((await f.write()).status,401);
  f.setSession('different');assert.equal((await f.write()).status,401);
});

test('mobile write: built worker checks real membership at preparation and every retry',async t=>{
  const f=await fixture(t),tasks=[];t.after(async()=>Promise.allSettled(tasks));
  f.db.prepare("UPDATE usuario_comunidades SET papel='PASTOR' WHERE usuario_id=?").run(f.id);
  const worker=(await import('../dist/server/index.js')).default;
  const env={DB:f.d1,AUTH_SECRET:'write-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}},ctx={waitUntil(p){tasks.push(p);},passThroughOnException(){}};
  const login=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'writer@example.test',senha:'Teste123!'})})),env,ctx);
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0];
  const call=(path,body,token='',auth=cookie)=>worker.fetch(new Request('http://localhost/api/mobile/'+path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','x-vinkulo-client':'android-write-1','x-vinkulo-challenge':'b'.repeat(64),cookie:auth,authorization:'Bearer '+token},body:JSON.stringify(body)}),env,ctx);
  const prep=await call('write-bootstrap',{deviceId:f.deviceId});assert.equal(prep.status,200,await prep.clone().text());const grant=await prep.json();
  const body={deviceId:f.deviceId,operationId:randomUUID(),visitor:f.visitor};
  assert.equal((await call('visitors',body,grant.token,'')).status,401);
  assert.equal((await call('visitors',body,grant.token)).status,200);
  f.db.prepare("UPDATE usuario_comunidades SET papel='MEMBRO' WHERE usuario_id=?").run(f.id);
  assert.equal((await call('visitors',body,grant.token)).status,403);
  assert.equal((await call('write-bootstrap',{deviceId:f.deviceId})).status,403);
});
