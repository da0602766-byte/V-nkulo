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
 return {requests,get reloads(){return reloads},tick(ms){now+=ms;for(const fn of intervals.values())fn()},render(){cursor=0;return expand(exports[exportName](props))},flush(){for(const effect of effects.splice(0))effect();const batch=[...timers.values()];timers.clear();for(const fn of batch)fn()}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return[];return[node,...nodes(node.props?.children)]}
function text(node){if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'&&node?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node)}
const find=(tree,type,filter=()=>true)=>nodes(tree).find(n=>n.type===type&&filter(n));
const button=(tree,label)=>find(tree,'button',n=>text(n)===label||n.props['aria-label']===label);
const change=(node,value)=>node.props.onChange({target:{value}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function reply(request,data,status=200){request.resolve(Response.json(data,{status}));await settle()}


function expand(node){if(Array.isArray(node))return node.map(expand);if(!node||typeof node!=="object")return node;if(typeof node.type==="function")return expand(node.type(node.props));return {...node,props:{...node.props,children:expand(node.props?.children)}}}

const person=(id,nome='Pessoa de demonstração')=>({membership_id:id,usuario_id:id,nome,email:'pessoa@example.invalid',papel:'MEMBRO',oficial:0});
const lead=(name='Liderança de demonstração',canManage=true)=>({leaders:[{...person(9,name),papel:'LIDER',titulo:'Líder'}],history:[],canManage});
const members=(people,nextCursor=null,canManage=true)=>({people,nextCursor,canManage});
const charts={canViewCharts:true,canManageAccess:true,metrics:{members:3,visitors:1,posts30d:5,upcomingEvents:1,ministries:1,cells:1},series:[{month:'2026-01',label:'jan',posts:0,events:0},{month:'2026-02',label:'fev',posts:5,events:1}],cellReports:[],pastors:[]};
const request=(f,part)=>f.requests.findLast(r=>String(r.url).includes(part));
function leader(mode='leader'){const f=harness('LeadershipWorkspace.tsx',{mode,communityName:'Demonstração'});f.render();f.flush();return f}
test('Falha da equipe não inventa contagens nem histórico vazio e aceita nova tentativa',async()=>{
 const f=leader();await reply(request(f,'leadership'),{error:'Falha na equipe'},503);assert.match(text(f.render()),/Falha na equipe/);assert.doesNotMatch(text(f.render()),/Nenhuma alteração registrada|Lideranças ativas/);button(f.render(),'Tentar novamente').props.onClick();await reply(request(f,'leadership'),lead('Recuperada',false));assert.match(text(f.render()),/Recuperada/);assert.equal(f.requests.some(r=>String(r.url).includes('/pessoas')),false);
});
test('Falha dos indicadores não oculta equipe e histórico',async()=>{
 const f=leader('pastoral');await reply(request(f,'leadership'),lead('Equipe disponível',false));await reply(request(f,'pastoral-dashboard'),{error:'Indicadores indisponíveis'},503);assert.match(text(f.render()),/Equipe disponível/);assert.match(text(f.render()),/Indicadores indisponíveis/);button(f.render(),'Tentar novamente').props.onClick();await reply(request(f,'pastoral-dashboard'),charts);assert.match(text(f.render()),/Indicadores pastorais/);
});
test('Lote incompleto de membros bloqueia seleção e nova tentativa recupera a lista inteira',async()=>{
 const f=leader();await reply(request(f,'leadership'),lead());await reply(request(f,'/pessoas'),members([person(1,'Ana')],'next'));await reply(request(f,'cursor='),{error:'Falha no segundo lote'},503);assert.match(text(f.render()),/Falha no segundo lote/);assert.equal(find(f.render(),'select'),undefined);assert.match(text(f.render()),/Liderança de demonstração/);
 button(f.render(),'Tentar novamente').props.onClick();await reply(request(f,'/pessoas'),members([person(1,'Ana')],'next'));await reply(request(f,'cursor='),members([person(1,'Ana'),person(2,'Bia')]));assert.equal(nodes(f.render()).filter(n=>n.type==='option').length,3);
});
test('Cursor repetido falha explicitamente em vez de aceitar lista parcial',async()=>{
 const f=leader();await reply(request(f,'leadership'),lead());await reply(request(f,'/pessoas'),members([person(1)],'same'));await reply(request(f,'cursor='),members([person(2)],'same'));assert.match(text(f.render()),/completar a lista de membros/);assert.equal(find(f.render(),'select'),undefined);
});
test('Permissão da lista de membros continua necessária para adicionar liderança',async()=>{
 const f=leader();await reply(request(f,'leadership'),lead());await reply(request(f,'/pessoas'),members([person(1)],null,false));assert.equal(find(f.render(),'select'),undefined);assert.match(text(f.render()),/não está disponível para o seu perfil/);
});
test('Atualização ignora respostas antigas e preserva equipe após falha',async()=>{
 const f=leader();await reply(request(f,'leadership'),lead('Inicial',false));const update=button(f.render(),'Atualizar painel').props.onClick;update();const old=request(f,'leadership');update();assert.equal(old.options.signal.aborted,true);await reply(request(f,'leadership'),lead('Atual',false));await reply(old,lead('Antiga',false));assert.match(text(f.render()),/Atual/);assert.doesNotMatch(text(f.render()),/Antiga/);button(f.render(),'Atualizar painel').props.onClick();await reply(request(f,'leadership'),{error:'Sem conexão'},503);assert.match(text(f.render()),/Os dados anteriores continuam visíveis/);assert.match(text(f.render()),/Atual/);
});
test('Busca de membro tolera acentos e limpa seleção anterior',async()=>{
 const f=leader();await reply(request(f,'leadership'),lead());await reply(request(f,'/pessoas'),members([person(1,'Ágata'),person(2,'Bruno')]));change(find(f.render(),'select'),'2');change(find(f.render(),'input',n=>n.props.type==='search'),'agata');assert.equal(find(f.render(),'select').props.value,'');assert.match(text(f.render()),/Ágata/);assert.doesNotMatch(text(f.render()),/Bruno/);
});
test('Adicionar líder bloqueia envio duplicado e mantém confirmação após recarga',async()=>{
 const f=leader();await reply(request(f,'leadership'),lead());await reply(request(f,'/pessoas'),members([person(1)]));change(find(f.render(),'select'),'1');const add=button(f.render(),'Adicionar líder').props.onClick;add();add();assert.equal(f.requests.filter(r=>r.options?.method==='PATCH').length,1);await reply(request(f,'/pessoas'),{});await reply(request(f,'leadership'),lead());await reply(request(f,'/pessoas'),members([]));assert.match(text(f.render()),/Líder adicionado com registro/);
});
test('Gráficos respeitam acesso restrito e apresentam zeros e tabela com valores reais',async()=>{
 const f=leader('pastoral');await reply(request(f,'leadership'),lead('Líder',false));await reply(request(f,'pastoral-dashboard'),{canViewCharts:false,canManageAccess:false});assert.match(text(f.render()),/Acesso ainda não liberado/);assert.equal(find(f.render(),'table'),undefined);
 button(f.render(),'Atualizar painel').props.onClick();await reply(request(f,'leadership'),lead('Líder',false));await reply(request(f,'pastoral-dashboard'),charts);const zero=find(f.render(),'span',n=>n.props.style?.['--bar-posts']==='0%');assert.equal(zero.props.style['--bar-events'],'0%');assert.match(text(find(f.render(),'table')),/jan00fev51/);
});
test('Indicadores malformados viram erro recuperável sem derrubar a equipe',async()=>{
 const f=leader('pastoral');await reply(request(f,'leadership'),lead('Disponível',false));await reply(request(f,'pastoral-dashboard'),{canViewCharts:true});assert.match(text(f.render()),/indicadores chegaram incompletos/);assert.match(text(f.render()),/Disponível/);
});
const profile={id:1,nome:'Pessoa',email:'pessoa@example.invalid',papel:'MEMBRO',oficial:0,telefone:'',endereco:'',ministerio:'Acolhimento',celula_vinculada:'Célula'};
const profileData={me:profile,people:[],canManage:false,canViewPeople:false};
async function self(){const f=harness('PeopleWorkspace.tsx',{mode:'self',communityName:'Demonstração',selfLinks:[{label:'Agenda',href:'/painel?view=eventos'}]});f.render();f.flush();await reply(f.requests[0],profileData);return f}
const profileEvent=()=>({preventDefault(){},currentTarget:{telefone:'11999990000',dataNascimento:'1990-01-01',endereco:'Endereço fictício',ministerio:'Acolhimento'}});
test('Perfil distingue dados editáveis de vínculos e mostra somente atalhos recebidos',async()=>{
 const f=await self();assert.match(text(f.render()),/Meus dados de contato/);assert.match(text(f.render()),/Meus vínculos na comunidade/);assert.deepEqual(nodes(f.render()).filter(n=>n.type==='a').map(n=>n.props.href),['/painel?view=eventos']);assert.equal(find(f.render(),'input',n=>n.props.name==='ministerio').props.type,'hidden');
});
test('Falha ao salvar perfil mantém formulário e bloqueia chamadas duplicadas',async()=>{
 const f=await self();const submit=find(f.render(),'form').props.onSubmit;submit(profileEvent());submit(profileEvent());assert.equal(f.requests.filter(r=>r.options?.method==='PATCH').length,1);await reply(f.requests.at(-1),{error:'Falha ao salvar'},503);assert.ok(find(f.render(),'form'));assert.match(text(f.render()),/Falha ao salvar/);assert.match(text(f.render()),/mantidos para tentar novamente/);
});
test('Falha na consulta depois de salvar não desmonta o perfil nem apaga confirmação',async()=>{
 const f=await self();find(f.render(),'form').props.onSubmit(profileEvent());await reply(f.requests.at(-1),{updated:true});await reply(f.requests.at(-1),{error:'Falha na consulta'},503);assert.ok(find(f.render(),'form'));assert.match(text(f.render()),/Seu perfil foi atualizado/);assert.match(text(f.render()),/Seu preenchimento continua abaixo/);button(f.render(),'Tentar novamente').props.onClick();assert.ok(find(f.render(),'form'));await reply(f.requests.at(-1),profileData);assert.doesNotMatch(text(f.render()),/Falha na consulta/);
});
