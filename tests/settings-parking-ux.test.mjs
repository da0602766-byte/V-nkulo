import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(path, require, globals={}){
 const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,...globals});return exports;
}
const search=load('app/lib/directory-search.ts');
function harness(path, props={}){
 const slots=[],effects=[],timers=new Map(),requests=[];let cursor=0,timerId=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},useRef(initial){const i=cursor++;return slots[i]??={current:initial}},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}}};
 const clock={setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)}};
 const component=load(path,name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name==='./useAndroidOfflineEnabled'?{useAndroidOfflinePolicy:()=>({enabled:false})}:name.includes('directory-search')?search:name==='./ParkingUi'?{ParkingEmpty:'empty',ParkingMovementCard:'movement'}:name.endsWith('.css')?{}:{default:'stub'}, {Date,Error,AbortController,URLSearchParams,...clock,window:{...clock,location:{reload(){}}},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))}).default;
 return {requests,render(){cursor=0;return component(props)},flush(){for(const effect of effects.splice(0))effect();const batch=[...timers.values()];timers.clear();for(const fn of batch)fn()}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return[];return[node,...nodes(node.props?.children)]}
function text(node){if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'&&node?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node)}
const find=(tree,type,filter=()=>true)=>nodes(tree).find(n=>n.type===type&&filter(n));
const button=(tree,label)=>find(tree,'button',n=>text(n)===label||n.props['aria-label']===label);
const change=(node,value)=>node.props.onChange({target:{value}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function reply(request,data,status=200){request.resolve(Response.json(data,{status}));await settle()}
const movement=id=>({id});
const settingsProps={managementItems:[],onOpenManagementView(){},canManageRequests:true,canConfigureParking:true,canManageCommunity:true,accessSlot:jsx.jsx('input',{name:'draft'})};
function settings(){const f=harness('app/components/CommunityAdminWorkspace.tsx',settingsProps);f.render();f.flush();return f}

test('Histórico oculta dados anteriores imediatamente e descarta resposta cancelada',async()=>{
 const f=harness('app/components/parking/ParkingMovementHistory.tsx');f.render();f.flush();await reply(f.requests[0],{movimentacoes:[movement(1)],total:80});
 change(find(f.render(),'input'),'lento');let tree=f.render();assert.equal(find(tree,'movement'),undefined);assert.equal(button(tree,'Próxima'),undefined);assert.match(text(tree),/Atualizando histórico/);
 f.flush();const slow=f.requests.at(-1);change(find(f.render(),'input'),'atual');f.render();f.flush();assert.equal(slow.options.signal.aborted,true);
 await reply(f.requests.at(-1),{movimentacoes:[movement(2)],total:1});await reply(slow,{movimentacoes:[movement(3)],total:1});
 assert.equal(find(f.render(),'movement').props.movement.id,2);
});
test('Histórico distingue erro de vazio e permite tentar novamente',async()=>{
 const f=harness('app/components/parking/ParkingMovementHistory.tsx');f.render();f.flush();await reply(f.requests[0],{error:'Sem conexão'},503);
 assert.match(text(f.render()),/Sem conexão/);assert.equal(find(f.render(),'empty'),undefined);
 button(f.render(),'Tentar novamente').props.onClick();f.render();f.flush();await reply(f.requests.at(-1),{movimentacoes:[],total:0});
 assert.equal(find(f.render(),'empty').props.title,'Nenhuma movimentação registrada');
});
test('Histórico corrige página que deixou de existir',async()=>{
 const f=harness('app/components/parking/ParkingMovementHistory.tsx');f.render();f.flush();await reply(f.requests[0],{movimentacoes:[movement(1)],total:41});
 button(f.render(),'Próxima').props.onClick();f.render();f.flush();assert.match(f.requests.at(-1).url,/page=2/);
 await reply(f.requests.at(-1),{movimentacoes:[],total:1});f.render();f.flush();assert.match(f.requests.at(-1).url,/page=1/);
});
test('Configurações carrega solicitações mesmo se o módulo falhar',async()=>{
 const f=settings();button(f.render(),'Módulos').props.onClick();assert.equal(find(f.render(),'input',n=>n.props.type==='checkbox'),undefined);assert.match(text(f.render()),/Carregando configuração/);
 await reply(f.requests.find(r=>r.url.includes('solicitacoes')),{solicitacoes:[{id:1,nome:'João',email:'joao@example.invalid',status:'PENDENTE',solicitado_em:'2026-10-08'}]});
 await reply(f.requests.find(r=>r.url.includes('configuracao')),{error:'Módulo indisponível'},503);
 assert.match(text(f.render()),/Módulo indisponível/);assert.equal(find(f.render(),'input',n=>n.props.type==='checkbox'),undefined);
 button(f.render(),'Solicitações de entrada1').props.onClick();assert.match(text(f.render()),/João/);assert.equal(button(f.render(),'Aprovar entrada de João').props.disabled,false);
});
test('Solicitações não apresenta vazio antes da resposta e permite filtrar por nome e situação',async()=>{
 const f=settings();button(f.render(),'Solicitações de entrada').props.onClick();assert.doesNotMatch(text(f.render()),/Nenhuma solicitação/);
 await reply(f.requests[0],{solicitacoes:[{id:1,nome:'João',email:'j@example.invalid',status:'PENDENTE',solicitado_em:'2026-10-08'},{id:2,nome:'Maria',email:'m@example.invalid',status:'APROVADA',solicitado_em:'2026-10-08'}]});
 change(find(f.render(),'input',n=>n.props.type==='search'),'joao');assert.match(text(f.render()),/João/);assert.doesNotMatch(text(f.render()),/Maria/);
 change(find(f.render(),'select',n=>n.props.name==='situacao'),'APROVADA');assert.match(text(f.render()),/Nenhuma solicitação para estes filtros/);
 button(f.render(),'Limpar filtros').props.onClick();assert.match(text(f.render()),/Maria/);
});
test('Aprovação em andamento bloqueia envio duplicado',async()=>{
 const f=settings();await reply(f.requests[0],{solicitacoes:[{id:1,nome:'João',email:'j@example.invalid',status:'PENDENTE',solicitado_em:'2026-10-08'}]});button(f.render(),'Solicitações de entrada1').props.onClick();
 const action=button(f.render(),'Aprovar entrada de João').props.onClick;action();action();assert.equal(f.requests.filter(r=>r.options?.method==='PATCH').length,1);
 assert.equal(button(f.render(),'Recusar entrada de João').props.disabled,true);
});
test('Aparência e Acessos permanecem montados ao alternar as seções',()=>{
 const f=settings();button(f.render(),'Aparência').props.onClick();assert.equal(find(f.render(),'stub',n=>n.props.active===true)?.props.active,true);
 button(f.render(),'Acessos').props.onClick();assert.equal(find(f.render(),'stub',n=>n.props.active===false)?.props.active,false);
 button(f.render(),'Privacidade').props.onClick();assert.ok(find(f.render(),'input',n=>n.props.name==='draft'));
 assert.equal(nodes(f.render()).filter(n=>n.props?.className==='community-settings-section'&&n.props.hidden).length,2);
});
