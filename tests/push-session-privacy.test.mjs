import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const base = "https://vinkulo.example.test";
const context = { waitUntil() {}, passThroughOnException() {} };

async function fixture() {
  const { database, d1 } = await createPilotD1();
  const userId = await createPilotUser(database, { nome: "Conta A", email: "a@push.test", senha: "Push12345" });
  const otherId = await createPilotUser(database, { nome: "Conta B", email: "b@push.test", senha: "Push12345" });
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const env = {
    DB: d1, AUTH_SECRET: "push-session-test-secret",
    VAPID_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("base64url"),
    VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey("jwk", keys.privateKey)),
    VAPID_SUBJECT: "mailto:test@example.test",
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  };
  const worker = (await import(`../dist/server/index.js?push-session=${crypto.randomUUID()}`)).default;
  async function request(path, cookie = "", method = "GET", body, extra = {}) {
    return worker.fetch(new Request(`${base}${path}`, {
      method, headers: { cookie, "content-type": "application/json", ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, context);
  }
  async function login(email = "a@push.test", previous = "") {
    const response = await request("/api/auth/login", previous, "POST", { email, senha: "Push12345" });
    assert.equal(response.status, 200, await response.clone().text());
    const cookie = response.headers.getSetCookie().map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
    assert.ok(cookie);
    return cookie;
  }
  const subscription = endpoint => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${endpoint}`, expirationTime: null,
    keys: { p256dh: env.VAPID_PUBLIC_KEY, auth: Buffer.alloc(16, 9).toString("base64url") } });
  const save = (cookie, sub, refreshOnly = false) => request("/api/push-subscriptions", cookie, "POST", { ...sub, refreshOnly });
  const state = (cookie, sub) => request("/api/push-subscriptions", cookie, "GET", undefined,
    sub ? { "x-vinkulo-push-endpoint": sub.endpoint } : {});
  return { database, d1, env, userId, otherId, request, login, subscription, save, state };
}

test("push: logout revoga somente o aparelho da sessão e preserva os outros", async () => {
  const f = await fixture();
  try {
    const first = await f.login();
    const second = await f.login();
    const a = f.subscription("aparelho-a"), b = f.subscription("aparelho-b");
    assert.equal((await f.save(first, a)).status, 200);
    assert.equal((await f.save(second, b)).status, 200);
    assert.equal((await (await f.state(first, a)).json()).enabled, true);
    assert.equal((await (await f.state(first)).json()).enabled, false, "não confunde qualquer aparelho com o atual");
    assert.equal((await f.request("/api/auth/logout", first)).status, 307);
    assert.equal(f.database.prepare("SELECT count(*) AS n FROM notificacoes_push_dispositivos WHERE endpoint = ?").get(a.endpoint).n, 0);
    assert.equal((await (await f.state(second, b)).json()).enabled, true);
    assert.equal((await f.state(first, a)).status, 401);
  } finally { f.database.close(); }
});

test("push: troca direta de conta invalida a sessão anterior sem assumir consentimento", async () => {
  const f = await fixture();
  try {
    const old = await f.login();
    const sub = f.subscription("compartilhado");
    await f.save(old, sub);
    const next = await f.login("b@push.test", old);
    assert.equal((await f.state(old, sub)).status, 401);
    assert.equal((await (await f.state(next, sub)).json()).enabled, false);
    assert.equal((await f.save(next, sub, true)).status, 409);
    assert.equal((await f.save(next, sub)).status, 200, "reativação explícita da nova conta");
    assert.equal(f.database.prepare("SELECT usuario_id FROM notificacoes_push_dispositivos WHERE endpoint = ?").get(sub.endpoint).usuario_id, f.otherId);
  } finally { f.database.close(); }
});

test("push: migração automática exige a mesma conta e o endpoint exato", async () => {
  const f = await fixture();
  try {
    const a = await f.login(), b = await f.login("b@push.test");
    const sub = f.subscription("legado");
    f.database.prepare("INSERT INTO notificacoes_push_dispositivos(usuario_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)")
      .run(f.userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
    assert.equal((await (await f.state(a, sub)).json()).needsRefresh, true);
    assert.equal((await (await f.state(b, sub)).json()).needsRefresh, false);
    assert.equal((await f.save(b, sub, true)).status, 409);
    assert.equal((await f.save(a, sub, true)).status, 200);
    assert.equal((await (await f.state(a, sub)).json()).enabled, true);
    assert.equal((await f.save(a, { ...sub, expirationTime: 1e99 })).status, 400);
  } finally { f.database.close(); }
});

test("push: aviso atrasado exige destinatário, vínculo e sessão atuais", async () => {
  const f = await fixture();
  try {
    const a = await f.login(), b = await f.login("b@push.test");
    const sub = f.subscription("atrasado");
    await f.save(a, sub);
    const binding = f.database.prepare("SELECT vinculo_id FROM notificacoes_push_dispositivos WHERE endpoint = ?").get(sub.endpoint).vinculo_id;
    const notification = f.database.prepare("INSERT INTO notificacoes_sistema (tipo,titulo,mensagem,area,usuario_id,criado_por,destino_rota) VALUES ('INFO','Título reservado','Conteúdo reservado','EVENTOS',?,'teste','/painel?view=eventos')").run(f.userId);
    const path = `/api/push-subscriptions/notification?id=${notification.lastInsertRowid}&binding=${binding}`;
    const response = await f.request(path, a);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.url, "/painel?view=eventos");
    assert.doesNotMatch(JSON.stringify(body), /Título reservado|Conteúdo reservado/);
    assert.equal((await f.request(path, b)).status, 404);
    assert.equal((await f.request(path)).status, 401);
    await f.save(b, sub);
    assert.equal((await f.request(path, a)).status, 404, "vínculo substituído bloqueia push antigo mesmo com outra sessão ainda ativa");
    await f.request("/api/auth/logout", a);
    assert.equal((await f.request(path, a)).status, 401);
  } finally { f.database.close(); }
});

test("push: redefinir senha revoga as sessões e assinaturas anteriores", async () => {
  const f = await fixture();
  try {
    const a = await f.login(), b = await f.login();
    await f.save(a, f.subscription("reset-a"));
    await f.save(b, f.subscription("reset-b"));
    const token = crypto.randomUUID();
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("hex");
    f.database.prepare("INSERT INTO redefinicoes_senha (usuario_id,token_hash,expira_em,usado) VALUES (?,?,datetime('now','+1 hour'),0)").run(f.userId, hash);
    const response = await f.request("/api/auth/redefinir-senha", "", "POST", { token, senha: "NovaSenha12345" });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(f.database.prepare("SELECT count(*) AS n FROM sessoes WHERE usuario_id = ?").get(f.userId).n, 0);
    assert.equal(f.database.prepare("SELECT count(*) AS n FROM notificacoes_push_dispositivos WHERE usuario_id = ?").get(f.userId).n, 0);
  } finally { f.database.close(); }
});

async function loadModule(path, dependencies, globals = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exported = {};
  runInNewContext(outputText, { exports: exported, require: name => {
    assert.ok(name in dependencies, `dependência inesperada: ${name}`);
    return dependencies[name];
  }, crypto, TextEncoder, Uint8Array, URL, URLSearchParams, AbortSignal, atob, btoa, ...globals });
  return exported;
}

test("push: entrega registra aceite e falha, sem enviar conteúdo privado ou sessões revogadas", async () => {
  const f = await fixture();
  try {
    const a = await f.login(), sub = f.subscription("envio");
    await f.save(a, sub);
    const jobs = [], payloads = [];
    let status = 201;
    let replaceBinding = false;
    const nextBinding = crypto.randomUUID();
    f.env.executionContext = { waitUntil: promise => jobs.push(promise) };
    const transport = await loadModule("app/lib/web-push.ts", {
      "../../db/runtime-env": { getRuntimeEnv: () => f.env },
      "./web-push-crypto": {
        encryptWebPushPayload: async payload => { payloads.push(JSON.parse(payload)); return new Uint8Array([1]); },
        createVapidAuthorization: async () => "test-authorization",
      },
    }, { fetch: async () => {
      if (replaceBinding) f.database.prepare("UPDATE notificacoes_push_dispositivos SET vinculo_id = ? WHERE endpoint = ?").run(nextBinding, sub.endpoint);
      return new Response(null, { status });
    } });
    const delivery = await loadModule("app/lib/push-delivery-queue.ts", {
      "./chat-push": { getAuthorizedChatPush: async () => null },
      "./firebase-integration": { readFirebaseConfig: async () => null, nativeToken: () => null },
      "../../db/runtime-env": { getRuntimeEnv: () => f.env }, "./web-push": transport,
    });
    async function send() {
      f.database.prepare("INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,usuario_id,criado_por,destino_rota) VALUES ('INFO','Reservado','Pedido confidencial','EVENTOS',?,'teste','/painel?view=pedidos')").run(f.userId);
      delivery.scheduleWebPushDelivery(f.d1);
      await Promise.all(jobs.splice(0));
    }
    await send();
    assert.equal(payloads.length, 1);
    assert.doesNotMatch(JSON.stringify(payloads), /Reservado|Pedido confidencial|view=pedidos/);
    let row = f.database.prepare("SELECT * FROM notificacoes_push_dispositivos WHERE endpoint = ?").get(sub.endpoint);
    assert.equal(row.ultimo_status, 201);
    assert.ok(row.ultimo_aceite_em);
    status = 429;
    await send();
    row = f.database.prepare("SELECT * FROM notificacoes_push_dispositivos WHERE endpoint = ?").get(sub.endpoint);
    assert.equal(row.ultimo_status, 429);
    assert.equal(row.falhas_consecutivas, 1);
    assert.ok(row.ultimo_aceite_em, "falha não apaga o último aceite");
    status = 410;
    replaceBinding = true;
    await send();
    row = f.database.prepare("SELECT * FROM notificacoes_push_dispositivos WHERE endpoint = ?").get(sub.endpoint);
    assert.equal(row.vinculo_id, nextBinding, "resposta atrasada do provedor não remove o vínculo novo");
    await f.request("/api/auth/logout", a);
    await send();
    assert.equal(payloads.length, 3);
  } finally { f.database.close(); }
});

test("service worker só exibe push autorizado e descarta payload legado ou sem sessão", async () => {
  const listeners = {}, shown = [];
  let status = 200, calls = 0;
  const script = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  runInNewContext(script, {
    URL, URLSearchParams, AbortSignal,
    self: { location: new URL(base), addEventListener: (name, handler) => { listeners[name] = handler; },
      registration: { showNotification: async (title, options) => shown.push({ title, ...options }) } },
    fetch: async () => { calls++; return new Response(JSON.stringify({ title: "Vínkulo", body: "Abra para consultar.", tag: "vinkulo-notification-42", url: "/painel" }), { status }); },
  });
  async function push(payload) {
    const jobs = [];
    listeners.push({ data: { json: () => payload }, waitUntil: job => jobs.push(job) });
    await Promise.all(jobs);
  }
  const payload = { notificationId: 42, bindingId: crypto.randomUUID(), title: "Não confiar no payload", body: "Segredo" };
  await push(payload);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, "Vínkulo");
  assert.equal(shown[0].renotify, false, "retentativa com a mesma tag não deve alertar novamente");
  assert.doesNotMatch(JSON.stringify(shown), /Segredo|Não confiar/);
  status = 401;
  await push(payload);
  assert.equal(shown.length, 1);
  await push({ title: "Legado", body: "Segredo" });
  assert.equal(calls, 2);
  assert.equal(shown.length, 1);
});

test("cliente sem registro de service worker resolve sem esperar indefinidamente", async () => {
  const client = await loadModule("app/lib/web-push-client.ts", {}, {
    window: { PushManager: {}, Notification: {} },
    navigator: { serviceWorker: { getRegistration: async () => undefined } },
  });
  const state = await client.getWebPushSubscriptionState();
  assert.equal(state.supported, true);
  assert.equal(state.subscribed, false);
});

test("sincronização nativa suspende consultas ocultas e cancela a resposta em andamento", async () => {
  let initial, effectCleanup, calls = 0, signal, finish;
  const handlers = {};
  const shown = [];
  const doc = { visibilityState: "hidden", addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {} };
  const component = await loadModule("app/components/NativeNotificationSync.tsx", {
    react: { useEffect: fn => { effectCleanup = fn(); } },
    "next/navigation": { usePathname: () => "/painel" },
    "../lib/androidNativeBridge": { isNativeNotificationBridgeAvailable: () => true },
    "../lib/device-notification-sync": { showUnreadDeviceNotifications: items => shown.push(items) },
  }, {
    AbortController,
    document: doc,
    window: { setTimeout: fn => { initial = fn; return 1; }, setInterval: () => 2, clearTimeout() {}, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    fetch: (_url, options) => { calls++; signal = options.signal; return new Promise(resolve => { finish = resolve; }); },
  });
  component.default();
  initial();
  assert.equal(calls, 0);
  doc.visibilityState = "visible";
  handlers.visibilitychange();
  assert.equal(calls, 1);
  doc.visibilityState = "hidden";
  handlers.visibilitychange();
  assert.equal(signal.aborted, true);
  finish({ ok: true, json: async () => ({ notifications: [{ id: 1 }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shown.length, 0);
  effectCleanup();
});

test("FCM no cliente vincula somente a resposta atual e limpa a sessão sem rede no login", async () => {
  const effects = [], handlers = {}, bound = [];
  let requested = 0, cleared = 0, finish, signal, timer, path = "/painel";
  const bridge = { requestPushToken: () => requested++, setPushBinding: (...args) => bound.push(args), clearPushBinding: () => cleared++ };
  const win = { VinkuloAndroid: bridge, addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener: name => { delete handlers[name]; } };
  const doc = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  const component = await loadModule("app/components/NativeNotificationSync.tsx", {
    react: { useEffect: fn => effects.push(fn) },
    "next/navigation": { usePathname: () => path },
    "../lib/androidNativeBridge": { isNativeNotificationBridgeAvailable: () => false },
    "../lib/device-notification-sync": { showUnreadDeviceNotifications() {} },
  }, {
    AbortController, document: doc, window: win, setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {},
    fetch: (_url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); },
  });
  component.default();
  const cleanup = effects[0](); timer(); assert.equal(requested, 1);
  handlers["vinkulo:fcm-token"]({ detail: { token: "device-token", projectId: "vinkulo-256e8", permission: true } });
  finish(Response.json({ registered: true, configured: true, bindingId: "current-binding" }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(bound, [["device-token", "current-binding"]]); assert.equal(win.VinkuloFcmActive, true);
  handlers["vinkulo:firebase-status"](); assert.equal(requested, 2);
  handlers["vinkulo:fcm-token"]({ detail: { token: "device-token" } });
  cleanup(); assert.equal(signal.aborted, true);
  finish(Response.json({ registered: true, configured: true, bindingId: "stale-binding" }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bound.length, 1, "não reaplica vínculo após desmontar a sessão");
  path = "/login"; effects.length = 0; component.default(); effects[0]();
  assert.equal(cleared, 1); assert.equal(win.VinkuloFcmActive, false); assert.equal(requested, 2);
});
