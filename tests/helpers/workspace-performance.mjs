import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

export const settle=()=>new Promise(resolve=>setImmediate(resolve));
export const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
export const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node);
export function harness(file,props,revision){
  const read=path=>revision?execFileSync('git',['show',`${revision}:${path}`],{encoding:'utf8',maxBuffer:4e6}):readFileSync(new URL('../../'+path,import.meta.url),'utf8');
  const slots=[],effects=[],requests=[],timers=new Map(),listeners=new Map();let cursor=0,id=0,closed=false,lateUpdates=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};
  const hooks={Fragment:jsx.Fragment,Suspense:'suspense',lazy:()=> 'lazy',useId:()=> 'test',
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{if(closed)lateUpdates++;slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}};
  const clock={setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(i){timers.delete(i);},setInterval(){return ++id;},clearInterval(){},requestAnimationFrame(){return ++id;},cancelAnimationFrame(){}};
  const events={addEventListener(n,fn){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(fn);},removeEventListener(n,fn){listeners.get(n)?.delete(fn);}};
  const location={origin:'https://test.invalid',search:'',href:'https://test.invalid/painel'};
  const history={state:null,pushState(a,b,u){location.href=String(u);location.search=new URL(u).search;},replaceState(a,b,u){this.pushState(a,b,u);}};
  const document={visibilityState:'visible',documentElement:{dataset:{}},querySelector:()=>null,body:{style:{}},...events};
  const fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url:String(url),options,resolve,reject}));
  const api=(url)=>new Promise((resolve,reject)=>requests.push({url,api:true,resolve,reject}));
  const context={URL,URLSearchParams,AbortController,Date,Error,console,...clock,document,location,history,fetch,
    FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.values||{});}get(key){return this.form.values?.[key];}getAll(key){return this.form.values?.[key]||[];}},
    window:{...clock,...events,location,history,matchMedia:()=>({matches:false,...events})}};
  const exports={};
  const compile=path=>ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const localModules=new Map();
  const require=name=>{
    if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;if(name==='next/dynamic')return {default:()=> 'dynamic'};
    if(name==='react-dom')return {createPortal:node=>node};
    if(name.endsWith('/chat-sounds'))return {CHAT_SOUND_EVENT:'chat-sounds',chatSoundsEnabled:()=>true};
    if(name.endsWith('/device-notification-sync'))return {showUnreadDeviceNotifications:async()=>{}};
    if(name.endsWith('/web-push-client'))return {isWebPushSupported:()=>false};
    if(name.endsWith('/androidNativeBridge'))return {isNativeNotificationBridgeAvailable:()=>false};
    if(name==='./useBrowserStorage')return {useBrowserStorage:()=>[[],()=>{}]};
    if(name.endsWith('/ministry-refresh')){
      if(!localModules.has(name)){const value={};runInNewContext(compile('app/lib/ministry-refresh.ts'),{exports:value});localModules.set(name,value);}return localModules.get(name);
    }
    if(name.endsWith('/directory-search'))return {matchesDirectorySearch:()=>true};
    if(name==='./data')return {api,person:p=>p,category:c=>c};
    if(name==='./Views')return {I:{},Icon:'icon',Header:'header',Pessoas:'people'};
    if(name==='./WorkspaceControls')return {useVisitorPreference:()=>[false,()=>{}]};
    if(name==='./PersonForms')return {PersonForm:'person-form',PersonDetails:'person-details',ContactForm:'contact-form'};
    return {default:name};
  };
  runInNewContext(compile('app/components/'+file+'.tsx'),{...context,exports,require});
  return {requests,location,get lateUpdates(){return lateUpdates;},render(){cursor=0;return exports.default(props);},flush(){effects.splice(0).forEach(fn=>fn());},timers(){const batch=[...timers.values()];timers.clear();batch.forEach(fn=>fn());},event(n){listeners.get(n)?.forEach(fn=>fn());},close(){closed=true;slots.forEach(slot=>slot?.cleanup?.());},
    async reply(request,body,status=200){request.resolve(request.api?body:Response.json(body,{status}));await settle();}};
}

export const visitorSnapshot={permissions:['visitors.view'],visitantes:[],categorias:[],celulas:[],responsaveis:[],ministerios:[],campos:[]};
export const ministrySnapshot={ministerios:[],availableUsers:[],canCreate:true,escalas:[],checklist:[],bibliotecaItens:[]};
export async function runScenarios(revision){
  const visitors=harness('visitors/VisitorApp',{communityName:'Teste',userName:'Pessoa',permissions:['visitors.view'],isOwner:false},revision);
  visitors.render();visitors.flush();
  for(const r of visitors.requests)await visitors.reply(r,r.api?visitorSnapshot:{state:'LEGACY'});
  const initial=visitors.requests.length;
  for(const label of ['Relacionamento','Aniversários','Categorias','Pessoas']){
    const button=nodes(visitors.render()).find(n=>n.type==='button'&&text(n).startsWith(label));
    if(!button)throw Error('Missing visitor tab '+label);button.props.onClick();visitors.render();visitors.flush();
    for(const r of visitors.requests.slice(initial).filter(r=>!r.done)){r.done=true;await visitors.reply(r,r.api?visitorSnapshot:{state:'LEGACY'});}
  }
  const visitorTabReads=visitors.requests.length-initial;visitors.close();
  const ministry=harness('SecretaryMinisterialWorkspace',{communityName:'Teste',preferenceKey:'1:1',permissions:[]},revision);
  ministry.render();ministry.flush();const ministryEntryReads=ministry.requests.length;
  for(const r of ministry.requests)await ministry.reply(r,ministrySnapshot);
  nodes(ministry.render()).find(n=>n.type==='button'&&text(n).includes('+ Novo ministério')).props.onClick();
  const ministryDialogReads=ministry.requests.length-ministryEntryReads;
  for(const r of ministry.requests.slice(ministryEntryReads))await ministry.reply(r,ministrySnapshot);ministry.close();
  const people=harness('PeopleWorkspace',{communityName:'Teste',mode:'self'},revision);
  people.render();people.flush();people.timers();
  await people.reply(people.requests[0],{me:{id:1,nome:'Teste'},people:[],canViewPeople:false,canManage:false});
  const tree=people.render();const save=tree.props.onSubmit({preventDefault(){},currentTarget:{values:{telefone:'11987654321'}}});
  await people.reply(people.requests[1],{updated:true,profile:{id:1,telefone:'5511987654321',data_nascimento:null,endereco:null,ministerio:null}});
  const profileReads=people.requests.length-2;
  for(const r of people.requests.slice(2))await people.reply(r,{me:{id:1,telefone:'5511987654321'},people:[]});await save;people.close();
  return {visitorTabReads,ministryEntryReads,ministryDialogReads,profileReads};
}
