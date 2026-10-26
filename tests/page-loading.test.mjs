import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function page(file, modules) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
  }).outputText, {exports, URLSearchParams, require(name) {
    if (name === 'react/jsx-runtime') return jsx;
    if (name in modules) return modules[name];
    if (name.includes('/components/')) return {default: name};
    throw Error('Unexpected dependency: ' + name);
  }});
  return exports.default;
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
function panel(user = {id: 7, ativo: true, system_owner: false}) {
  const calls = [];
  const context = {comunidadeId: 3, permissions: ['feed.view']};
  const feed = [{id: 10, titulo: 'Mural autorizado'}];
  const run = page('app/painel/page.tsx', {
    'next/navigation': {redirect: path => {throw Error('redirect:' + path);}},
    '../../db': {getD1: () => ({})},
    '../lib/local-auth': {getSessionState: async () => ({user, reason: 'cookie_ausente'})},
    '../lib/tenant': {getActiveTenantContext: async () => ({context, memberships: []})},
    '../lib/pilot-data': {
      getPilotFeed: async (...args) => {calls.push(args); return feed;},
      getPilotFeatureState: async () => ({}), getParkingModuleState: async () => false,
    },
    '../lib/community-theme-storage': {getCommunityTheme: async () => ({})},
    '../lib/recepcao': {getPendingPromotionNotice: async () => null, getIntroductionState: async () => null},
  });
  return {calls, feed, run: async view => nodes(await run({searchParams: Promise.resolve({view})})).find(n => n.type === '../components/PilotDashboard')};
}

test('outras abas do painel não consultam nem serializam o mural', async () => {
  const f = panel();
  for (const view of ['fio','eventos','ministerios','celulas','estacionamento','redes','membro','lider','comunidade','relatorios','avisos','configuracoes','continuidade','pessoas','solicitacoes','conta','mensagens']) {
    const rendered = await f.run(view);
    assert.equal(rendered.props.initialView, view);
    assert.equal(rendered.props.feed.length, 0);
  }
  assert.equal(f.calls.length, 0);
});

test('início e endereço inválido preservam o mural autorizado na primeira renderização', async () => {
  const f = panel();
  for (const view of ['inicio', 'inexistente']) assert.equal((await f.run(view)).props.feed, f.feed);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0], [3, 7, false, false]);
});

test('redirecionamentos de login e Visitantes ocorrem antes de consultar o mural', async () => {
  const guest = panel(null);
  await assert.rejects(guest.run('inicio'), /redirect:\/login/);
  assert.equal(guest.calls.length, 0);
  const f = panel();
  await assert.rejects(f.run('visitantes'), /redirect:\/painel\/visitantes/);
  assert.equal(f.calls.length, 0);
});

test('página inicial inicia planos e identidade visual em paralelo após validar sessão', async () => {
  const started = [], gates = {};
  const run = page('app/page.tsx', {
    'next/navigation': {redirect: path => {throw Error(path);}},
    './lib/local-auth': {getSessionUser: async () => null},
    './lib/platform-plans': {getLandingPlans: () => {started.push('plans'); return new Promise(resolve => {gates.plans = resolve;});}},
    './lib/platform-branding': {getPlatformBranding: () => {started.push('branding'); return new Promise(resolve => {gates.branding = resolve;});}},
  });
  const pending = run();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['plans', 'branding']);
  gates.plans([]); gates.branding({siteName: 'Vínkulo', logoUrl: ''});
  assert.ok(await pending);
});
