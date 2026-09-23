import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

async function load(path, dependencies, globals = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: key => { assert.ok(key in dependencies, key); return dependencies[key]; },
    crypto, Request, Response, URL, URLSearchParams, AbortSignal, TextEncoder, TextDecoder, Uint8Array, atob, btoa, Date, ...globals });
  return exports;
}
const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----\n`;
const credential = { type: "service_account", project_id: "vinkulo-256e8", client_email: "test@vinkulo-256e8.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" };
async function fixture(t) {
  const { database, d1 } = await createPilotD1(); t.after(() => database.close());
  const userId = await createPilotUser(database, { nome: "FCM Test", email: "fcm@example.test", senha: "Ficticia123" });
  let user = { id: userId, ativo: true, system_owner: true }, session = "firebase-session";
  database.prepare("INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,?,datetime('now','+1 day'))").run(userId, session);
  let authSecret = "test-only-encryption-key-not-used-in-production", sendStatus = 200, providerError = null;
  const calls = [], audit = [], notifications = [];
  const integration = await load("app/lib/firebase-integration.ts", { "../../db": { getD1: () => d1 }, "../../db/runtime-env": { getRuntimeEnv: () => ({ AUTH_SECRET: authSecret }) } }, {
    fetch: async (url, options) => {
      calls.push({ url, options }); assert.equal(options.redirect, "error");
      if (url === "https://oauth2.googleapis.com/token") {
        const jwt = options.body.get("assertion"); const [header, claims, signature] = jwt.split(".");
        assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, Buffer.from(signature,"base64url"), new TextEncoder().encode(`${header}.${claims}`)));
        const decoded = JSON.parse(Buffer.from(claims, "base64url").toString());
        assert.equal(decoded.aud, url); assert.equal(decoded.scope, "https://www.googleapis.com/auth/firebase.messaging");
        return Response.json({ access_token: "fake-access-token", expires_in: 3600 });
      }
      assert.equal(url, "https://fcm.googleapis.com/v1/projects/vinkulo-256e8/messages:send");
      return Response.json(providerError || {}, { status: sendStatus });
    },
  });
  const auth = { getSessionUser: async () => user, getCurrentSessionTokenHash: async () => session };
  const route = await load("app/api/proprietario/integracoes/firebase/route.ts", {
    "../../../../../db": { getD1: () => d1 }, "../../../../lib/local-auth": auth, "../../../../lib/firebase-integration": integration,
    "../../../../lib/tenant-audit": { recordTenantAudit: async (...args) => audit.push(args.slice(1)) },
    "../../../../lib/system-notifications": { createSystemNotification: async (db, input) => notifications.push(input) },
  });
  const native = await load("app/api/push-native/route.ts", { "../../../db": { getD1: () => d1 }, "../../lib/local-auth": auth, "../../lib/firebase-integration": integration });
  return { database, d1, userId, integration, route, native, calls, audit, notifications,
    user: value => { user = value; }, session: value => { session = value; }, secret: value => { authSecret = value; },
    provider: (status, error) => { sendStatus = status; providerError = error; } };
}
const request = (method, payload, origin = "https://vinkulo.test") => new Request("https://vinkulo.test/api/proprietario/integracoes/firebase", { method, headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(payload) });

test("Firebase: valida projeto/tipo/tamanho e cifra a chave sem devolvê-la na API", async t => {
  const f = await fixture(t);
  for (const raw of ["invalid", "x".repeat(16385), JSON.stringify({ client: [] }), JSON.stringify({ ...credential, project_id: "outro" }), JSON.stringify({ ...credential, token_uri: "https://evil.test" })]) {
    await assert.rejects(f.integration.prepareFirebaseCredential(raw));
  }
  const response = await f.route.PATCH(request("PATCH", { credential: JSON.stringify(credential), confirm: true }));
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.configured, true);
  const stored = f.database.prepare("SELECT valor FROM configuracoes WHERE chave='firebase_fcm_integration'").get().valor;
  assert.doesNotMatch(stored, /BEGIN PRIVATE KEY|private_key|fake-access-token/);
  assert.doesNotMatch(JSON.stringify(result), /ciphertext|private_key|fake-access-token|"iv"/);
  assert.doesNotMatch(JSON.stringify(f.audit), /private_key|BEGIN PRIVATE KEY|ciphertext|fake-access-token/);
  assert.ok(f.calls.some(c => JSON.parse(c.options.body instanceof URLSearchParams ? "{}" : c.options.body).validate_only === true));
  assert.equal(f.notifications.length, 0, "validação não envia notificação real");
  f.secret("outro-segredo");
  const config = await f.integration.readFirebaseConfig();
  await assert.rejects(f.integration.verifyFirebaseConfig({ ...config, id: crypto.randomUUID() }));
});

test("Firebase: acesso exclusivo, CSRF, confirmação e limite do corpo", async t => {
  const f = await fixture(t);
  f.user(null); assert.equal((await f.route.GET()).status, 401);
  f.user({ id: f.userId, ativo: true, system_owner: false }); assert.equal((await f.route.GET()).status, 403);
  f.user({ id: f.userId, ativo: true, system_owner: true });
  assert.equal((await f.route.PATCH(request("PATCH", {}, "https://evil.test"))).status, 403);
  assert.equal((await f.route.PATCH(request("PATCH", { credential: JSON.stringify(credential) }))).status, 400);
  assert.equal((await f.route.PATCH(request("PATCH", { credential: "x".repeat(30000), confirm: true }))).status, 400);
  assert.equal(f.calls.length, 0); assert.equal((await f.route.GET()).headers.get("Cache-Control"), "no-store");
});

test("Firebase: credencial recusada não substitui a anterior nem revela erro do provedor", async t => {
  const f = await fixture(t);
  assert.equal((await f.route.PATCH(request("PATCH", { credential: JSON.stringify(credential), confirm: true }))).status, 200);
  const old = await f.integration.readFirebaseConfig();
  f.provider(403, { error: { message: "secret-private-provider-error" } });
  const response = await f.route.PATCH(request("PATCH", { credential: JSON.stringify(credential), confirm: true }));
  assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /secret-private/);
  assert.equal((await f.integration.readFirebaseConfig()).id, old.id);
});

test("FCM: envia dados mínimos, usa cache OAuth e só UNREGISTERED invalida token", async t => {
  const f = await fixture(t), config = await f.integration.prepareFirebaseCredential(JSON.stringify(credential));
  const data = { tag: "vinkulo-notification-1", notificationId: 1, bindingId: crypto.randomUUID(), url: "/painel" };
  await Promise.all([f.integration.sendFcm(config, "fcm:token-with-20-characters", data, 90000), f.integration.sendFcm(config, "fcm:token-with-20-characters", data, 100)]);
  assert.equal(f.calls.filter(c => c.url.includes("oauth2")).length, 1);
  const sent = JSON.parse(f.calls.find(c => c.url.includes("messages:send")).options.body);
  assert.equal(sent.message.android.ttl, "86400s"); assert.equal(sent.message.notification, undefined);
  assert.equal(sent.message.data.bindingId, data.bindingId); assert.equal(sent.message.data.notificationId, "1");
  f.provider(404, { error: { message: "missing project" } });
  assert.equal((await f.integration.sendFcm(config, "fcm:token-with-20-characters", data, 100)).status, 503);
  f.provider(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } });
  assert.equal((await f.integration.sendFcm(config, "fcm:token-with-20-characters", data, 100)).status, 410);
});

test("FCM nativo: registra sessão, preserva vínculo, renova token e cancela após logout", async t => {
  const f = await fixture(t);
  const payload = { token: "first-token-with-enough-characters", permission: true, projectId: "vinkulo-256e8" };
  const first = await (await f.native.POST(request("POST", payload))).json();
  assert.equal(first.registered, true); assert.equal(first.configured, false);
  assert.equal((await (await f.native.POST(request("POST", payload))).json()).bindingId, first.bindingId);
  const changed = await (await f.native.POST(request("POST", { ...payload, token: "second-token-with-enough-characters" }))).json();
  assert.notEqual(changed.bindingId, first.bindingId);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM notificacoes_push_dispositivos").get().n, 1);
  f.database.prepare("DELETE FROM sessoes WHERE token_hash='firebase-session'").run();
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM notificacoes_push_dispositivos").get().n, 0);
  assert.equal((await f.native.POST(request("POST", payload))).status, 401);
});

test("FCM nativo: recusa projeto e origem incorretos; teste limita destino ao proprietário", async t => {
  const f = await fixture(t);
  const payload = { token: "token-with-enough-characters", permission: true, projectId: "vinkulo-256e8" };
  assert.equal((await f.native.POST(request("POST", { ...payload, projectId: "errado" }))).status, 400);
  assert.equal((await f.native.POST(request("POST", payload, "https://evil.test"))).status, 403);
  await f.route.PATCH(request("PATCH", { credential: JSON.stringify(credential), confirm: true }));
  assert.equal((await f.route.POST(request("POST", { action: "test-device" }))).status, 400);
  await f.native.POST(request("POST", payload));
  assert.equal((await f.route.POST(request("POST", { action: "test-device", usuarioId: 9999 }))).status, 200);
  assert.equal(f.notifications[0].usuarioId, f.userId);
  await f.native.POST(request("POST", { ...payload, permission: false }));
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM notificacoes_push_dispositivos").get().n, 0);
  assert.equal((await f.route.DELETE(request("DELETE", { confirm: "REMOVER_FIREBASE" }))).status, 200);
  assert.equal(await f.integration.readFirebaseConfig(), null);
});
