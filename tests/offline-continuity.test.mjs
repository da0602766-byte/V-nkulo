import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const compile=path=>ts.transpileModule(readFileSync(new URL('../app/components/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const requests=[],timers=new Map(),intervals=new Map(),windowEvents=new EventTarget(),documentEvents=new EventTarget();let timerId=0,subscriptions=[];
 const window={addEventListener:windowEvents.addEventListener.bind(windowEvents),removeEventListener:windowEvents.removeEventListener.bind(windowEvents),setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},setInterval(fn){intervals.set(++timerId,fn);return timerId},clearInterval(id){intervals.delete(id)}};
 const document={visibilityState:'visible',addEventListener:documentEvents.addEventListener.bind(documentEvents),removeEventListener:documentEvents.removeEventListener.bind(documentEvents)};
 const navigator={onLine:true},exports={};let snapshot;
 const hooks={useSyncExternalStore(subscribe,read,server){snapshot=read;subscriptions.push(subscribe(()=>{}));assert.equal(server().enabled,null);return read();}};
 runInNewContext(compile('useAndroidOfflineEnabled.ts'),{exports,require:()=>hooks,window,document,navigator,AbortController,Error,fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))});
 return {requests,document,navigator,intervals,connect(){return exports.useAndroidOfflinePolicy()},state:()=>snapshot(),event(name){windowEvents.dispatchEvent(new Event(name))},visibility(hidden){document.visibilityState=hidden?'hidden':'visible';documentEvents.dispatchEvent(new Event('visibilitychange'))},timeout(){for(const fn of [...timers.values()])fn();timers.clear()},close(){for(const fn of subscriptions)fn();subscriptions=[]}};
}
async function reply(request,enabled,status=200){request.resolve(Response.json({offlineEnabled:enabled},{status}));await settle()}

test('política offline compartilha uma consulta entre consumidores e mantém snapshot de servidor neutro',async()=>{
 const f=fixture();const first=f.connect();f.connect();assert.equal(first.enabled,null);assert.equal(f.requests.length,1);assert.equal(f.intervals.size,1);
 await reply(f.requests[0],true);assert.equal(f.state().enabled,true);assert.equal(f.state().status,'confirmed');f.close();assert.equal(f.intervals.size,0);
});
test('resposta antiga não reativa offline após desativação mais recente',async()=>{
 const f=fixture();f.connect();const old=f.requests[0];f.event('vinkulo:offline-policy-changed');assert.equal(old.options.signal.aborted,true);
 await reply(f.requests[1],false);await reply(old,true);assert.equal(f.state().enabled,false);f.close();
});
test('timeout não inventa liberação, rejeita retorno atrasado e permite nova tentativa',async()=>{
 const f=fixture();const policy=f.connect();f.timeout();assert.equal(f.state().enabled,null);assert.equal(f.state().status,'unavailable');assert.equal(f.requests[0].options.signal.aborted,true);
 await reply(f.requests[0],true);assert.equal(f.state().enabled,null);policy.refresh();await reply(f.requests[1],true);assert.equal(f.state().status,'confirmed');f.close();
});
test('perda de conexão conserva última decisão, cancela resposta pendente e reconecta sem enviar registros',async()=>{
 const f=fixture();f.connect();await reply(f.requests[0],true);f.event('pageshow');const old=f.requests[1];f.navigator.onLine=false;f.event('offline');assert.equal(old.options.signal.aborted,true);assert.equal(f.state().enabled,true);assert.equal(f.state().status,'unavailable');
 await reply(old,false);assert.equal(f.state().enabled,true);f.navigator.onLine=true;f.event('online');await reply(f.requests[2],false);assert.equal(f.state().enabled,false);assert.ok(f.requests.every(r=>r.url==='/api/mobile/policy'&&!r.options.method));f.close();
});
test('aba oculta ignora respostas e revalida ao retornar; desmontagem cancela observadores',async()=>{
 const f=fixture();f.connect();f.visibility(true);await reply(f.requests[0],true);assert.equal(f.state().enabled,null);f.event('online');assert.equal(f.requests.length,1);
 f.visibility(false);await reply(f.requests[1],true);assert.equal(f.state().enabled,true);f.close();f.event('online');f.visibility(false);assert.equal(f.requests.length,2);
 f.connect();assert.equal(f.state().enabled,null);assert.equal(f.requests.length,3);f.close();await reply(f.requests[2],true);assert.equal(f.state().enabled,null);
});
test('falha HTTP e resposta inválida não substituem a última política confirmada',async()=>{
 const f=fixture();const policy=f.connect();await reply(f.requests[0],false);policy.refresh();await reply(f.requests[1],true,503);assert.equal(f.state().enabled,false);assert.equal(f.state().status,'unavailable');
 policy.refresh();await reply(f.requests[2],'true');assert.equal(f.state().enabled,false);assert.equal(f.state().status,'unavailable');f.close();
});

function entry(policy,bridge){
 const slots=[],effects=[];let cursor=0;const exports={};
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=value]},useEffect(fn){effects.push(fn)}};
 const version={needsAndroidPolicyUpdate:value=>value!=='1.23.0'};
 runInNewContext(compile('OfflineModeEntry.tsx'),{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name.endsWith('/android-version')?version:{useAndroidOfflinePolicy:()=>policy},window:{VinkuloAndroid:bridge,setInterval(){return 1},clearInterval(){},addEventListener(){},removeEventListener(){}}});
 const render=()=>{cursor=0;return exports.default()};render();effects.splice(0).forEach(fn=>fn());return render();
}
function nodes(n){return Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[]}
function text(n){return Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'?n:''}
test('entrada distingue disponibilidade desconhecida, APK antigo e autorização local sem inventar contagem',()=>{
 const bridge={version:'1.23.0',offlineModeVersion:1};let refreshed=false;
 const unknown=entry({enabled:null,status:'unavailable',refresh(){refreshed=true}},bridge);
 assert.equal(nodes(unknown).filter(n=>n.type==='a').length,0);assert.match(text(unknown),/Não foi possível confirmar/);nodes(unknown).find(n=>n.type==='button').props.onClick();assert.ok(refreshed);
 assert.equal(entry({enabled:false,status:'confirmed'},bridge),null);
 const old=entry({enabled:true,status:'confirmed'},{version:'1.22.0',offlineModeVersion:1});assert.match(text(old),/Atualizar para usar offline/);assert.doesNotMatch(text(old),/Central de pendências/);
 const ready=entry({enabled:true,status:'unavailable'},bridge);assert.ok(nodes(ready).some(n=>n.props?.href==='/mobile-app/index.html?mode=manual'));assert.match(text(ready),/não recebe a contagem/);assert.match(text(ready),/não garante acesso válido/);assert.match(text(ready),/Relatórios de células permanecem como rascunhos locais/);
});
