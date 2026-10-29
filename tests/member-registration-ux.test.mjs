import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function harness(path, props={}, exportName="default") {
 const slots=[],effects=[],timers=new Map(),intervals=new Map(),requests=[];let cursor=0,timerId=0,now=Date.now(),reloads=0; class ClockDate extends Date { constructor(...args){super(...(args.length ? args : [now]))} static now(){return now} }
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},useRef(initial){const i=cursor++;return slots[i]??={current:initial}},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}}};
 const clock={setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},setInterval(fn){intervals.set(++timerId,fn);return timerId},clearInterval(id){intervals.delete(id)}};
 const exports={}; const directory={}; runInNewContext(ts.transpileModule(readFileSync(new URL("../app/lib/directory-search.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:directory});
 runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name==='../lib/directory-search'?directory:name==='react-dom'?{createPortal:node=>node}:{default:'stub',RelacionamentoTools:'relationships'},Date:ClockDate,Error,AbortController,URL,URLSearchParams,document:{body:{style:{overflow:""}},activeElement:null,getElementById(){return null}},FormData:class extends FormData {constructor(form){super();if(form)for(const [key,value] of Object.entries(form))if(typeof value!=="function")this.set(key,value)}},navigator:{clipboard:{writeText:async()=>{throw Error('Negado')}}},window:{...clock,addEventListener(){},removeEventListener(){},requestAnimationFrame:fn=>fn(),location:{reload(){reloads++},origin:'https://example.invalid',href:'https://example.invalid/painel',search:''}},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 return {requests,get reloads(){return reloads},tick(ms){now+=ms;for(const fn of intervals.values())fn()},render(){cursor=0;return exports[exportName](props)},flush(){for(const effect of effects.splice(0))effect();const batch=[...timers.values()];timers.clear();for(const fn of batch)fn()}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return[];return[node,...nodes(node.props?.children)]}
function text(node){if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'&&node?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node)}
const find=(tree,type,filter=()=>true)=>nodes(tree).find(n=>n.type===type&&filter(n));
const button=(tree,label)=>find(tree,'button',n=>text(n)===label||n.props['aria-label']===label);
const change=(node,value)=>node.props.onChange({target:{value}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function reply(request,data,status=200){request.resolve(Response.json(data,{status}));await settle()}

const link={id:1,path:'/cadastro-membro/ficticio',title:'Convite de demonstração',state:'ABERTO',opensAt:'2026-10-08T12:00:00Z',closesAt:'2026-10-09T12:00:00Z',originCommunityName:'Demonstração',totalSubmissions:1,autoDelete:false};
const submission={id:1,fullName:'Ágata Silva',communityName:'Demonstração',ministryName:'Recepção',submittedAt:'2026-10-08T12:00:00Z',birthDate:'1990-01-01',anointing:'MEMBRO',ministryData:{},photoUrl:'',email:'agata@example.invalid'};
const response={links:[link],submissions:[submission]};
function manager(){const f=harness('MemberRegistrationLinkManager.tsx');f.render();f.flush();return f}
function formEvent(extra={}){const tomorrow=Date.now()+86400_000;return{preventDefault(){},currentTarget:{title:'Demonstração',opensAt:new Date(tomorrow).toISOString(),closesAt:new Date(tomorrow+86400_000).toISOString(),maxUses:100,reset(){},...extra}}}
test('Convites diferencia falha inicial de vazio e recupera a lista',async()=>{
 const f=manager();assert.doesNotMatch(text(f.render()),/Nenhum cadastro recebido/);await reply(f.requests[0],{error:'Falha de conexão'},503);assert.doesNotMatch(text(f.render()),/Nenhum link criado|Nenhum cadastro recebido/);button(f.render(),'Tentar novamente').props.onClick();await reply(f.requests.at(-1),response);assert.match(text(f.render()),/Convite de demonstração/);
});
test('Convites preserva dados após falha de atualização e ignora resposta antiga',async()=>{
 const f=manager();await reply(f.requests[0],response);const refresh=button(f.render(),'Atualizar lista').props.onClick;refresh();const old=f.requests.at(-1);refresh();await reply(f.requests.at(-1),{links:[{...link,title:'Mais recente'}],submissions:[]});await reply(old,response);assert.match(text(f.render()),/Mais recente/);assert.doesNotMatch(text(f.render()),/Convite de demonstração/);
 button(f.render(),'Atualizar lista').props.onClick();await reply(f.requests.at(-1),{error:'Falha'},503);assert.match(text(f.render()),/dados anteriores continuam abaixo/);assert.match(text(f.render()),/Mais recente/);
});
test('Convites valida período antes de enviar e impede criação duplicada',async()=>{
 const f=manager();await reply(f.requests[0],response);let resets=0;const create=find(f.render(),'form',n=>n.props.className==='member-link-create').props.onSubmit;
 await create(formEvent({opensAt:'2026-10-10T10:00',closesAt:'2026-10-09T10:00'}));assert.equal(f.requests.length,1);assert.match(text(f.render()),/depois da abertura/);
 const event=formEvent({reset(){resets++}});create(event);create(event);assert.equal(f.requests.length,2);await reply(f.requests.at(-1),{error:'Não enviado'},503);assert.equal(resets,0);assert.match(text(f.render()),/Não enviado/);create(event);await reply(f.requests.at(-1),{path:link.path});await reply(f.requests.at(-1),response);assert.equal(resets,1);
});
test('Convites oferece cópia manual quando a área de transferência falha',async()=>{
 const f=manager();await reply(f.requests[0],response);await button(f.render(),'Copiar').props.onClick();await settle();const tree=f.render();assert.match(text(tree),/copie manualmente/);assert.equal(find(tree,'input',n=>n.props.readOnly).props.value,'https://example.invalid'+link.path);
});
test('Cadastros recebidos busca sem acentos e permite limpar resultado vazio',async()=>{
 const f=manager();await reply(f.requests[0],response);const search=()=>find(f.render(),'input',n=>n.props.type==='search');change(search(),'agata');assert.match(text(f.render()),/Ágata Silva/);change(search(),'inexistente');assert.doesNotMatch(text(f.render()),/Ágata Silva/);button(f.render(),'Limpar busca').props.onClick();assert.equal(search().props.value,'');
});
const registration=()=>({id:1,title:'Cadastro de demonstração',state:'ABERTO',serverNow:Date.now(),opensAt:new Date(Date.now()-10000).toISOString(),closesAt:new Date(Date.now()+3600000).toISOString(),communities:[{id:1,name:'Demonstração',anointings:[{id:'MEMBRO',name:'Membro'}],ministries:[{id:1,name:'Recepção',functions:[{id:2,name:'Acolhimento'}],extraFields:[{id:'experiencia',label:'Experiência',required:false}]}]}]});
function publicForm(data=registration()){const f=harness('MemberRegistrationForm.tsx',{token:'ficticio',registration:data});f.render();f.flush();return f}
function field(tree,label){return nodes(find(tree,'label',n=>text(n).startsWith(label))).find(n=>n.type==='input'||n.type==='select')}
function fillReview(f){for(const[label,value]of [['Nome completo','Pessoa de teste'],['E-mail','teste@example.invalid'],['CPF','52998224725'],['Crie sua senha','Ficticia123'],['CEP','58000000'],['Data de nascimento','1990-01-01'],['Função de interesse','2'],['Período preferido','NOITE'],['Experiência','Boas-vindas']])change(field(f.render(),label),value);field(f.render(),'Concordo').props.onChange({target:{checked:true}});find(f.render(),'form').props.onSubmit({preventDefault(){}});f.render();f.flush()}
test('Revisão inclui função, período e campos extras e preserva dados ao voltar',()=>{
 const f=publicForm();fillReview(f);const tree=f.render();assert.match(text(tree),/Acolhimento/);assert.match(text(tree),/Noite/);assert.match(text(tree),/Boas-vindas/);assert.doesNotMatch(text(tree),/Ficticia123/);button(tree,'← Editar informações').props.onClick();assert.equal(field(f.render(),'Nome completo').props.value,'Pessoa de teste');assert.equal(field(f.render(),'Crie sua senha').props.value,'Ficticia123');
});
test('Cadastro impede envio duplicado e conserva revisão após erro',async()=>{
 const f=publicForm();fillReview(f);const submit=button(f.render(),'Concluir meu cadastro').props.onClick;submit();submit();assert.equal(f.requests.length,1);assert.equal(button(f.render(),'← Editar informações').props.disabled,true);await reply(f.requests[0],{error:'Tente novamente'},503);assert.match(text(f.render()),/Tente novamente/);assert.match(text(f.render()),/Pessoa de teste/);button(f.render(),'Concluir meu cadastro').props.onClick();await reply(f.requests.at(-1),{});assert.match(text(f.render()),/Seu cadastro foi concluído/);
});
test('Prazo usa horário do servidor e expira sem apagar o preenchimento',()=>{
 const data=registration();data.serverNow-=7200000;data.closesAt=new Date(data.serverNow+2000).toISOString();const f=publicForm(data);change(field(f.render(),'Nome completo'),'Preservar preenchimento');f.tick(1000);assert.equal(f.reloads,0);assert.doesNotMatch(text(f.render()),/O prazo deste convite terminou/);f.tick(2000);assert.equal(f.reloads,0);assert.match(text(f.render()),/O prazo deste convite terminou/);assert.equal(field(f.render(),'Nome completo').props.value,'Preservar preenchimento');find(f.render(),'form').props.onSubmit({preventDefault(){}});assert.ok(find(f.render(),'form'));
});
test('Cadastro que expira na revisão bloqueia envio e permite voltar',()=>{
 const data=registration();data.closesAt=new Date(data.serverNow+1500).toISOString();const f=publicForm(data);fillReview(f);f.tick(2000);assert.equal(button(f.render(),'Concluir meu cadastro').props.disabled,true);button(f.render(),'Concluir meu cadastro').props.onClick();assert.equal(f.requests.length,0);button(f.render(),'← Editar informações').props.onClick();assert.equal(field(f.render(),'Nome completo').props.value,'Pessoa de teste');
});
test('Formulário aguardando abertura recarrega só uma vez quando o prazo chega',()=>{
 const data=registration();data.state='AGUARDANDO';data.opensAt=new Date(data.serverNow+1500).toISOString();const f=publicForm(data);f.tick(2000);f.tick(2000);assert.equal(f.reloads,1);
});
test('Termos e privacidade podem ser consultados sem sair do cadastro',()=>{
 const f=publicForm();for(const href of ['/termos','/privacidade'])assert.equal(find(f.render(),'a',n=>n.props.href===href).props.target,'_blank');
});
