import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createPilotD1, createPilotUser } from './helpers/sqlite-d1.mjs';
import { cpfLoginRequest } from './helpers/cpf-login.mjs';

const permissions = ['dashboard.view','feed.view','events.view','schedules.view'];
const request = (headers = {}) => new Request('https://vinkulo.test/api/mobile/snapshot', {headers:{
  origin:'https://vinkulo.test','x-vinkulo-client':'android-read-2','x-vinkulo-challenge':'a'.repeat(64),...headers,
}});
async function fixture(t) {
  const {database:db,d1}=await createPilotD1(); t.after(()=>db.close());
  const id=await createPilotUser(db,{nome:'Mobile Read Test',email:'mobile-read@example.test',senha:'Teste123!'});
  const other=await createPilotUser(db,{nome:'Other',email:'mobile-other@example.test',senha:'Teste123!'});
  db.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?, 'read-session', datetime('now','+1 day'))").run(id);
  const access={user:{id,ativo:true},context:{comunidadeId:1,comunidadeNome:'Teste',permissions:[...permissions],communityAccess:'MEMBER'}};
  let current=access, hash='read-session';
  const exports={};
  const deps={
    '../../../../db':{getD1:()=>d1},
    '../../../lib/local-auth':{getCurrentSessionTokenHash:async()=>hash},
    '../../../lib/tenant':{requireTenantPermission:async p=>{assert.equal(p,'dashboard.view');return current;}},
  };
  const source=await readFile(new URL('../app/api/mobile/snapshot/route.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{assert.ok(name in deps,name);return deps[name];},Response,URL,Date,TextEncoder});
  const post=(title,community=1,audience='PUBLICO',ministries='[]',status='PUBLICADA',channel=1,body='Conteúdo') => Number(db.prepare(
    `INSERT INTO publicacoes_piloto(comunidade_id,titulo,resumo,conteudo,categoria,visibilidade,status,origem,audiencia_tipo,ministerios_json,canal_feed,criado_por)
     VALUES(?,?,'',?,'COMUNIDADE','COMUNIDADE',?,'COMUNIDADE',?,?,?,?)`).run(community,title,body,status,audience,ministries,channel,id).lastInsertRowid);
  const event=(title,community=1,status='PUBLICADO',days=1)=>Number(db.prepare(
    "INSERT INTO eventos_comunidade(comunidade_id,titulo,inicia_em,termina_em,status) VALUES (?,?,datetime('now',?),datetime('now',?,'+2 hours'),?)")
    .run(community,title,`+${days} days`,`+${days} days`,status).lastInsertRowid);
  const appointment=(title,user=id,community=1)=>Number(db.prepare(
    "INSERT INTO agenda_compromissos(comunidade_id,usuario_id,titulo,inicia_em) VALUES(?,?,?,datetime('now','+1 day'))").run(community,user,title).lastInsertRowid);
  const ministry=Number(db.prepare("INSERT INTO ministerios_comunidade(comunidade_id,nome,status) VALUES(1,'Equipe teste','ATIVO')").run().lastInsertRowid);
  const volunteer=Number(db.prepare("INSERT INTO ministerio_voluntarios(comunidade_id,ministerio_id,usuario_id,ativo,funcao) VALUES(1,?,?,1,'Recepção')").run(ministry,id).lastInsertRowid);
  const schedule=(title,status='PUBLICADA',user=id,community=1)=>{
    const scale=Number(db.prepare("INSERT INTO escalas_ministerio(comunidade_id,ministerio_id,titulo,inicia_em,termina_em,status) VALUES(?,?,?,datetime('now','+1 day'),datetime('now','+1 day','+2 hours'),?)").run(community,ministry,title,status).lastInsertRowid);
    db.prepare("INSERT INTO escala_designacoes(comunidade_id,escala_id,voluntario_id,usuario_id,funcao) VALUES(?,?,?,?,'Recepção')").run(community,scale,volunteer,user);return scale;
  };
  const read=async()=>{const response=await exports.GET(request());assert.equal(response.status,200,await response.clone().text());return response.json();};
  return {db,d1,id,other,access,route:exports,post,event,appointment,schedule,ministry,volunteer,read,setAccess:v=>{current=v;},setHash:v=>{hash=v;}};
}

test('mobile read: published text only; community, audience and personal boundaries',async t=>{
  const f=await fixture(t);
  f.post('Visible');f.post('Other tenant',2);f.post('Draft',1,'PUBLICO','[]','RASCUNHO');f.post('Sidebar',1,'PUBLICO','[]','PUBLICADA',0);
  f.post('Own ministry',1,'MINISTERIOS',JSON.stringify([f.ministry]));f.post('Private ministry',1,'MINISTERIOS','[]');
  f.event('Event');f.event('Draft event',1,'RASCUNHO');f.event('Other event',2);f.event('Distant',1,'PUBLICADO',90);f.event('Cancelled',1,'CANCELADO');
  f.appointment('Mine');f.appointment('Private other',f.other);f.appointment('Other diary tenant',f.id,2);
  f.schedule('My assignment');f.schedule('Other assignment','PUBLICADA',f.other);f.schedule('Unpublished','RASCUNHO');f.schedule('Wrong tenant','PUBLICADA',f.id,2);
  const body=await f.read(),s=body.snapshot;
  assert.equal(body.protocol,2);assert.equal(body.accountId,f.id);assert.equal(body.communityId,1);
  assert.equal(body.expiresAt-body.issuedAt,8*3600000);assert.deepEqual(body.capabilities,['shell.open','snapshot.read']);
  const titles=name=>s[name].items.map(x=>x.titulo);
  for(const title of ['Visible','Own ministry']) assert.ok(titles('mural').includes(title));
  for(const title of ['Other tenant','Draft','Sidebar','Private ministry']) assert.ok(!titles('mural').includes(title),title);
  assert.deepEqual(titles('eventos'),['Event']);assert.deepEqual(titles('compromissos'),['Mine']);assert.deepEqual(titles('escalas'),['My assignment']);
  const raw=JSON.stringify(body);assert.doesNotMatch(raw,/share_token|inscritos|email|imagem_url|senha|token_hash|foto_perfil/);
  assert.equal((await f.route.GET(request())).headers.get('cache-control'),'no-store, private');
});
test('mobile read: replacements remove cancellations, deleted posts, assignments and revoked sections',async t=>{
  const f=await fixture(t);const p=f.post('Removed'),e=f.event('Cancelled'),s=f.schedule('Removed assignment');
  let body=await f.read();assert.ok(body.snapshot.mural.items.some(x=>x.id===p));
  f.db.prepare('DELETE FROM publicacoes_piloto WHERE id=?').run(p);
  f.db.prepare("UPDATE eventos_comunidade SET status='CANCELADO' WHERE id=?").run(e);
  f.db.prepare('UPDATE escala_designacoes SET ativo=0 WHERE escala_id=?').run(s);
  body=await f.read();assert.ok(!body.snapshot.mural.items.some(x=>x.id===p));assert.equal(body.snapshot.eventos.items.length,0);assert.equal(body.snapshot.escalas.items.length,0);
  f.access.context.permissions=['dashboard.view'];body=await f.read();
  for(const name of ['mural','eventos','escalas']) assert.deepEqual(body.snapshot[name],{allowed:false,hasMore:false,items:[]});
});
test('mobile read: origin, protocol, temporary access and session expiry fail closed',async t=>{
  const f=await fixture(t);
  for(const h of [{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'}]) assert.equal((await f.route.GET(request(h))).status,403);
  for(const h of [{'x-vinkulo-client':'android-foundation-1'},{'x-vinkulo-challenge':'bad'}]) assert.equal((await f.route.GET(request(h))).status,400);
  for(const patch of [{temporaryAccess:{}},{communityAccess:'FEED_ONLY'}]){
    f.setAccess({...f.access,context:{...f.access.context,...patch}});assert.equal((await f.route.GET(request())).status,403);
  }
  f.setAccess({...f.access,user:{id:f.id,ativo:false}});assert.equal((await f.route.GET(request())).status,403);
  f.setAccess({error:Response.json({},{status:401})});assert.equal((await f.route.GET(request())).status,401);
  f.setAccess(f.access);f.setHash(null);assert.equal((await f.route.GET(request())).status,401);f.setHash('read-session');
  f.db.prepare("UPDATE sessoes SET expira_em=datetime('now','+1 hour') WHERE token_hash='read-session'").run();
  const short=await f.read();assert.ok(short.expiresAt-short.issuedAt<=3600000);
  f.db.prepare("UPDATE sessoes SET expira_em=datetime('now','-1 hour') WHERE token_hash='read-session'").run();
  assert.equal((await f.route.GET(request())).status,401);
});
test('mobile read: deterministic limits advertise omitted results and bound long texts',async t=>{
  const f=await fixture(t);
  for(let i=0;i<105;i++){f.post('Post '+i,1,'PUBLICO','[]','PUBLICADA',1,'x'.repeat(7000));f.event('Event '+i);f.appointment('Diary '+i);f.schedule('Scale '+i);}
  const body=await f.read();
  for(const name of ['mural','eventos','compromissos','escalas']) {assert.equal(body.snapshot[name].items.length,name==='mural'?50:100);assert.equal(body.snapshot[name].hasMore,true);}
  assert.equal(body.snapshot.mural.items[0].texto.length,6000);assert.ok(new TextEncoder().encode(JSON.stringify(body)).length<1024*1024);
});
test('mobile read: oversized UTF-8 snapshot is rejected, never partially installed',async t=>{
  const f=await fixture(t);
  for(let i=0;i<51;i++) f.post('Unicode '+i,1,'PUBLICO','[]','PUBLICADA',1,'😀'.repeat(6000));
  assert.equal((await f.route.GET(request())).status,413);
});
test('mobile read: real authentication and revoked membership are enforced in built worker',async t=>{
  const f=await fixture(t),tasks=[];t.after(async()=>{await Promise.allSettled(tasks);});
  const worker=(await import('../dist/server/index.js')).default;
  const env={DB:f.d1,AUTH_SECRET:'offline-test-only',ASSETS:{fetch:async()=>new Response('',{status:404})}};
  const ctx={waitUntil(p){tasks.push(p);},passThroughOnException(){}};
  const login=await worker.fetch(await cpfLoginRequest(env,new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'mobile-read@example.test',senha:'Teste123!'})})),env,ctx);
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').match(/__Host-adote_session=[^;]+/)[0];
  const call=auth=>worker.fetch(new Request('http://localhost/api/mobile/snapshot',{headers:{...Object.fromEntries(request().headers),origin:'http://localhost',cookie:auth}}),env,ctx);
  assert.equal((await call('')).status,401);assert.equal((await call(cookie)).status,200);
  f.db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=?").run(f.id);
  assert.equal((await call(cookie)).status,403);
});
