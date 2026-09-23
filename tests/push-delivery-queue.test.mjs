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
  runInNewContext(outputText, { exports, require: key => {
    assert.ok(key in dependencies, `dependência inesperada ${key}`);
    return dependencies[key];
  }, crypto, Response, Date, Math, ...globals });
  return exports;
}

async function fixture(t) {
  const { database, d1 } = await createPilotD1();
  t.after(() => database.close());
  const userId = await createPilotUser(database, { nome: "Conta da fila", email: "queue@example.test", senha: "Ficticia123" });
  const session = "session-queue-test", binding = crypto.randomUUID();
  database.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,?,datetime('now','+1 day'))").run(userId, session);
  database.prepare("INSERT INTO notificacoes_push_dispositivos(usuario_id,endpoint,p256dh,auth,sessao_token_hash,vinculo_id) VALUES (?,'https://fcm.googleapis.com/fcm/send/test','key','auth',?,?)").run(userId, session, binding);
  const calls = [], jobs = [];
  let configured = true, firebase = false;
  let sender = async () => new Response(null, { status: 201 });
  const transport = {
    getVapidConfiguration: () => configured ? {} : null,
    isWebPushConfigured: () => configured,
    isTrustedPushEndpoint: endpoint => endpoint.startsWith("https://fcm.googleapis.com/"),
    sendWebPush: async (sub, payload, config, options) => { calls.push({ sub, payload: JSON.parse(payload), options }); return sender(sub, payload); },
  };
  const queue = await moduleAt("app/lib/push-delivery-queue.ts", {
    "./firebase-integration": { readFirebaseConfig: async () => firebase ? {} : null, nativeToken: endpoint => endpoint.startsWith("fcm:") ? endpoint.slice(4) : null,
      sendFcm: async (config, endpoint, payload, ttl) => { calls.push({ sub: { endpoint }, payload, options: { ttl }, native: true }); return sender({ endpoint }, payload); } },
    "./web-push": transport, "../../db/runtime-env": { getRuntimeEnv: () => ({ executionContext: { waitUntil: p => jobs.push(p) } }) },
  });
  const notify = (area = "EVENTOS", type = "INFO") => Number(database.prepare("INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,usuario_id,criado_por) VALUES (?,'Título secreto','Mensagem secreta',?,?,'teste')").run(type, area, userId).lastInsertRowid);
  const rows = () => database.prepare("SELECT * FROM notificacoes_push_fila ORDER BY id").all();
  const due = () => database.prepare("UPDATE notificacoes_push_fila SET proxima_tentativa_em = 0 WHERE estado = 'PENDENTE'").run();
  return { database, d1, userId, binding, session, calls, queue, notify, rows, due, jobs,
    sender: fn => { sender = fn; }, configured: value => { configured = value; }, firebase: value => { firebase = value; } };
}

test("fila FCM: aguarda configuração, funciona sem VAPID e revoga tokens expirados", async t => {
  const f = await fixture(t);
  f.database.exec("UPDATE notificacoes_push_dispositivos SET endpoint='fcm:token-native-for-test'");
  f.notify(); await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[0].tentativas, 0, "configuração ausente não consome tentativas");
  f.firebase(true); f.configured(false);
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[0].estado, "ACEITO"); assert.equal(f.calls[0].native, true);
  assert.equal(f.calls[0].payload.bindingId, f.binding);
  assert.doesNotMatch(JSON.stringify(f.calls), /Título secreto|Mensagem secreta|session-queue/);
  f.notify(); f.sender(async () => new Response(null, { status: 410 }));
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM notificacoes_push_dispositivos").get().n, 0);
});

test("fila push: gatilho atômico, unicidade e exclusão de chat, sessão expirada e legado", async t => {
  const f = await fixture(t);
  assert.equal(f.rows().length, 0, "migração não reenvia notificações históricas");
  f.database.exec("BEGIN");
  f.notify();
  assert.equal(f.rows().length, 1);
  f.database.exec("ROLLBACK");
  assert.equal(f.rows().length, 0, "falha na transação não deixa entrega órfã");
  const id = f.notify();
  assert.throws(() => f.database.prepare("INSERT INTO notificacoes_push_fila(notificacao_id,dispositivo_id,usuario_id,vinculo_id) SELECT notificacao_id,dispositivo_id,usuario_id,vinculo_id FROM notificacoes_push_fila WHERE notificacao_id = ?").run(id), /UNIQUE/);
  f.notify("CHAT");
  f.database.exec("UPDATE sessoes SET expira_em = datetime('now','-1 minute')");
  f.notify();
  assert.equal(f.rows().length, 1);
  f.database.exec("UPDATE sessoes SET expira_em = datetime('now','+1 day'); UPDATE notificacoes_push_dispositivos SET vinculo_id = NULL");
  f.notify();
  assert.equal(f.rows().length, 1);
});

test("fila push: concorrência entre consumidores, lote limitado e conteúdo mínimo", async t => {
  const f = await fixture(t);
  for (let i = 0; i < 11; i++) f.notify("EVENTOS", i === 0 ? "IMPORTANTE" : "INFO");
  let active = 0, peak = 0;
  f.sender(async () => { peak = Math.max(peak, ++active); await new Promise(resolve => setImmediate(resolve)); active--; return new Response(null, { status: 201 }); });
  const results = await Promise.all([f.queue.drainPushQueue(f.d1), f.queue.drainPushQueue(f.d1)]);
  assert.equal(results.filter(r => r.busy).length, 1);
  assert.equal(f.calls.length, 8);
  assert.equal(peak, 4);
  assert.equal(f.rows().filter(r => r.estado === "PENDENTE").length, 3);
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.calls.length, 11);
  assert.equal(f.rows().filter(r => r.estado === "ACEITO").length, 11);
  assert.doesNotMatch(JSON.stringify(f.calls.map(c => c.payload)), /secreto|secreta|session-queue|key|auth/);
  assert.equal(f.calls.filter(c => c.options.urgent).length, 1);
  assert.ok(f.calls.every(c => c.options.ttl > 0 && c.options.ttl <= 86400 && /^n-\d+$/.test(c.options.topic)));
});

test("fila push: falha temporária respeita Retry-After e limita cinco envios", async t => {
  const f = await fixture(t);
  f.notify();
  f.sender(async () => new Response(null, { status: 429, headers: { "Retry-After": "120" } }));
  const before = Date.now();
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[0].estado, "PENDENTE");
  assert.ok(f.rows()[0].proxima_tentativa_em >= before + 120000);
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.calls.length, 1, "não reenvia antes do horário");
  f.sender(async () => { throw new Error("timeout"); });
  for (let i = 0; i < 4; i++) { f.due(); await f.queue.drainPushQueue(f.d1); }
  assert.equal(f.calls.length, 5);
  assert.equal(f.rows()[0].estado, "FALHA");
  assert.equal(f.rows()[0].motivo, "LIMITE_TENTATIVAS");
  f.due(); await f.queue.drainPushQueue(f.d1);
  assert.equal(f.calls.length, 5);
  const date = new Date(before + 600000).toUTCString();
  assert.ok(f.queue.retryAt(1, date, before) >= Date.parse(date));
});

test("fila push: erro 503 recupera, recusa permanente encerra e espera acima do prazo expira", async t => {
  const f = await fixture(t);
  f.notify();
  f.sender(async () => new Response(null, { status: 503 }));
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[0].estado, "PENDENTE");
  f.sender(async () => new Response(null, { status: 201 }));
  f.due(); await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[0].estado, "ACEITO");
  f.notify(); f.sender(async () => new Response(null, { status: 403 }));
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[1].estado, "FALHA");
  f.notify(); f.sender(async () => new Response(null, { status: 429, headers: { "Retry-After": "100000" } }));
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[2].estado, "EXPIRADA");
});

test("fila push: revalida leitura, conta ativa, sessão, vínculo e prazo antes de enviar", async t => {
  const f = await fixture(t);
  const read = f.notify();
  f.database.prepare("INSERT INTO notificacoes_lidas(notificacao_id,usuario_id) VALUES (?,?)").run(read, f.userId);
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows()[0].estado, "CANCELADA");
  f.notify(); f.database.prepare("UPDATE usuarios SET ativo = 0 WHERE id = ?").run(f.userId);
  await f.queue.drainPushQueue(f.d1);
  f.database.prepare("UPDATE usuarios SET ativo = 1 WHERE id = ?").run(f.userId);
  f.notify(); f.database.exec("UPDATE sessoes SET expira_em = datetime('now','-1 minute')");
  await f.queue.drainPushQueue(f.d1);
  f.database.exec("UPDATE sessoes SET expira_em = datetime('now','+1 day')");
  f.notify(); f.database.prepare("UPDATE notificacoes_push_dispositivos SET vinculo_id = ?").run(crypto.randomUUID());
  await f.queue.drainPushQueue(f.d1);
  f.notify(); f.database.exec("UPDATE notificacoes_push_fila SET expira_em = 1 WHERE estado = 'PENDENTE'");
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows().filter(r => r.estado === "CANCELADA").length, 4);
  assert.equal(f.rows().at(-1).estado, "EXPIRADA");
});

test("fila push: recupera lease vencido e impede conclusão antiga de apagar vínculo ou sobrescrever resultado", async t => {
  const f = await fixture(t);
  f.notify();
  let finishOld, reached;
  const started = new Promise(resolve => { reached = resolve; });
  f.sender(() => { reached(); return new Promise(resolve => { finishOld = resolve; }); });
  const old = f.queue.drainPushQueue(f.d1);
  await started;
  f.database.exec("UPDATE notificacoes_push_fila SET lease_ate = 0; UPDATE notificacoes_push_controle SET lease_ate = 0");
  f.sender(async () => new Response(null, { status: 201 }));
  await f.queue.drainPushQueue(f.d1);
  finishOld(new Response(null, { status: 410 }));
  await old;
  assert.equal(f.rows()[0].estado, "ACEITO");
  assert.equal(f.rows()[0].tentativas, 2);
  assert.equal(f.rows()[0].ultimo_status, 201);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM notificacoes_push_dispositivos").get().n, 1);
  assert.equal(f.database.prepare("SELECT ultimo_status FROM notificacoes_push_dispositivos").get().ultimo_status, 201);
});

test("fila push: endpoints removidos, retenção operacional e diagnóstico sem dados privados", async t => {
  const f = await fixture(t);
  const id = f.notify();
  await f.queue.drainPushQueue(f.d1, "scheduled");
  const status = await f.queue.getPushQueueStatus(f.d1);
  assert.equal(status.schedulerHealthy, true);
  assert.equal(status.counts.ACEITO, 1);
  assert.doesNotMatch(JSON.stringify(status), /session-queue|fcm.googleapis|secreta|secreto|vinculo|p256dh|usuario_id/);
  f.database.exec("UPDATE notificacoes_push_fila SET atualizado_em = datetime('now','-8 days')");
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.rows().length, 0);
  assert.ok(f.database.prepare("SELECT id FROM notificacoes_sistema WHERE id = ?").get(id));
  f.notify(); f.sender(async () => new Response(null, { status: 410 }));
  await f.queue.drainPushQueue(f.d1);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM notificacoes_push_dispositivos").get().n, 0);
});

test("fila push: agendamento registra heartbeat mesmo sem VAPID e retoma trabalho persistido depois", async t => {
  const f = await fixture(t);
  f.notify(); f.configured(false);
  await f.queue.drainPushQueue(f.d1, "scheduled");
  assert.equal(f.calls.length, 0);
  assert.ok((await f.queue.getPushQueueStatus(f.d1)).lastScheduledAt);
  f.configured(true);
  f.queue.scheduleWebPushDelivery(f.d1);
  await Promise.all(f.jobs);
  assert.equal(f.calls.length, 1);
  assert.equal(f.rows()[0].estado, "ACEITO");
});

test("diagnóstico push: endpoint somente leitura exige sessão ativa de proprietário", async t => {
  const f = await fixture(t);
  let user = null;
  const route = await moduleAt("app/api/proprietario/notificacoes/route.ts", {
    "../../../../db": { getD1: () => f.d1 }, "../../../lib/local-auth": { getSessionUser: async () => user },
    "../../../lib/push-delivery-queue": f.queue,
  });
  assert.equal((await route.GET()).status, 401);
  user = { ativo: true, system_owner: false };
  assert.equal((await route.GET()).status, 403);
  user.system_owner = true;
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).counts.PENDENTE, 0);
  assert.deepEqual(Object.keys(route), ["GET"]);
  assert.equal(f.calls.length, 0);
});

test("diagnóstico push: polling suspende oculto/offline, aborta consulta e ignora resposta atrasada", async () => {
  const handlers = {}, states = [], timers = new Map();
  let effect, cleanup, request, nextTimer = 0, calls = 0;
  const doc = { visibilityState: "hidden", addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {} };
  const nav = { onLine: true };
  const component = await moduleAt("app/components/OwnerPushDelivery.tsx", {
    react: { useState: value => [value, value => states.push(value)], useEffect: fn => { effect = fn; } },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
  }, { AbortController, document: doc, navigator: nav,
    window: { addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {} },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id),
    fetch: (_url, options) => { calls++; return new Promise(resolve => { request = { resolve, signal: options.signal }; }); },
  });
  component.default(); cleanup = effect();
  assert.equal(calls, 0);
  doc.visibilityState = "visible"; handlers.visibilitychange();
  assert.equal(calls, 1);
  doc.visibilityState = "hidden"; handlers.visibilitychange();
  assert.equal(request.signal.aborted, true);
  request.resolve(Response.json({ stale: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.some(s => s?.stale), false);
  doc.visibilityState = "visible"; nav.onLine = false; handlers.offline();
  assert.equal(calls, 1);
  nav.onLine = true; handlers.online();
  assert.equal(calls, 2);
  cleanup();
  assert.equal(request.signal.aborted, true);
  request.resolve(Response.json({ stale: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 0);
});
