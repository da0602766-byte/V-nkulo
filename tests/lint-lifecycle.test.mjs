import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const compile=file=>ts.transpileModule(readFileSync(new URL('../app/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node);

function harness(file,initialProps={},exportName='default'){
  const slots=[],effects=[],requests=[],timers=new Map(),listeners=new Map();
  let cursor=0,timerId=0,props=initialProps,closed=false,lateUpdates=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
  const memo=(factory,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:factory(),deps};return slots[i].value;};
  const hooks={Fragment:jsx.Fragment,Suspense:'suspense',lazy:()=> 'lazy',useId:()=> 'test-dialog',
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{if(closed)lateUpdates++;slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}};
  const clock={setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},setInterval(){return ++timerId;},clearInterval(){}};
  const events={addEventListener(name,fn){let set=listeners.get(name);if(!set)listeners.set(name,set=new Set());set.add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);}};
  const document={activeElement:null,body:{style:{}},visibilityState:'visible'};
  const location={search:'',href:'https://vinkulo.test/painel/visitantes',origin:'https://vinkulo.test'};
  const api=(url)=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}));
  const views={I:{},Icon:'icon',Dialog:'dialog',Header:'header',fmt:String,btnSec:'secondary',btnPri:'primary'};
  const data={api,answer:String,age:()=>0,person:p=>p,category:c=>c};
  const exports={};
  runInNewContext(compile('components/'+file+'.tsx'),{exports,URL,URLSearchParams,AbortController,Date,Error,...clock,document,location,window:{...clock,...events,location},
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),
    require(name){
      if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;if(name==='react-dom')return {createPortal:node=>node};
      if(name==='next/navigation')return {usePathname:()=>'/login'};
      if(name==='./data')return data;if(name==='./Views'||name==='./Dialog')return views;
      if(name==='./WorkspaceControls')return {useVisitorPreference:()=>[false,()=>{}]};
      if(name.endsWith('/visitor-care'))return {visitorIntegrationGaps:()=>[]};
      return {default:name};
    }});
  return {requests,document,location,listeners,get lateUpdates(){return lateUpdates;},render(next=props){props=next;cursor=0;return exports[exportName](props);},
    flush(){for(const fn of effects.splice(0))fn();},timers(){const batch=[...timers.values()];timers.clear();for(const fn of batch)fn();},
    event(name,event={}){for(const fn of listeners.get(name)||[])fn(event);},close(){closed=true;slots.forEach(slot=>slot?.cleanup?.());},
    async reply(request,value){request.resolve(value);await settle();}};
}

test('document navigation preserves local paths, query and fragment on the current origin',()=>{
  const exports={},visited=[],origin='https://vinkulo.test';
  runInNewContext(compile('lib/document-navigation.ts'),{exports,URL,window:{location:{origin,assign:url=>visited.push(url)}}});
  for(const route of ['/painel/visitantes?novo=1','/painel?view=inicio#publicacao-7','/proprietario?tab=editorial','/api/auth/google/start?purpose=drive&returnTo=%2Fpainel']){
    exports.navigateDocument(route);assert.equal(visited.at(-1),origin+route);
  }
  for(const route of ['javascript:alert(1)','https://other.test/painel','//other.test','https://user:pass@vinkulo.test/painel'])assert.throws(()=>exports.navigateDocument(route),/inválido/);
  assert.equal(visited.length,4);
});

test('dialog cleanup closes its original node and restores the original focus',()=>{
  const h=harness('ActionDialog',{title:'Confirmar',children:'Teste',onClose(){}}),calls=[];
  h.document.activeElement={focus:()=>calls.push('focus')};
  const tree=h.render();tree.props.ref.current={showModal:()=>calls.push('open'),close:()=>calls.push('close-original')};h.flush();
  tree.props.ref.current={close:()=>calls.push('close-replacement')};h.close();
  assert.deepEqual(calls,['open','close-original','focus']);
});

test('feedback help returns focus to the trigger captured when the dialog opened',()=>{
  const h=harness('GlobalFeedbackLauncher'),calls=[];
  h.render();h.flush();h.document.activeElement={isConnected:true,focus:()=>calls.push('original')};h.event('vinkulo:open-help');
  const tree=h.render();const dialog=nodes(tree).find(n=>n.props.role==='dialog');
  dialog.props.ref.current={focus(){},addEventListener(){},removeEventListener(){}};h.flush();
  h.document.activeElement={isConnected:true,focus:()=>calls.push('replacement')};h.event('vinkulo:open-help');h.close();
  assert.deepEqual(calls,['original']);
});

const person=id=>({id:String(id),nome:'Pessoa '+id,raw:{},status:'NOVO'});
const details=id=>({person:person(id),fields:[],profile:{},canViewHistory:true,onClose(){},onEdit(){},onAction(){},onContact(){}});
const history=result=>({acompanhamentos:[{id:1,tipo:'EMAIL',resultado:result,criado_em:'2026-10-26 10:00:00'}],nextCursor:null});
test('contact history ignores the previous person response after the selected person changes',async()=>{
  const h=harness('visitors/PersonForms',details(1),'PersonDetails');h.render();h.flush();const old=h.requests[0];
  h.render(details(2));h.flush();await h.reply(h.requests[1],history('Atual'));await h.reply(old,history('Obsoleto'));
  assert.match(text(h.render()),/Atual/);assert.doesNotMatch(text(h.render()),/Obsoleto/);h.close();
});
test('contact history invalidates the latest manual refresh when unmounted',async()=>{
  const h=harness('visitors/PersonForms',details(1),'PersonDetails');h.render();h.flush();h.close();
  await h.reply(h.requests[0],history('Tarde'));assert.equal(h.lateUpdates,0);
});

test('shared list directory invalidates initial and manual requests on unmount',async()=>{
  const h=harness('visitors/VisitorListDirectory');h.render();h.flush();h.timers();
  nodes(h.render()).find(n=>n.type==='button').props.onClick();assert.equal(h.requests.length,2);h.close();
  for(const request of h.requests)await h.reply(request,{lists:[]});assert.equal(h.lateUpdates,0);assert.equal(h.listeners.get('focus').size,0);
});

test('personal list ignores the previous account response and invalidates work on unmount',async()=>{
  const props={userId:1,communityId:1,userName:'Pessoa',communityName:'Teste',canOpenShared:false};
  const h=harness('visitors/PersonalVisitorApp',props);h.render();h.flush();h.timers();const old=h.requests[0];
  h.render({...props,userId:2});h.flush();h.timers();h.close();
  await h.reply(old,{provider:null,userId:1});await h.reply(h.requests[1],{provider:null,userId:2});assert.equal(h.lateUpdates,0);
});

test('directory-only access aborts storage lookup, invalidates contacts and updates URL handling',async()=>{
  const props={communityName:'Teste',userName:'Pessoa',permissions:[],isOwner:false};
  const h=harness('visitors/VisitorApp',props);h.render();h.flush();
  const storage=h.requests.find(r=>r.url.endsWith('/armazenamento')),contacts=h.requests.find(r=>r.url.endsWith('/pagina'));
  h.render({...props,directoryOnly:true});h.flush();assert.equal(storage.options.signal.aborted,true);
  h.location.search='?section=pessoas';h.event('popstate');assert.ok(nodes(h.render({...props,directoryOnly:true})).some(n=>n.type==='./VisitorListDirectory'));
  h.close();await h.reply(contacts,{visitantes:[],categorias:[],celulas:[],responsaveis:[],ministerios:[],campos:[]});assert.equal(h.lateUpdates,0);
});
