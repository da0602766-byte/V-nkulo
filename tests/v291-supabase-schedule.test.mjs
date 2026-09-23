import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const ownerEmail = "owner.schedule@example.test";
const scheduleEndpoint = "http://localhost/api/proprietario/integracoes/supabase/schedule";
const webhookEndpoint = "http://localhost/api/system/supabase-sync";

async function login(worker, runtime, context, email, password) {
  const response = await worker.fetch(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email, senha: password }),
  }), runtime, context);
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  return values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
}

test("agendamento exige proprietário, não revela token e webhook rejeita chamadas sem autorização", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, { nome: "Proprietário", email: ownerEmail, senha: "Owner123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Membro", email: "member.schedule@example.test", senha: "Member123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
  const worker = (await import(new URL(`../dist/server/index.js?schedule-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-longo-para-agendamento", SYSTEM_OWNER_EMAIL: ownerEmail,
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ownerCookie = await login(worker, runtime, context, ownerEmail, "Owner123");
  const memberCookie = await login(worker, runtime, context, "member.schedule@example.test", "Member123");
  await Promise.all(tasks.splice(0));
  const call = (url, options = {}) => worker.fetch(new Request(url, options), runtime, context);
  const install = cookie => call(scheduleEndpoint, { method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ confirm: true }) });
  assert.equal((await install("")).status, 401);
  assert.equal((await install(memberCookie)).status, 403);
  assert.equal((await install(ownerCookie)).status, 409);
  assert.equal((await call(webhookEndpoint, { method: "POST" })).status, 401);
  assert.equal((await call(webhookEndpoint, { method: "POST", headers: { authorization: "Bearer " + "a".repeat(64) } })).status, 401);
  assert.equal(database.prepare("SELECT ultimo_agendamento_em FROM notificacoes_push_controle WHERE id = 1").get().ultimo_agendamento_em, null);

  const configuration = { confirm: true, ambiente: "PRODUCAO", url: "https://erdyearvkahtwdmpcvgc.supabase.co",
    projectRef: "erdyearvkahtwdmpcvgc", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public", bucket: "", ativa: true };
  assert.equal((await call("http://localhost/api/proprietario/integracoes/supabase", { method: "PATCH",
    headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration) })).status, 200);
  database.prepare("INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em) VALUES ('supabase_auto_sync', ?, 'sistema', CURRENT_TIMESTAMP)")
    .run(JSON.stringify({ enabled: true, running: false, lastAttemptAt: null, lastSuccessAt: null, nextRunAt: null,
      lastError: null, lastResult: null, lockUntil: null, lockToken: null, lastAlertAt: null }));
  const nativeFetch = globalThis.fetch;
  let submittedToken = "";
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(url), /\/rpc\/vinkulo_install_sync_schedule$/);
    submittedToken = JSON.parse(init.body).webhook_secret;
    assert.match(submittedToken, /^[a-f0-9]{64}$/);
    assert.equal(String(init.headers.Authorization).includes(submittedToken), false);
    return Response.json(42);
  };
  try {
    const response = await install(ownerCookie);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status.jobId, 42);
    assert.equal(JSON.stringify(body).includes(submittedToken), false);
    assert.equal((await (await call(scheduleEndpoint, { headers: { cookie: ownerCookie } })).json()).status.jobId, 42);
    assert.equal((await call(webhookEndpoint, { method: "POST", headers: { authorization: "Bearer " + "a".repeat(64) } })).status, 401);
    const webhook = await call(webhookEndpoint, { method: "POST", headers: { authorization: `Bearer ${submittedToken}` } });
    assert.equal(webhook.status, 503); // catálogo remoto indisponível no teste
    assert.ok(database.prepare("SELECT ultimo_agendamento_em FROM notificacoes_push_controle WHERE id = 1").get().ultimo_agendamento_em, "fila recebe o agendamento mesmo quando a sincronização falha");
    assert.ok((await (await call(scheduleEndpoint, { headers: { cookie: ownerCookie } })).json()).status.lastHeartbeatAt);
  } finally { globalThis.fetch = nativeFetch; await Promise.all(tasks.splice(0)); database.close(); }
});

test("migração armazena a credencial no Vault e cron nunca persiste o segredo em texto", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0006_scheduled_sync.sql", import.meta.url), "utf8");
  assert.match(sql, /vault\.create_secret/);
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.match(sql, /cron\.schedule/);
  assert.match(sql, /revoke all on function public\.vinkulo_install_sync_schedule\(text\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /sb_secret_/);
});
