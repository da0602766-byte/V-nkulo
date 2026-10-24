import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as visitorCare from '../app/lib/visitor-care.ts';

function harness(path, props={}, exportName="default", search="") {
 const slots=[],effects=[],timers=new Map(),requests=[];let cursor=0,timerId=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},useRef(initial){const i=cursor++;return slots[i]??={current:initial}},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}}};
 const clock={setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},setInterval(){return ++timerId},clearInterval(){}};
 const exports={};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name==='react-dom'?{createPortal:node=>node}:name.endsWith('/visitor-care')?visitorCare:{default:'stub',RelacionamentoTools:'relationships'},Date,Error,AbortController,URL,URLSearchParams,clearTimeout:clock.clearTimeout,HTMLElement:class{},document:{body:{style:{overflow:""}},activeElement:null,getElementById(){return null}},FormData:class{constructor(form){this.form=form}get(key){return this.form[key]??null}},window:{...clock,addEventListener(){},removeEventListener(){},requestAnimationFrame:fn=>fn(),location:{origin:'https://example.invalid',href:'https://example.invalid/painel',search}},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 return {requests,render(){cursor=0;return exports[exportName](props)},flush(){for(const effect of effects.splice(0))effect();const batch=[...timers.values()];timers.clear();for(const fn of batch)fn()}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return[];return[node,...nodes(node.props?.children)]}
function text(node){if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'&&node?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node)}
const find=(tree,type,filter=()=>true)=>nodes(tree).find(n=>n.type===type&&filter(n));
const button=(tree,label)=>find(tree,'button',n=>text(n)===label||n.props['aria-label']===label);
const change=(node,value)=>node.props.onChange({target:{value}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function reply(request,data,status=200){request.resolve(Response.json(data,{status}));await settle()}

const person=(id,nome)=>({membership_id:id,usuario_id:id,nome,email:'teste@example.invalid',papel:'MEMBRO',oficial:0,permissoes:'',status:'ATIVO'});
const peopleResponse=(people,nextCursor=null)=>({me:null,people,nextCursor,counts:{membros:40,oficiais:2,oficiaisSemTitulo:0},canViewPeople:true,canManage:false});
const people=()=>{const f=harness('PeopleWorkspace.tsx',{communityName:'Demonstração'});f.render();f.flush();return f};
const searchInput=tree=>find(tree,'input',n=>n.props.type==='search');

test('modelo de atuação só preenche permissões autorizadas e preserva título e papel', async () => {
 const f=people();await reply(f.requests[0],{...peopleResponse([{...person(1,'Pessoa'),canEditHierarchy:true,oficial:1,titulo_oficial:'DIACONISA'}]),canManage:true,permissionCatalog:['visitors.view','events.view']});
 button(f.render(),'Editar função').props.onClick();
 const editor=()=>find(f.render(),'section',n=>n.props['aria-label']==='Editar função de Pessoa');
 assert.match(editor().props.className,/people-role-editor/);
 const model=nodes(editor()).find(n=>n.type==='button'&&text(n).startsWith('Cuidado de pessoas'));
 model.props.onClick({currentTarget:{closest(){return null}}});
 button(editor(),'Aplicar modelo').props.onClick();
 assert.equal(find(editor(),'select',n=>n.props.name==='titulo').props.value,'DIACONISA');
 assert.equal(find(editor(),'select',n=>n.props.name==='papel').props.defaultValue,'MEMBRO');
 assert.deepEqual(nodes(editor()).filter(n=>n.type==='input'&&n.props.name==='permissions'&&n.props.checked).map(n=>n.props.value),['visitors.view']);
 assert.match(text(editor()),/Revise as permissões e salve/);
 assert.equal(f.requests.length,1,'escolher e aplicar não salva antes da confirmação do formulário');
});
test('Pessoas obedece à autorização individual mesmo quando o perfil pode gerenciar outros registros',async()=>{
 const f=people();await reply(f.requests[0],{...peopleResponse([{...person(1,'Protegida'),canEditHierarchy:false,canRemove:false}]),canManage:true,canRemoveCommunity:true});
 assert.equal(button(f.render(),'Editar função'),undefined);
 assert.equal(button(f.render(),'Remover pessoa'),undefined);
 assert.ok(button(f.render(),'Ver ficha de Protegida'));
});

test('Pessoas mantém a busca montada e ignora respostas de consultas anteriores',async()=>{
 const f=people();await reply(f.requests[0],peopleResponse([person(1,'Anterior')]));
 change(searchInput(f.render()),'lento');assert.ok(searchInput(f.render()));assert.equal(find(f.render(),'article',n=>n.props.className?.includes('people-card')),undefined);f.render();f.flush();const slow=f.requests.at(-1);
 change(searchInput(f.render()),'atual');f.render();f.flush();assert.equal(slow.options.signal.aborted,true);await reply(f.requests.at(-1),peopleResponse([person(2,'Correto')]));await reply(slow,peopleResponse([person(3,'Atrasado')]));
 const tree=f.render();assert.ok(button(tree,'Abrir ficha de Correto'));assert.equal(button(tree,'Abrir ficha de Atrasado'),undefined);assert.match(text(tree),/na busca por “atual”/);assert.doesNotMatch(text(find(tree,'nav',n=>n.props.className==='people-pagination')),/42 nesta aba/);
});
test('Pessoas diferencia erro inicial de lista vazia e permite nova tentativa',async()=>{
 const f=people();await reply(f.requests[0],{error:'Falha na lista'},503);assert.match(text(f.render()),/Falha na lista/);assert.doesNotMatch(text(f.render()),/Nenhuma pessoa encontrada/);assert.equal(find(f.render(),'div',n=>n.props.className==='people-metrics'),undefined);
 button(f.render(),'Tentar novamente').props.onClick();await reply(f.requests.at(-1),peopleResponse([]));assert.match(text(f.render()),/Nenhuma pessoa encontrada/);
});
test('Pessoas bloqueia paginação duplicada, mantém resultados em falha e elimina repetições',async()=>{
 const f=people();await reply(f.requests[0],peopleResponse([person(1,'Primeira')],'cursor-1'));const action=button(f.render(),'Carregar mais').props.onClick;action();action();assert.equal(f.requests.length,2);await reply(f.requests.at(-1),{error:'Falha no próximo lote'},503);assert.ok(button(f.render(),'Abrir ficha de Primeira'));assert.ok(button(f.render(),'Tentar carregar mais'));
 button(f.render(),'Tentar carregar mais').props.onClick();await reply(f.requests.at(-1),peopleResponse([person(1,'Primeira'),person(2,'Segunda')]));assert.equal(nodes(f.render()).filter(n=>n.type==='article'&&n.props.className?.includes('people-card')).length,2);
});
test('Pessoas não anexa lote antigo depois da troca de filtro e limpa aba e busca juntas',async()=>{
 const f=people();await reply(f.requests[0],peopleResponse([person(1,'Primeira')],'cursor-1'));button(f.render(),'Carregar mais').props.onClick();const page=f.requests.at(-1);button(f.render(),'Oficiais 2').props.onClick();change(searchInput(f.render()),'nome');f.render();f.flush();await reply(f.requests.at(-1),peopleResponse([person(2,'Resultado')]));await reply(page,peopleResponse([person(3,'Página antiga')]));assert.doesNotMatch(text(f.render()),/Página antiga/);
 button(f.render(),'Limpar filtros').props.onClick();assert.equal(searchInput(f.render()).props.value,'');assert.equal(button(f.render(),'Todas 42').props['aria-pressed'],true);
});
