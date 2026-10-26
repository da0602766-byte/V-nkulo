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
  const slots=[],effects=[],requests=[],timers=new Map(),intervals=new Map(),listeners=new Map();
  let cursor=0,timerId=0,props=initialProps,closed=false,lateUpdates=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
  const memo=(factory,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:factory(),deps};return slots[i].value;};
  const hooks={Fragment:jsx.Fragment,Suspense:'suspense',lazy:()=> 'lazy',useId:()=> 'test-dialog',
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{if(closed)lateUpdates++;slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}};
  const clock={setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},setInterval(fn){intervals.set(++timerId,fn);return timerId;},clearInterval(id){intervals.delete(id);}};
  const events={addEventListener(name,fn){let set=listeners.get(name);if(!set)listeners.set(name,set=new Set());set.add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);}};
  const document={activeElement:null,body:{style:{}},visibilityState:'visible'};
  const location={search:'',href:'https://vinkulo.test/painel/visitantes',origin:'https://vinkulo.test'};
  const api=(url)=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}));
  const views={I:{},Icon:'icon',Dialog:'dialog',Header:'header',Pessoas:'people',fmt:String,btnSec:'secondary',btnPri:'primary'};
  const data={api,answer:String,age:()=>0,person:p=>p,category:c=>c};
  const exports={};
  runInNewContext(compile('components/'+file+'.tsx'),{exports,URL,URLSearchParams,AbortController,Date,Error,...clock,document,location,window:{...clock,...events,location},
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),
    require(name){
      if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;if(name==='react-dom')return {createPortal:node=>node};
      if(name==='next/navigation')return {usePathname:()=>'/login'};
      if(name==='./data')return data;if(name==='./Views'||name==='./Dialog')return views;
      if(name==='./PersonForms')return {PersonForm:'person-form',PersonDetails:'person-details',ContactForm:'contact-form'};
      if(name==='./WorkspaceControls')return {useVisitorPreference:()=>[false,()=>{}]};
      if(name.endsWith('/visitor-care'))return {visitorIntegrationGaps:()=>[]};
      return {default:name};
    }});
  return {requests,document,location,listeners,get lateUpdates(){return lateUpdates;},render(next=props){props=next;cursor=0;return exports[exportName](props);},
    flush(){for(const fn of effects.splice(0))fn();},timers(){const batch=[...timers.values()];timers.clear();for(const fn of batch)fn();},
    tick(){for(const fn of intervals.values())fn();},event(name,event={}){for(const fn of listeners.get(name)||[])fn(event);},close(){closed=true;slots.forEach(slot=>slot?.cleanup?.());},
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

const personalProps={userId:1,communityId:1,userName:'Pessoa',communityName:'Teste',canOpenShared:false};
const personalState=(revision=1)=>({provider:'GOOGLE_DRIVE',revision,userId:1,communityId:1,googleAvailable:true,googleConnected:true});
const personalDoc=(revision=1)=>({userId:1,communityId:1,revision,people:[{id:'1',nome:'Versão '+revision}],contacts:[],events:[]});
async function readyPersonal(){
  const h=harness('visitors/PersonalVisitorApp',personalProps);h.render();h.flush();h.timers();
  await h.reply(h.requests[0],personalState());await h.reply(h.requests[1],{...personalState(),document:personalDoc()});
  h.render();h.flush();return h;
}
const personalRevision=h=>nodes(h.render()).find(n=>n.type==='people')?.props.pessoas[0]?.nome;
test('personal Drive sync fetches a newer version on focus and avoids unchanged downloads',async()=>{
  const h=await readyPersonal();h.event('focus');await h.reply(h.requests.at(-1),personalState(2));
  assert.match(h.requests.at(-1).url,/dados=1/);
  await h.reply(h.requests.at(-1),{...personalState(2),document:personalDoc(2)});
  assert.equal(personalRevision(h),'Versão 2');h.flush();
  const count=h.requests.length;h.event('focus');await h.reply(h.requests.at(-1),personalState(2));
  assert.equal(h.requests.length,count+1);h.close();
});
test('personal Drive sync preserves an open draft until closed',async()=>{
  const h=await readyPersonal();nodes(h.render()).find(n=>n.type==='people').props.onNew();h.render();h.flush();
  h.event('focus');await h.reply(h.requests.at(-1),personalState(2));
  assert.equal(personalRevision(h),'Versão 1');assert.match(text(h.render()),/outro aparelho/);
  nodes(h.render()).find(n=>n.type==='person-form').props.onClose();h.render();h.flush();
  h.event('focus');await h.reply(h.requests.at(-1),personalState(2));await h.reply(h.requests.at(-1),{...personalState(2),document:personalDoc(2)});
  assert.equal(personalRevision(h),'Versão 2');h.close();
});
test('personal Drive sync ignores late failures from a previous account and coalesces slow checks',async()=>{
  const h=await readyPersonal();const before=h.requests.length;
  h.event('focus');const old=h.requests.at(-1);h.event('focus');h.tick();assert.equal(h.requests.length,before+1);
  h.render({...personalProps,userId:2});h.flush();
  const updates=h.lateUpdates;h.close();old.reject(Object.assign(new Error('Conta anterior'),{status:403}));await settle();
  assert.equal(h.lateUpdates,updates);
});
test('personal Drive sync retains the loaded list on a temporary read failure and recovers',async()=>{
  const h=await readyPersonal();h.event('focus');await h.reply(h.requests.at(-1),personalState(2));
  h.requests.at(-1).reject(Object.assign(new Error('Drive indisponível'),{status:503}));await settle();
  assert.equal(personalRevision(h),'Versão 1');assert.match(text(h.render()),/Drive indisponível/);h.flush();
  h.event('focus');await h.reply(h.requests.at(-1),personalState(2));await h.reply(h.requests.at(-1),{...personalState(3),document:personalDoc(3)});
  assert.equal(personalRevision(h),'Versão 3');assert.doesNotMatch(text(h.render()),/Drive indisponível/);h.close();
});
test('personal Drive sync clears private data when access is revoked',async()=>{
  const h=await readyPersonal();h.event('focus');h.requests.at(-1).reject(Object.assign(new Error('Acesso removido'),{status:403}));await settle();
  assert.equal(personalRevision(h),undefined);assert.match(text(h.render()),/Acesso removido/);h.close();
});

test('an open visitor editor closes when refreshed permissions become read-only and stays closed on regrant',async()=>{
  const permissions=['visitors.view','visitors.create','visitors.edit','followups.manage'];
  const h=harness('visitors/VisitorApp',{communityName:'Teste',userName:'Pessoa',permissions,isOwner:false});
  h.location.search='?novo=1';h.render();h.flush();
  const snapshot={permissions,visitantes:[],categorias:[],celulas:[],responsaveis:[],ministerios:[],campos:[]};
  await h.reply(h.requests.find(r=>r.url.endsWith('/pagina')),snapshot);
  assert.ok(nodes(h.render()).some(n=>n.type==='person-form'));h.flush();
  h.tick();await h.reply(h.requests.filter(r=>r.url.endsWith('/pagina')).at(-1),{...snapshot,permissions:['visitors.view']});
  assert.equal(nodes(h.render()).some(n=>n.type==='person-form'),false);h.flush();
  h.tick();await h.reply(h.requests.filter(r=>r.url.endsWith('/pagina')).at(-1),snapshot);
  assert.equal(nodes(h.render()).some(n=>n.type==='person-form'),false);h.flush();h.close();
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
