import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function harness() {
  const slots = [], effects = [], timers = [], requests = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useId: () => 'agenda-test',
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const requestFetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
  const requestModule = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/agenda-request.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: requestModule, AbortController, Error, TypeError, setTimeout, clearTimeout, fetch: requestFetch });
  const exports = {};
  const source = readFileSync(new URL('../app/components/AgendaCalendar.tsx', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Date, Map, Set, Intl, AbortController, Error,
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    window: { matchMedia(){return {matches:false};}, addEventListener() {}, removeEventListener() {}, setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {} },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    require(name) { if (name === '../lib/calendar-management') {const helpers={};runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/calendar-management.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:helpers,Date,Set});return helpers;} if (name === '../lib/agenda-request') return requestModule; if (name === './AgendaDialog') return {default: function AgendaDialog() {}}; if (name === 'react') return hooks; if (name === 'react/jsx-runtime') return jsx; if (name.endsWith('.css')) return { default: {} }; if (name === './TransientFeedback') return { default: () => null }; throw new Error(name); },
  });
  return { requests, render(revision = 0) { cursor = 0; return exports.default({ podeVerEventos: true, podeAprovar: false, atualizacao: revision }); }, flush() { for (const fn of effects.splice(0)) fn(); for (const fn of timers.splice(0)) fn(); } };
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}

const panel=tree=>nodes(tree).find(n=>n.props?.className==='vp-side-form');
const grid=tree=>nodes(tree).find(n=>n.props?.className==='vp-calendar-main');
const task={id:'tarefa-1',camada:'TAREFA',origemId:1,titulo:'Pendência particular',descricao:'Texto preservado',iniciaEm:null,terminaEm:null,status:'PLANEJADO',prioridade:'P2',responsavelId:7,responsavel:'Pessoa de teste',versao:1,podeEditar:true,local:'',diaInteiro:false};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function respond(f,status=200){
  for(let turn=0;turn<4;turn++){
    const pending=f.requests.filter(request=>!request.answered);if(!pending.length)break;
    for(const request of pending){request.answered=true;request.resolve(Response.json(status===200?(request.url.includes('/tarefas')?{itens:[task],responsaveis:[{id:7,nome:'Pessoa de teste'}],usuarioId:7,limitado:false}:{itens:[]}):{error:'Falha de consulta'},{status}));}
    await settle();
  }
}
const click=(tree,label)=>nodes(tree).find(n=>n.props?.['aria-label']===label).props.onClick();
test('calendar refresh keeps an unsaved editor and its data mounted across background requests',async()=>{
 const f=harness();f.render();f.flush();await respond(f);let tree=f.render();
 nodes(tree).find(n=>n.props?.className==='vp-backlog-title').props.onClick();tree=f.render();
 const title=nodes(panel(tree)).find(n=>n.props?.name==='titulo');title.props.onChange({target:{value:'Edição não salva'}});
 for(let revision=1;revision<=4;revision++){f.render(revision);f.flush();tree=f.render(revision);assert.ok(panel(tree));assert.equal(grid(tree).props['aria-busy'],false);assert.equal(nodes(panel(tree)).find(n=>n.props?.name==='titulo').props.value,'Edição não salva');await respond(f);}
 click(f.render(4),'Fechar detalhes');assert.equal(panel(f.render(4)),undefined);
});
test('calendar temporary refresh errors preserve data; revoked access clears private items and editor',async()=>{
 const f=harness();f.render();f.flush();await respond(f);let tree=f.render();nodes(tree).find(n=>n.props?.className==='vp-backlog-title').props.onClick();
 f.render(1);f.flush();await respond(f,503);tree=f.render(1);assert.ok(panel(tree));assert.ok(nodes(tree).some(n=>n.props?.role==='alert'));assert.equal(grid(tree).props['aria-busy'],false);
 f.render(2);f.flush();await respond(f,401);tree=f.render(2);assert.equal(panel(tree),undefined);assert.equal(nodes(tree).some(n=>n.props?.className==='vp-backlog-title'),false);
});
test('calendar range changes abort previous requests and ignore their late responses',async()=>{
 const f=harness();f.render();f.flush();await respond(f);f.render(1);f.flush();const previous=f.requests.slice(-2);
 click(f.render(1),'Próximo período');f.render(1);f.flush();assert.ok(previous.every(request=>request.options.signal.aborted));assert.equal(grid(f.render(1)).props['aria-busy'],true);
 for(const request of previous){request.answered=true;request.resolve(Response.json({itens:[]}));}await settle();assert.equal(grid(f.render(1)).props['aria-busy'],true);
 await respond(f);assert.equal(grid(f.render(1)).props['aria-busy'],false);
});
test('calendar offers four modes, keyboard scheduling and a real unscheduled task form',async()=>{
 const f=harness();f.render();f.flush();await respond(f);let tree=f.render();
 assert.deepEqual(nodes(tree).filter(n=>n.type==='button'&&['Mês','Semana','Dia','Agenda'].includes(n.props.children)).map(n=>n.props.children),['Mês','Semana','Dia','Agenda']);
 nodes(tree).find(n=>n.props?.className==='vp-button vp-primary vp-new').props.onClick();tree=f.render();assert.ok(panel(tree));assert.equal(nodes(tree).find(n=>n.props?.name==='iniciaEm').props.value,'');assert.equal(nodes(tree).find(n=>n.props?.name==='iniciaEm').props.required,false);
 assert.equal(nodes(tree).some(n=>n.props?.children==='Criar evento da comunidade ↗'),false);
 click(tree,'Fechar detalhes');tree=f.render();nodes(tree).find(n=>n.props?.children==='Agendar →').props.onClick();tree=f.render();assert.match(nodes(tree).find(n=>n.props?.name==='iniciaEm').props.value,/T09:00$/);
});
