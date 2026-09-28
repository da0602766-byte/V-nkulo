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
  let current=access, hash='read-session',requestsDenied=false;
  const exports={};
  const themeExports={};
  const themeSource=await readFile(new URL('../app/lib/community-theme.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(themeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:themeExports});
  const deps={
    '../../../lib/community-theme':themeExports,
    '../../../../db':{getD1:()=>d1},
    '../../../lib/local-auth':{getCurrentSessionTokenHash:async()=>hash},
    '../../../lib/tenant':{requireTenantPermission:async (p,resource)=>{assert.equal(p,'dashboard.view');assert.ok(resource===undefined||resource==='requests');return resource==='requests'&&requestsDenied?{error:Response.json({},{status:403})}:current;}},
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
  return {db,d1,id,other,access,route:exports,post,event,appointment,schedule,ministry,volunteer,read,setAccess:v=>{current=v;},setHash:v=>{hash=v;},denyRequests:()=>{requestsDenied=true;}};
}

const requestsRead = f => f.route.GET(request({'x-vinkulo-client':'android-read-3','x-vinkulo-requests':'own'}));

test('mobile theme: opt-in colors match the platform, tenant-scoped and without media',async t=>{
  const f=await fixture(t);
  f.db.prepare("INSERT OR REPLACE INTO configuracoes(chave,valor,atualizado_por) VALUES('community_theme:1',?,'test')").run(JSON.stringify({paletteId:'ACOLHEDOR',logoUrl:'https://private.test/logo.png'}));
  f.db.prepare("INSERT OR REPLACE INTO configuracoes(chave,valor,atualizado_por) VALUES('community_theme:2',?,'test')").run(JSON.stringify({paletteId:'NOITE_OCEANO'}));
  assert.equal((await f.read()).theme,undefined);
  assert.equal((await (await f.route.GET(request({'x-vinkulo-client':'android-read-3'}))).json()).theme,undefined);
  const readTheme=async()=> (await (await f.route.GET(request({'x-vinkulo-client':'android-read-3','x-vinkulo-theme':'palette-1'}))).json()).theme;
  let theme=await readTheme();assert.equal(theme.paletteId,'ACOLHEDOR');assert.equal(theme.light.primary,'#9b4938');
  assert.equal(theme.version,1);assert.doesNotMatch(JSON.stringify(theme),/url|private|logo|shadow/i);
  for(const mode of ['light','dark']) {assert.equal(Object.keys(theme[mode]).length,9);for(const value of Object.values(theme[mode]))assert.match(value,/^#[0-9a-f]{6}$/i);}
  f.access.context.comunidadeId=2;theme=await readTheme();assert.equal(theme.paletteId,'NOITE_OCEANO');
  f.db.prepare("UPDATE configuracoes SET valor='invalid' WHERE chave='community_theme:2'").run();
  assert.equal((await readTheme()).paletteId,'MODERNO');
  f.setAccess({error:Response.json({},{status:401})});assert.equal(await readTheme(),undefined);
});
function addOwnRequest(f,{user=f.id,community=1,status='ABERTA',title='Pedido pessoal',date='2026-09-27 12:00:00'}={}) {
  return Number(f.db.prepare("INSERT INTO solicitacoes_comunidade(comunidade_id,solicitante_id,tipo,titulo,descricao,visibilidade,status,atualizado_em) VALUES(?,?,'ORACAO',?,'Texto sensível pessoal','PRIVADA',?,?)").run(community,user,title,status,date).lastInsertRowid);
}
test('mobile requests: explicit protocol and consent, own records only even for managers/recipients',async t=>{
  const f=await fixture(t);const mine=addOwnRequest(f),other=addOwnRequest(f,{user:f.other,title:'Segredo de terceiro'});addOwnRequest(f,{community:2,title:'Outra comunidade'});
  f.db.prepare('INSERT INTO solicitacao_destinatarios(solicitacao_id,comunidade_id,usuario_id) VALUES(?,1,?)').run(other,f.id);
  f.access.context.permissions.push('requests.manage','pastoral.panel.view');
  assert.ok(!('pedidos' in (await f.read()).snapshot));
  const noConsent=await (await f.route.GET(request({'x-vinkulo-client':'android-read-3'}))).json();
  assert.deepEqual(noConsent.snapshot.pedidos,{allowed:false,hasMore:false,items:[]});
  const body=await (await requestsRead(f)).json();assert.equal(body.protocol,3);
  assert.deepEqual(body.snapshot.pedidos.items.map(x=>x.id),[mine]);
  assert.deepEqual(Object.keys(body.snapshot.pedidos.items[0]).sort(),['atualizado','data','id','status','texto','tipo','titulo']);
  assert.doesNotMatch(JSON.stringify(body),/Segredo de terceiro|Outra comunidade|destinatarios|preferencia_contato|responsavel|solicitante_id/);
  assert.equal(f.db.prepare('SELECT visualizado_em FROM solicitacao_destinatarios WHERE solicitacao_id=?').get(other).visualizado_em,null,'offline reading has no acknowledgement side effect');
});
test('mobile requests: permission/plan removal empties the replacement without removing other eligible sections',async t=>{
  const f=await fixture(t);addOwnRequest(f);f.post('Aviso autorizado');
  assert.equal((await (await requestsRead(f)).json()).snapshot.pedidos.items.length,1);
  f.denyRequests();const body=await (await requestsRead(f)).json();
  assert.deepEqual(body.snapshot.pedidos,{allowed:false,hasMore:false,items:[]});
  assert.ok(body.snapshot.mural.items.some(x=>x.titulo==='Aviso autorizado'));
});
test('mobile requests: independent snapshots observe changes/deletion, retention and 50-row cap',async t=>{
  const f=await fixture(t),id=addOwnRequest(f);
  const phoneA=await (await requestsRead(f)).json();
  f.db.prepare("UPDATE solicitacoes_comunidade SET status='EM_ANALISE' WHERE id=?").run(id);
  const phoneB=await (await requestsRead(f)).json();
  assert.equal(phoneA.snapshot.pedidos.items[0].status,'ABERTA');assert.equal(phoneB.snapshot.pedidos.items[0].status,'EM_ANALISE');
  f.db.prepare('DELETE FROM solicitacoes_comunidade WHERE id=?').run(id);
  addOwnRequest(f,{status:'CONCLUIDA',date:'2000-01-01 00:00:00',title:'Fora da retenção'});
  assert.equal((await (await requestsRead(f)).json()).snapshot.pedidos.items.length,0);
  for(let i=0;i<55;i++)addOwnRequest(f,{title:'Pedido '+i});
  const section=(await (await requestsRead(f)).json()).snapshot.pedidos;
  assert.equal(section.items.length,50);assert.equal(section.hasMore,true);
  assert.equal(f.db.prepare('SELECT count(*) n FROM solicitacoes_comunidade').get().n,56,'read does not delete server records');
});

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
  // SQLite's CURRENT_TIMESTAMP is UTC without a suffix. Send an unambiguous
  // ISO value so Android does not interpret it as the phone's local timezone.
  for(const item of s.mural.items) assert.match(item.data,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
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
  const ownCall=auth=>worker.fetch(new Request('http://localhost/api/mobile/snapshot',{headers:{...Object.fromEntries(request({'x-vinkulo-client':'android-read-3','x-vinkulo-requests':'own'}).headers),origin:'http://localhost',cookie:auth}}),env,ctx);
  const mine=addOwnRequest(f);addOwnRequest(f,{user:f.other});
  assert.equal((await ownCall('')).status,401);
  assert.deepEqual((await (await ownCall(cookie)).json()).snapshot.pedidos.items.map(x=>x.id),[mine]);
  const plan={id:'gratuito',nome:'Contrato teste',descricao:'',valor_centavos:0,periodicidade:'MENSAL',duracao_dias:null,ativo:true,contratavel:true,destaque:false,personalizado:false,modulos:['events','ministries','visitors','cells','parking','people'],recursos:['feed','reports'],limites:{usuarios:null,administradores:null,cadastros:null,celulas:null,ministerios:null},condicoes:'',versao:1};
  f.db.prepare("INSERT INTO assinaturas_comunidade(comunidade_id,plano_id,status,contrato,fundamento,aprovado_por) VALUES(1,'gratuito','ATIVA',?,'GRATUITO',?)").run(JSON.stringify(plan),f.id);
  assert.deepEqual((await (await ownCall(cookie)).json()).snapshot.pedidos,{allowed:false,hasMore:false,items:[]});
  f.db.prepare("UPDATE usuario_comunidades SET status='INATIVO' WHERE usuario_id=?").run(f.id);
  assert.equal((await call(cookie)).status,403);
  assert.equal((await ownCall(cookie)).status,403);
});
