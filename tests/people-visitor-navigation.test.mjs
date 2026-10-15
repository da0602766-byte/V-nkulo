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
const visitor=(id,nome)=>({id,nome_completo:nome,status:'NOVO',ativo:1,data_entrada:'2026-10-01',criado_em:'2026-10-01',atualizado_em:'2026-10-01',acompanhamentos_total:0});
const visitorResponse=(visitantes,nextCursor=null)=>({visitantes,nextCursor,aniversariantes:[],contagens:{todos:2,novos:2,em_contato:0,acompanhamento:0,integrado:0,pendencias:0,sem_contato:0,arquivados:1}});
const requestFor=(f,part)=>f.requests.findLast(r=>String(r.url).includes(part));
async function visitors(){const f=harness('TenantOperations.tsx',{permissions:['followups.view'],communityName:'Demonstração'},'VisitorsWorkspace');f.render();f.flush();await reply(requestFor(f,'visitantes?'),visitorResponse([visitor(1,'Ana'),visitor(2,'Bia')]));await reply(requestFor(f,'/celulas'),{celulas:[]});await reply(requestFor(f,'visitante-categorias'),{categorias:[],crescimento:[],meses:[]});button(f.render(),'Pessoas2').props.onClick();f.render();f.flush();return f;}
test('Visitantes oculta resultados antigos durante busca e recusa resposta atrasada',async()=>{
 const f=await visitors();change(searchInput(f.render()),'lento');assert.equal(find(f.render(),'tr',n=>n.props.onDoubleClick),undefined);f.render();f.flush();const slow=requestFor(f,'visitantes?');change(searchInput(f.render()),'atual');f.render();f.flush();await reply(requestFor(f,'visitantes?'),visitorResponse([visitor(3,'Correto')]));await reply(slow,visitorResponse([visitor(4,'Atrasado')]));assert.match(text(f.render()),/Correto/);assert.doesNotMatch(text(f.render()),/Atrasado/);
});
test('Filtros do diretório de visitantes não restringem a aba Acompanhamento',async()=>{
 const f=await visitors();change(searchInput(f.render()),'busca');f.render();f.flush();await reply(requestFor(f,'visitantes?'),visitorResponse([]));button(f.render(),'Acompanhamento0').props.onClick();f.render();f.flush();const url=String(requestFor(f,'visitantes?').url);assert.doesNotMatch(url,/busca=/);assert.match(url,/visao=todos/);assert.equal(find(f.render(),'relationships'),undefined);
});
test('Visitantes limpa também a visão arquivados e distingue falha de vazio',async()=>{
 const f=await visitors();button(f.render(),'☷ Filtros').props.onClick();button(f.render(),'Ver arquivados (1)').props.onClick();f.render();f.flush();await reply(requestFor(f,'visitantes?'),{error:'Consulta indisponível'},503);assert.doesNotMatch(text(f.render()),/Nenhuma pessoa nesta visão/);assert.match(text(f.render()),/Consulta indisponível/);
 button(f.render(),'Limpar filtros').props.onClick();f.render();f.flush();assert.match(String(requestFor(f,'visitantes?').url),/visao=todos/);await reply(requestFor(f,'visitantes?'),visitorResponse([]));assert.match(text(f.render()),/Nenhuma pessoa nesta visão/);
});
test('Histórico de visitante mostra carregamento, erro recuperável e nunca mistura pessoas',async()=>{
 const f=await visitors();find(f.render(),'button',n=>n.props.className==='visitor-person-cell-v2'&&text(n).includes('Ana')).props.onClick();assert.match(text(f.render()),/Carregando histórico/);assert.doesNotMatch(text(f.render()),/Nenhum acompanhamento registrado/);await reply(requestFor(f,'visitantes?id=1'),visitorResponse([visitor(1,'Ana')]));const first=requestFor(f,'acompanhamentos');
 button(f.render(),'Fechar ficha')?.props.onClick();find(f.render(),'button',n=>n.props.className==='visitor-person-cell-v2'&&text(n).includes('Bia')).props.onClick();await reply(requestFor(f,'visitantes?id=2'),visitorResponse([visitor(2,'Bia')]));await reply(requestFor(f,'acompanhamentos'),{error:'Falha no histórico'},503);await reply(first,{acompanhamentos:[{id:9,resultado:'Histórico de Ana',tipo:'TELEFONE',criado_em:'2026-10-01'}]});assert.match(text(f.render()),/Falha no histórico/);assert.doesNotMatch(text(f.render()),/Histórico de Ana|Nenhum acompanhamento registrado/);
 button(f.render(),'Tentar novamente').props.onClick();await reply(requestFor(f,'visitantes?id=2'),visitorResponse([visitor(2,'Bia')]));await reply(requestFor(f,'acompanhamentos'),{acompanhamentos:[]});assert.match(text(f.render()),/Nenhum acompanhamento registrado/);
});

test('Visitantes mantém a página carregada quando carregar mais falha e impede envio duplicado',async()=>{
 const f=await visitors();change(searchInput(f.render()),'teste');f.render();f.flush();await reply(requestFor(f,'visitantes?'),visitorResponse([visitor(1,'Ana')],12));const action=button(f.render(),'Carregar mais pessoas').props.onClick;const before=f.requests.length;action();action();assert.equal(f.requests.length,before+1);await reply(requestFor(f,'visitantes?'),{error:'Falha no lote'},503);assert.match(text(f.render()),/Ana/);assert.ok(button(f.render(),'Tentar carregar mais'));
});

test('Abrir cadastro duplicado direciona para arquivados e abre a ficha correspondente',async()=>{
 const f=harness('TenantOperations.tsx',{permissions:['visitors.create'],communityName:'Demonstração'},'VisitorsWorkspace');f.render();f.flush();await reply(requestFor(f,'visitantes?'),visitorResponse([]));button(f.render(),'＋ Novo visitante').props.onClick();find(f.render(),'form',n=>n.props.className==='pilot-form visitor-registration').props.onInput({currentTarget:{nomeCompleto:'Pessoa arquivada'}});f.render();f.flush();const existing={...visitor(7,'Pessoa arquivada'),ativo:0};await reply(requestFor(f,'duplicidade=1'),{duplicados:[existing]});find(f.render(),'button',n=>text(n).includes('Abrir ficha')).props.onClick();f.render();f.flush();const req=requestFor(f,'visao=arquivados');assert.ok(req);assert.match(String(req.url),/busca=Pessoa/);await reply(req,visitorResponse([existing]));assert.ok(find(f.render(),'dialog'));assert.match(text(find(f.render(),'dialog')),/Pessoa arquivada/);
});


test('Link direto abre ficha fora da primeira página e oferece dados de leitura e prazos distintos', async () => {
 const f=harness('TenantOperations.tsx',{permissions:['visitors.view','followups.view'],communityName:'Teste'},'VisitorsWorkspace','?view=visitantes&visitante=999');
 f.render();f.flush();
 assert.ok(requestFor(f,'visitantes?id=999'));
 await reply(requestFor(f,'visitantes?id=999'),visitorResponse([{...visitor(999,'José da ficha'),endereco:'Rua de teste, 100',telefone:'(11) 91234-5678',categoria_id:7,responsavel_email:'autor@example.test',proximo_contato:'2026-10-20'}]));
 await reply(requestFor(f,'visitante-categorias'),{categorias:[{id:7,nome:'Equipe',responsavel_nome:'Responsável da categoria'}],crescimento:[],meses:[]});
 await reply(requestFor(f,'acompanhamentos'),{acompanhamentos:[{id:1,tipo:'TELEFONE',resultado:'Contato anterior',criado_em:'2026-10-01',responsavel_email:'autor@example.test'}]});
 const dialog=find(f.render(),'dialog');
 assert.match(text(dialog),/José da ficha/);assert.match(text(dialog),/Rua de teste, 100/);
 assert.equal(find(dialog,'a',n=>n.props.href?.startsWith('tel:')).props.href,'tel:+5511912345678');
 assert.ok(find(dialog,'a',n=>n.props.href?.startsWith('https:\/\/wa.me/')));
 const summary=find(dialog,'dl');assert.match(text(summary),/Responsável da categoria/);assert.doesNotMatch(text(summary),/autor@example.test/);
 assert.match(text(dialog),/Contato agendado: 20\/10\/2026/);assert.match(text(dialog),/Por autor@example.test/);
 assert.equal(find(dialog,'details',n=>n.props.className==='vd-ministry-link'),undefined);
});

test('Vínculo ministerial da ficha envia a categoria escolhida com autorização de edição', async () => {
 const f=harness('TenantOperations.tsx',{permissions:['visitors.view','visitors.edit'],communityName:'Teste'},'VisitorsWorkspace','?visitante=5');
 f.render();f.flush();await reply(requestFor(f,'visitantes?id=5'),visitorResponse([visitor(5,'Pessoa')]));
 await reply(requestFor(f,'visitante-categorias'),{categorias:[{id:7,nome:'Equipe',ministerio_id:2,ministerio_nome:'Acolhimento',migracao_automatica:0}],crescimento:[],meses:[]});
 const section=find(f.render(),'details',n=>n.props.className==='vd-ministry-link');assert.match(text(section),/Acolhimento · Equipe/);
 find(section,'form').props.onSubmit({preventDefault(){},currentTarget:{categoriaId:'7'}});
 assert.deepEqual(JSON.parse(requestFor(f,'/visitantes/5').options.body),{categoriaId:7,ministerio:'',vincularMinisterio:true});
});

test('Seleção para CSV atravessa páginas e é limpa ao mudar filtros; celular mantém nome e status', async () => {
 const f=harness('VisitorDirectory.tsx',{view:'pendencias',categories:[],canCreate:false,onOpen(){},selectedId:null,revision:'1'});
 const result=(id,page)=>({visitantes:[{...visitor(id,'Pessoa '+id),telefone:'Telefone oculto',categoria_nome:'Categoria oculta'}],total:16,pagina:page,paginas:2,limite:15,hoje:'2026-10-15',indicadores:{total:16},ministerios:[],responsaveis:[],grupos:[]});
 f.render();f.flush();await reply(f.requests.at(-1),result(1,1));
 const mobile=find(f.render(),'div',n=>n.props.className==='vd-mobile-list');assert.equal(text(mobile),'Pessoa 1Novo');
 button(f.render(),'Selecionar para exportar').props.onClick();
 find(f.render(),'button',n=>n.props.className==='vd-mobile-row').props.onClick();
 button(f.render(),'Próxima página').props.onClick();f.render();f.flush();await reply(f.requests.at(-1),result(16,2));
 find(f.render(),'button',n=>n.props.className==='vd-mobile-row').props.onClick();
 button(f.render(),'Exportar selecionados (2)').props.onClick();
 const exportRequest=f.requests.at(-1);assert.match(exportRequest.url,/exportar/);assert.equal(new URL('http://test'+exportRequest.url).searchParams.get('selecionados'),'1,16');
 await reply(exportRequest,{error:'Falha temporária'},503);assert.match(text(f.render()),/Falha temporária/);
 change(searchInput(f.render()),'outra');assert.ok(button(f.render(),'Exportar selecionados (0)').props.disabled);
});
