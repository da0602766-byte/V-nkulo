import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

async function moduleAt(path, dependencies, globals = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  runInNewContext(outputText, { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, Date, Response, URL, ...globals });
  return exports;
}

async function fixture(t) {
  const { database, d1 } = await createPilotD1();
  t.after(() => database.close());
  let now = Date.parse("2026-09-23T15:30:00Z"), reads = 0;
  class Clock extends Date { static now() { return now; } }
  const service = await moduleAt("app/lib/operational-dashboard.ts", {
    "./integration-catalog": { getIntegrationCatalog: async () => ({ connectors: [{ id: "firebase", available: true, status: "connected" }, { id: "planned", available: false }] }) },
  }, { Date: Clock });
  const db = { prepare: sql => { reads++; return d1.prepare(sql); } };
  const user = await createPilotUser(database, { nome: "Dashboard", email: "dashboard@example.test", senha: "Ficticia123" });
  database.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,'secret-session',datetime('now','+1 day'))").run(user);
  const ids = [];
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/private-web", "fcm:private-native"]) {
    ids.push(Number(database.prepare("INSERT INTO notificacoes_push_dispositivos(usuario_id,endpoint,p256dh,auth,sessao_token_hash,vinculo_id) VALUES (?,?,'private-key','private-auth','secret-session',?)").run(user, endpoint, crypto.randomUUID()).lastInsertRowid));
  }
  const add = (channel, state, updated, created = updated, attempts = 1) => {
    const notification = Number(database.prepare("INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,usuario_id,criado_por) VALUES ('INFO','Título privado','Mensagem privada','EVENTOS',?,'teste')").run(user).lastInsertRowid);
    database.prepare("DELETE FROM notificacoes_push_fila WHERE notificacao_id=? AND dispositivo_id!=?").run(notification, ids[channel]);
    database.prepare("UPDATE notificacoes_push_fila SET estado=?,atualizado_em=?,criado_em=?,tentativas=? WHERE notificacao_id=?").run(state, updated, created, attempts, notification);
  };
  return { database, db, add, service, reads: () => reads, advance: ms => { now += ms; } };
}

test("dashboard: agrega estados e canais, mede tempo até aceite e exclui dados privados", async t => {
  const f = await fixture(t);
  f.add(0, "ACEITO", "2026-09-23 15:00:00", "2026-09-23 14:59:00", 2);
  f.add(1, "ACEITO", "2026-09-23 14:00:00", "2026-09-23 14:00:00");
  f.add(1, "FALHA", "2026-09-23 14:05:00");
  f.add(1, "EXPIRADA", "2026-09-23 14:10:00");
  f.add(0, "CANCELADA", "2026-09-23 14:15:00");
  const data = await f.service.getOperationalDashboard(f.db, "24h", "all");
  assert.equal(data.total, 5); assert.equal(data.acceptanceRate, 50);
  assert.equal(data.meanAcceptanceSeconds, 30); assert.equal(data.maxAcceptanceSeconds, 60);
  assert.equal(data.retried, 1); assert.equal(data.series.length, 25);
  assert.equal(data.series.reduce((n, item) => n + item.accepted, 0), 2);
  assert.equal(data.channels.find(c => c.channel === "android").total, 3);
  assert.equal(data.connectors.length, 1);
  assert.doesNotMatch(JSON.stringify(data), /private-|secret-session|Mensagem privada|Título privado|endpoint|p256dh|usuario_id/);
  const android = await f.service.getOperationalDashboard(f.db, "24h", "android");
  assert.equal(android.total, 3); assert.equal(android.meanAcceptanceSeconds, 0);
  assert.equal(android.channels.length, 1); assert.ok(android.recent.every(row => row.channel === "android"));
});

test("dashboard: limites do período, intervalos de Brasília e fila atual independente", async t => {
  const f = await fixture(t);
  f.add(0, "PENDENTE", "2026-09-20 01:00:00");
  f.add(1, "PENDENTE", "2026-09-20 01:00:00");
  f.add(0, "ACEITO", "2026-09-22 15:29:59");
  f.add(0, "ACEITO", "2026-09-22 15:30:00");
  f.add(0, "ACEITO", "2026-09-23 15:30:01");
  const day = await f.service.getOperationalDashboard(f.db, "24h", "web");
  assert.equal(day.total, 1); assert.equal(day.series[0].accepted, 1);
  assert.equal(day.queue.pending, 1); assert.equal(day.queue.oldestPendingAt, "2026-09-20 01:00:00");
  const week = await f.service.getOperationalDashboard(f.db, "7d", "all");
  assert.equal(week.total, 4); assert.equal(week.series.length, 8);
  assert.ok(week.series.every(item => item.at.endsWith("T03:00:00.000Z")));
  assert.equal(week.queue.pending, 2);
});

test("dashboard: sem amostras não inventa taxa ou latência; cache curto isolado por filtro", async t => {
  const f = await fixture(t);
  const empty = await f.service.getOperationalDashboard(f.db, "24h", "all"), reads = f.reads();
  assert.equal(empty.total, 0); assert.equal(empty.acceptanceRate, null); assert.equal(empty.meanAcceptanceSeconds, null);
  f.add(0, "ACEITO", "2026-09-23 15:00:00", "2026-09-23 15:00:01");
  assert.equal(await f.service.getOperationalDashboard(f.db, "24h", "all"), empty);
  assert.equal(f.reads(), reads);
  assert.equal((await f.service.getOperationalDashboard(f.db, "24h", "web")).total, 1);
  f.advance(15001);
  const fresh = await f.service.getOperationalDashboard(f.db, "24h", "all");
  assert.equal(fresh.total, 1); assert.equal(fresh.meanAcceptanceSeconds, null, "timestamps inconsistentes não geram latência negativa");
  assert.equal(fresh.maxAcceptanceSeconds, null);
});

test("dashboard: histórico usa índice de tempo e limita atividade recente", async t => {
  const f = await fixture(t);
  for (let i = 0; i < 16; i++) f.add(0, "ACEITO", "2026-09-23 15:00:00");
  const data = await f.service.getOperationalDashboard(f.db, "7d", "all");
  assert.equal(data.recent.length, 12); assert.equal(data.total, 16);
  const plan = f.database.prepare("EXPLAIN QUERY PLAN SELECT q.estado,COUNT(*) FROM notificacoes_push_fila q JOIN notificacoes_push_dispositivos p ON p.id=q.dispositivo_id WHERE q.atualizado_em>=? AND q.atualizado_em<=? GROUP BY q.estado").all("2026-09-22", "2026-09-24");
  assert.match(JSON.stringify(plan), /historico_idx/);
});

test("dashboard API: autoriza antes de consultar, valida filtros e sanitiza falha", async () => {
  let user = null, calls = 0, fail = false;
  const route = await moduleAt("app/api/proprietario/operacao/route.ts", {
    "../../../../db": { getD1: () => ({}) }, "../../../lib/local-auth": { getSessionUser: async () => user },
    "../../../lib/operational-dashboard": { getOperationalDashboard: async (_db, period, channel) => { calls++; if (fail) throw new Error("private-secret"); return { period, channel }; } },
  });
  const request = query => new Request(`https://example.test/api/proprietario/operacao${query}`);
  assert.equal((await route.GET(request(""))).status, 401);
  user = { ativo: true, system_owner: false };
  assert.equal((await route.GET(request(""))).status, 403); assert.equal(calls, 0);
  user.system_owner = true;
  for (const query of ["?period=1y", "?channel=other", "?period=24h%27"]) assert.equal((await route.GET(request(query))).status, 400);
  assert.equal(calls, 0);
  const response = await route.GET(request("?period=7d&channel=android"));
  assert.deepEqual(await response.json(), { period: "7d", channel: "android" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  fail = true;
  const error = await route.GET(request("")); assert.equal(error.status, 503); assert.doesNotMatch(await error.text(), /private-secret/);
  assert.deepEqual(Object.keys(route), ["GET"]);
});

test("dashboard polling: mudança de filtros descarta resposta antiga, preserva falha temporária e limpa ao perder acesso", async () => {
  const states = [], timers = new Map(), requests = [];
  let effect, index = 0, timerId = 0;
  const component = await moduleAt("app/components/OwnerPushDelivery.tsx", {
    react: { useState: initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; }, useEffect: fn => { effect = fn; } },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null }, "./OperationalDeliveryChart": { default: () => null },
  }, { AbortController, document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} }, navigator: { onLine: true }, window: { addEventListener() {}, removeEventListener() {} },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => new Promise(resolve => { requests.push({ url, resolve, signal: options.signal }); }),
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  component.default(); let cleanup = effect();
  let oldJson;
  requests[0].resolve({ ok: true, status: 200, json: () => new Promise(resolve => { oldJson = resolve; }) });
  await tick();
  cleanup(); states[4] = "7d"; states[5] = "android"; index = 0;
  component.default(); cleanup = effect();
  assert.equal(requests[0].signal.aborted, true);
  assert.match(requests[1].url, /period=7d&channel=android/);
  oldJson({ stale: true }); await tick(); assert.equal(states[0], null);
  const snapshot = { total: 4 };
  requests[1].resolve(Response.json(snapshot)); await tick(); assert.equal(states[0].total, 4);
  const next = [...timers.entries()].find(([,timer]) => timer.ms === 30000); timers.delete(next[0]); next[1].fn();
  requests[2].resolve(new Response(null, { status: 503 })); await tick();
  assert.equal(states[0].total, 4); assert.match(states[1], /Não foi possível/);
  const retry = [...timers.entries()].find(([,timer]) => timer.ms === 60000); timers.delete(retry[0]); retry[1].fn();
  requests[3].resolve(new Response(null, { status: 403 })); await tick();
  assert.equal(states[0], null); assert.equal(timers.size, 0); cleanup();
});
