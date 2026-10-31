import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

async function load(path, dependencies, globals={}) {
  const exports={};
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,URL,URLSearchParams,Request,Response,Headers,AbortSignal,AbortController,Uint8Array,Date,Event,crypto:webcrypto,
      require:key=>{assert.ok(key in dependencies,'Unexpected import '+key);return dependencies[key];},...globals});
  return exports;
}

async function callback({feature,native=true,error='',email='owner@test.com',session=true,requested=7,completed=false}={}) {
  const calls=[];
  const state={purpose:'drive',userId:7,nonce:'nonce',returnTo:'/painel/visitantes?lista=pessoal',
    ...(feature?{[feature]:true}:{}),...(native?{channel:'android',pairingHash:'hash'}:{})};
  const module=await load('app/api/auth/google/callback/route.ts',{
    '../../../../../db':{getD1:()=>({prepare:()=>({bind:()=>({first:async()=>({email:'owner@test.com',ativo:1}),run:async()=>calls.push('preference')})})})},
    '../../../../lib/local-auth':{getSessionUser:async()=>session?{id:7,email:'owner@test.com'}:null,normalizeEmail:s=>s.toLowerCase(),createSession:async()=>{throw Error('must preserve app session');},attachSessionCookie:()=>{throw Error('no browser login');}},
    '../../../../lib/access-security':{auditAccess:async()=>{}},
    '../../../../lib/supabase-auth-link':{AuthLinkError:Error,linkAuthAfterVerifiedGoogleLogin:async()=>{throw Error('Drive is not login');}},
    '../../../../lib/google-integration':{readGoogleState:async()=>state,exchangeGoogleCode:async()=>({id_token:'token'}),verifyGoogleIdentity:async()=>({sub:'google-id',email}),saveGoogleConnection:async()=>calls.push('saved')},
    '../../../../lib/google-native-handoff':{readGoogleNativeHandoff:async()=>({purpose:'drive',requested_user_id:requested,expires_at:new Date(Date.now()+60000).toISOString(),completed_at:completed?'done':null}),finishGoogleNativeHandoff:async()=>calls.push('completed'),failGoogleNativeHandoff:async()=>calls.push('failed')},
  });
  const response=await module.GET(new Request('https://app.test/api/auth/google/callback?state=state&'+(error?'error='+error:'code=code'),{headers:native?{}:{cookie:'__Host-vinkulo_google_state=nonce'}}));
  return {calls,response,target:new URL(response.headers.get('location'))};
}

for(const feature of [undefined,'visitorStorage','personalVisitors','visitorSheets']) {
  test(`Android ${feature||'conta'} completes without browser cookies or second login`,async()=>{
    const {calls,target}=await callback({feature,session:false});
    assert.equal(target.pathname,'/login/google-concluido');assert.ok(!target.searchParams.has('erro'));
    assert.ok(calls.includes('saved'));assert.ok(calls.includes('completed'));
    assert.equal(calls.includes('preference'),!feature);
  });
  test(`web ${feature||'conta'} retains authenticated browser return`,async()=>{
    const {target,calls}=await callback({feature,native:false});
    assert.equal(target.pathname,'/painel/visitantes');assert.equal(target.searchParams.get('google'),'connected');
    assert.ok(!calls.includes('completed'));
  });
}
test('cancel, wrong Google account and changed requesting account never complete',async()=>{
  for(const options of [{error:'access_denied'},{email:'other@test.com'},{requested:9}]){
    const {calls,target}=await callback(options);assert.deepEqual(calls,['failed']);assert.equal(target.pathname,'/login/google-concluido');assert.ok(target.searchParams.has('erro'));
  }
});
test('completed callback cannot be replayed',async()=>{
  const {calls,target}=await callback({completed:true});assert.deepEqual(calls,[]);assert.ok(target.searchParams.has('erro'));
});
test('web callback still requires the original application session',async()=>{
  const {calls,target}=await callback({native:false,session:false});assert.deepEqual(calls,[]);assert.ok(target.searchParams.has('googleErro'));
});

test('visitor authorization binds native pairing to the authorized user and preserves web nonce',async()=>{
  const prepared=[],states=[];
  const module=await load('app/lib/google-authorization-response.ts',{
    './google-integration':{createGoogleAuthorization:async(origin,state)=>{states.push(state);return {url:'https://accounts.google.com/auth',nonce:'nonce'};}},
    './google-native-handoff':{validGooglePairingSecret:v=>/^[a-f0-9]{64}$/.test(v),googlePairingHash:async()=> 'hash',prepareGoogleNativeHandoff:async input=>prepared.push(input)},
  });
  const request=new Request('https://app.test/api/pilot/visitantes/pessoal');
  const state={purpose:'drive',userId:7,personalVisitors:true,returnTo:'/painel/visitantes?lista=pessoal'};
  assert.equal((await module.googleAuthorizationResponse(request,state,{channel:'android',pairing:'bad'})).status,400);
  assert.equal(prepared.length,0);
  const native=await module.googleAuthorizationResponse(request,state,{channel:'android',pairing:'a'.repeat(64)});
  assert.equal(native.headers.get('set-cookie'),null);assert.equal(states[0].channel,'android');assert.equal(states[0].personalVisitors,true);
  assert.equal(prepared[0].requestedUserId,7);assert.equal(prepared[0].returnTo,state.returnTo);
  const web=await module.googleAuthorizationResponse(request,state,{});assert.match(web.headers.get('set-cookie'),/__Host-vinkulo_google_state=nonce/);assert.equal(states[1].channel,undefined);
});

async function clientFixture(native=true) {
  const storage=new Map(),listeners=new Map(),navigations=[],opened=[],requests=[],errors=[];
  let respond=async()=>Response.json({url:'https://accounts.google.com/o/oauth2/v2/auth?state=signed'});
  const window={location:{origin:'https://app.test',pathname:'/painel/visitantes',search:'?lista=pessoal',assign:url=>navigations.push(url)},
    VinkuloAndroid:native?{openGoogleAuth:url=>opened.push(url)}:undefined,
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),dispatchEvent:event=>listeners.get(event.type)?.(),setInterval:()=>1,clearInterval:()=>{}};
  const document={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const safe=await load('app/lib/safe-return-path.ts',{});
  const client=await load('app/lib/google-authorization-client.ts',{'./androidNativeBridge':{},'./safe-return-path':safe},
    {window,document,sessionStorage,fetch:async(url,init)=>{requests.push({url,init});return respond(url,init);}});
  return {client,storage,listeners,navigations,opened,requests,errors,respond:fn=>respond=fn,watch:()=>client.watchGoogleAppReturn(message=>errors.push(message))};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
test('native start uses app session and bridge; secret is absent from external URL',async()=>{
  const f=await clientFixture();await f.client.authorizeGoogle('/api/auth/google/start?purpose=drive&returnTo=%2Fpainel');
  const start=new URL(f.requests[0].url);assert.equal(start.searchParams.get('format'),'json');assert.equal(start.searchParams.get('channel'),'android');
  const pairing=start.searchParams.get('pairing');assert.equal(pairing.length,64);assert.equal(f.opened.length,1);assert.ok(!f.opened[0].includes(pairing));assert.equal(f.navigations.length,0);
});
test('native visitor request retains its scoped API and authorization metadata',async()=>{
  const f=await clientFixture();await f.client.authorizeGoogle('/api/pilot/visitantes/pessoal?usuario=7&comunidade=2',{action:'authorize'});
  const body=JSON.parse(f.requests[0].init.body);assert.equal(body.action,'authorize');assert.equal(body.channel,'android');assert.equal(body.pairing.length,64);assert.match(f.requests[0].url,/usuario=7&comunidade=2/);
});
test('browser authorization remains ordinary navigation',async()=>{
  const f=await clientFixture(false);await f.client.authorizeGoogle('/api/auth/google/start?purpose=drive');assert.equal(f.requests.length,0);assert.equal(f.navigations.length,1);
  await f.client.authorizeGoogle('/api/pilot/visitantes/armazenamento',{action:'authorize'});assert.equal(JSON.parse(f.requests[0].init.body).channel,undefined);assert.equal(f.opened.length,0);
});
test('app resume consumes handoff and returns to original feature with confirmation',async()=>{
  const f=await clientFixture();await f.client.authorizeGoogle('/api/pilot/visitantes/pessoal',{action:'authorize'});
  f.respond(async()=>Response.json({status:'pending'},{status:202}));const stop=f.watch();await flush();assert.equal(f.storage.size,1);
  f.respond(async()=>Response.json({status:'complete',returnTo:'/painel/visitantes?lista=pessoal'}));f.listeners.get('vinkulo:google-return')();await flush();
  assert.equal(f.storage.size,0);assert.match(f.navigations[0],/lista=pessoal&google=connected/);assert.equal(f.errors.length,0);stop();assert.equal(f.listeners.size,0);
});
test('temporary failure retries; cancellation is reported in app and never opens browser login',async()=>{
  const f=await clientFixture();await f.client.authorizeGoogle('/api/pilot/visitantes/pessoal',{action:'authorize'});
  f.respond(async()=>Response.json({error:'temporary'},{status:503}));const stop=f.watch();await flush();assert.equal(f.storage.size,1);
  f.respond(async()=>Response.json({status:'failed',error:'Você não autorizou o acesso ao Google.'},{status:400}));f.listeners.get('focus')();await flush();
  assert.equal(f.storage.size,0);assert.equal(f.navigations.length,0);assert.equal(f.errors.length,1);stop();
});
test('expired native authorization is cleared and reported',async()=>{
  const f=await clientFixture();await f.client.authorizeGoogle('/api/auth/google/start?purpose=drive');
  for(const [key,value] of f.storage)f.storage.set(key,JSON.stringify({...JSON.parse(value),expiresAt:1}));
  const stop=f.watch();await flush();assert.equal(f.storage.size,0);assert.match(f.errors[0],/expirou/);stop();
});
test('handoff completion rejects a different app session without consuming authorization',async()=>{
  let consumed=0;let userId=8;
  const module=await load('app/api/auth/google/native/complete/route.ts',{
    '../../../../../lib/local-auth':{getSessionUser:async()=>({id:userId}),createSession:async()=>{throw Error('Drive cannot create login');}},
    '../../../../../lib/google-native-handoff':{validGooglePairingSecret:()=>true,googlePairingHash:async()=> 'hash',readGoogleNativeHandoff:async()=>({purpose:'drive',completed_at:'done',completed_user_id:7,expires_at:new Date(Date.now()+60000).toISOString(),return_to:'/painel'}),consumeGoogleNativeHandoff:async()=>consumed++},
  });
  const request=()=>new Request('https://app.test/api/auth/google/native/complete',{method:'POST',body:JSON.stringify({pairing:'secret'})});
  assert.equal((await module.POST(request())).status,401);assert.equal(consumed,0);userId=7;
  assert.equal((await module.POST(request())).status,200);assert.equal(consumed,1);
});
