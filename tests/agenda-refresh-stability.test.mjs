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
    exports, Date, Map, AbortController, Error,
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    window: { addEventListener() {}, removeEventListener() {}, setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {} },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    require(name) { if (name === '../lib/agenda-request') return requestModule; if (name === './AgendaDialog') return {default: function AgendaDialog() {}}; if (name === 'react') return hooks; if (name === 'react/jsx-runtime') return jsx; if (name.endsWith('.css')) return { default: {} }; if (name === './TransientFeedback') return { default: () => null }; throw new Error(name); },
  });
  return { requests, render(revision = 0) { cursor = 0; return exports.default({ podeVerEventos: true, podeAprovar: false, atualizacao: revision }); }, flush() { for (const fn of effects.splice(0)) fn(); for (const fn of timers.splice(0)) fn(); } };
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
const panel = tree => nodes(tree).find(n => n.props?.['aria-label'] === 'Planejar dia selecionado');
const grid = tree => nodes(tree).find(n => n.props?.className === 'agenda-grade');
const settle = () => new Promise(resolve => setImmediate(resolve));
const respond = async (request, status = 200) => {
  request.resolve(Response.json(status === 200 ? { itens: [] } : { error: 'Falha de consulta' }, { status }));
  await settle();
};

test('agenda: repeated background refreshes keep the selected-day panel mounted and the grid ready', async () => {
  const f = harness();
  f.render(); f.flush();
  await respond(f.requests.at(-1));
  let tree = f.render();
  nodes(tree).find(n => n.type === 'button' && n.props?.className?.startsWith('agenda-dia')).props.onClick();
  tree = f.render();
  const title = nodes(panel(tree)).find(n => n.type === 'strong').props.children;
  for (let revision = 1; revision <= 4; revision++) {
    f.render(revision); f.flush();
    tree = f.render(revision);
    assert.ok(panel(tree), 'the panel must remain during a pending refresh');
    assert.equal(grid(tree).props['aria-busy'], false);
    assert.equal(nodes(panel(tree)).find(n => n.type === 'strong').props.children, title);
    await respond(f.requests.at(-1));
    assert.ok(panel(f.render(revision)));
  }
  nodes(tree).find(n => n.type?.name === 'AgendaDialog').props.onClose();
  assert.equal(panel(f.render(4)), undefined, 'explicit close still works');
});

test('agenda: transient refresh failure preserves the calendar; revoked access clears it without hiding selection', async () => {
  const f = harness();
  f.render(); f.flush(); await respond(f.requests.at(-1));
  let tree = f.render();
  nodes(tree).find(n => n.type === 'button' && n.props?.className?.startsWith('agenda-dia')).props.onClick();
  f.render(1); f.flush(); await respond(f.requests.at(-1), 503); await respond(f.requests.at(-1), 503);
  tree = f.render(1);
  assert.ok(panel(tree)); assert.ok(grid(tree));
  assert.ok(nodes(panel(tree)).some(n => n.props?.children === 'Última consulta exibida; não foi possível atualizar.'));
  f.render(2); f.flush(); await respond(f.requests.at(-1), 401);
  tree = f.render(2);
  assert.ok(panel(tree)); assert.equal(grid(tree), undefined);
});

test('agenda: changing period still loads fresh data and ignores an aborted response', async () => {
  const f = harness(); f.render(); f.flush(); await respond(f.requests.at(-1));
  let tree = f.render(1); f.flush(); const previous = f.requests.at(-1);
  nodes(tree).find(n => n.props?.['aria-label'] === 'Próximo período').props.onClick();
  f.render(1); f.flush(); tree = f.render(1);
  assert.equal(previous.options.signal.aborted, true);
  assert.equal(grid(tree).props['aria-busy'], true);
  await respond(previous); assert.equal(grid(f.render(1)).props['aria-busy'], true);
  await respond(f.requests.at(-1)); assert.equal(grid(f.render(1)).props['aria-busy'], false);
});

 test('agenda: selecting a date opens the card and prefills the appointment without top create buttons', async () => {
  const f=harness(); f.render(); f.flush(); await respond(f.requests.at(-1)); let tree=f.render();
  assert.equal(nodes(tree).some(n=>n.props?.className==='agenda-novo'),false);
  const day=nodes(tree).find(n=>n.type==='button'&&n.props?.className?.startsWith('agenda-dia'));
  day.props.onClick(); tree=f.render(); assert.ok(nodes(tree).some(n=>n.type?.name==='AgendaDialog'));
  const action=nodes(tree).find(n=>n.type==='button'&&nodes(n).some(c=>c.type==='b'&&c.props.children==='＋ Novo compromisso'));
  action.props.onClick(); tree=f.render(); const input=nodes(tree).find(n=>n.props?.name==='iniciaEm');
  assert.ok(input.props.defaultValue.endsWith('T09:00'));
  assert.equal(input.props.defaultValue.slice(0,10),day.key);
  assert.equal(nodes(tree).some(n=>n.props?.children==='＋ Criar evento'),false,'members cannot create community events');
});
