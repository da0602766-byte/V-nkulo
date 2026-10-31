import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function harness() {
  const slots = [], effects = [], timers = new Map(), requests = [];
  let cursor = 0, timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (factory, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../app/components/RequestsWorkspace.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Date, URL, AbortController, Error,
    window: { location: { origin: 'http://localhost' }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }, setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url: String(url), options, resolve, reject })),
    require(name) { if (name === 'react') return hooks; if (name === 'react/jsx-runtime') return jsx; if (['./ActionDialog', './TransientFeedback', './SafeImage', './PrayerWelcomeArt'].includes(name)) return { default: () => null }; throw new Error(name); },
  });
  return { requests, render() { cursor = 0; return exports.default({ communityName: 'Comunidade teste' }); }, flush() { for (const fn of effects.splice(0)) fn(); const batch = [...timers.values()]; timers.clear(); for (const fn of batch) fn(); } };
}
function nodes(node) { if (Array.isArray(node)) return node.flatMap(nodes); if (!node || typeof node !== 'object') return []; return [node, ...nodes(node.props?.children)]; }
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); return typeof node === 'object' && node ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node); }
const button = (tree, label) => nodes(tree).find(n => n.type === 'button' && text(n) === label);
const settle = () => new Promise(resolve => setImmediate(resolve));
const metrics = { open: 0, urgent: 0, visits: 0, today: 0, total: 0, prayerTotal: 0, visitTotal: 0, inProgress: 0, overdue: 0, completed: 0 };
async function ready() {
  const f = harness(); f.render(); f.flush();
  f.requests[0].resolve(Response.json({ solicitacoes: [], canManage: true }));
  f.requests[1].resolve(Response.json({ canOperate: true, repositories: [], itemsMetrics: metrics, currentActor: { id: 1, nome: 'Teste' }, assignees: [], ministries: [], pastoresContato: [], whatsappPreference: {} }));
  await settle(); const tree = f.render(); button(tree, 'Atendimento').props.onClick(); f.render(); f.flush();
  return f;
}
async function respond(pair, name, status = 200, cursor = null) {
  pair[0].resolve(Response.json(status === 200 ? { items: [] } : { error: 'Falha simulada' }, { status }));
  pair[1].resolve(Response.json(status === 200 ? { solicitacoes: name ? [{ id: 1, tipo: 'OUTRO', titulo: name, descricao: 'Teste de busca', solicitante_nome: name, solicitante_papel: 'MEMBRO', criado_em: '2026-10-08', status: 'ABERTA' }] : [], nextCursor: cursor } : { error: 'Falha simulada' }, { status }));
  await settle();
}
test('Pedidos troca filtro sem esperar resposta anterior e ignora a resposta cancelada', async () => {
  const f = await ready(); const previous = f.requests.slice(-2);
  button(f.render(), 'Orações 0').props.onClick(); f.render(); f.flush();
  assert.equal(previous[0].options.signal.aborted, true);
  const current = f.requests.slice(-2); assert.match(current[0].url, /categoria=ORACAO/);
  assert.match(text(f.render()), /Buscando pedidos/);
  assert.doesNotMatch(text(f.render()), /Nenhum pedido encontrado/);
  await respond(current, 'Resultado atual');
  await respond(previous, 'Resultado antigo');
  const visible = text(f.render()); assert.match(visible, /Resultado atual/); assert.doesNotMatch(visible, /Resultado antigo/);
});
test('Pedidos diferencia erro de lista vazia e permite repetir a consulta', async () => {
  const f = await ready(); await respond(f.requests.slice(-2), null, 503);
  const failed = f.render(); assert.match(text(failed), /Não foi possível atualizar os pedidos/); assert.doesNotMatch(text(failed), /Nenhum pedido/);
  button(failed, 'Tentar novamente').props.onClick(); await respond(f.requests.slice(-2), null);
  assert.match(text(f.render()), /Nenhum pedido para atendimento no momento/);
});
test('Pedidos não anexa uma página antiga depois de trocar filtros', async () => {
  const f = await ready(); await respond(f.requests.slice(-2), 'Inicial', 200, 'next-page');
  button(f.render(), 'Carregar mais pedidos').props.onClick(); const oldPage = f.requests.at(-1);
  button(f.render(), 'Orações 0').props.onClick(); f.render(); f.flush(); await respond(f.requests.slice(-2), 'Filtro novo');
  oldPage.resolve(Response.json({ solicitacoes: [{ id: 2, titulo: 'Página antiga' }] })); await settle();
  assert.match(text(f.render()), /Filtro novo/); assert.doesNotMatch(text(f.render()), /Página antiga/);
});

test('Pedidos remove resultados anteriores quando a sessão perde acesso', async () => {
  const f = await ready(); await respond(f.requests.slice(-2), 'Conteúdo protegido');
  assert.match(text(f.render()), /Conteúdo protegido/);
  button(f.render(), 'Meu espaço').props.onClick(); f.render(); f.flush();
  button(f.render(), 'Atendimento').props.onClick(); f.render(); f.flush();
  await respond(f.requests.slice(-2), null, 403);
  assert.doesNotMatch(text(f.render()), /Conteúdo protegido/);
  assert.match(text(f.render()), /Não foi possível atualizar os pedidos/);
});
