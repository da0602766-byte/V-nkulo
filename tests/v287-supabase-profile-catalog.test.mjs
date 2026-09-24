import { cpfLoginRequest } from './helpers/cpf-login.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/proprietario/integracoes/supabase/profile-catalog";
const integrationEndpoint = "http://localhost/api/proprietario/integracoes/supabase";
const configuration = {
  confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
  projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public",
  bucket: "", ativa: true,
};

async function login(worker, runtime, email, password) {
  const response = await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email, senha: password }),
  })), runtime, context);
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  return values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
}

test("perfis Supabase são copiados por lista branca, sem credenciais e com proteção de proprietário", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, { nome: "Proprietário", email: "owner.profiles@example.test", senha: "Owner123", memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Membro", email: "member.profiles@example.test", senha: "Member123", memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  database.exec("UPDATE usuarios SET ativo = 0 WHERE email = 'member.profiles@example.test'");
  const worker = (await import(new URL(`../dist/server/index.js?profile-catalog-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-teste-perfis", SYSTEM_OWNER_EMAIL: "owner.profiles@example.test", SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ownerCookie = await login(worker, runtime, "owner.profiles@example.test", "Owner123");
  assert.equal((await worker.fetch(new Request(endpoint), runtime, context)).status, 401);
  const saved = await worker.fetch(new Request(integrationEndpoint, {
    method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context);
  assert.equal(saved.status, 200);

  let destination = [];
  let importedPayload = null;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (request, init = {}) => {
    const url = String(request);
    if (url.endsWith("/rpc/vinkulo_tenant_foundation_health")) return Response.json([
      { table_key: "tenants", present: true, rls_enabled: true },
      { table_key: "profiles", present: true, rls_enabled: true },
      { table_key: "memberships", present: true, rls_enabled: true },
      { table_key: "migrationRuns", present: true, rls_enabled: true },
    ]);
    if (url.endsWith("/rpc/vinkulo_profile_snapshot")) return Response.json(destination);
    if (url.endsWith("/rpc/vinkulo_sync_profiles")) {
      importedPayload = JSON.parse(init.body);
      const before = new Map(destination.map(item => [item.legacy_d1_id, item]));
      destination = importedPayload.payload.map(item => ({ ...item }));
      const inserted = destination.filter(item => !before.has(item.legacy_d1_id)).length;
      return Response.json([{ run_id: "00000000-0000-4000-8000-000000000002", source_count: destination.length,
        inserted_count: inserted, updated_count: 0, unchanged_count: destination.length - inserted }]);
    }
    throw new Error(`RPC inesperada: ${url}`);
  };
  try {
    const initial = await worker.fetch(new Request(endpoint, { headers: { cookie: ownerCookie } }), runtime, context);
    assert.equal(initial.status, 200);
    const preview = (await initial.json()).preview;
    assert.ok(preview.sourceCount >= 2);
    assert.equal(preview.destinationCount, 0);
    assert.ok(preview.activeCount < preview.sourceCount);
    const request = count => new Request(endpoint, { method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirm: "SINCRONIZAR_PERFIS", sourceCount: count }) });
    assert.equal((await worker.fetch(request(preview.sourceCount + 1), runtime, context)).status, 409);
    const first = await worker.fetch(request(preview.sourceCount), runtime, context);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).preview.ready, true);
    assert.deepEqual(Object.keys(importedPayload.payload[0]).sort(), ["active", "created_at", "display_name", "email", "legacy_d1_id"]);
    assert.equal(importedPayload.payload.find(item => item.email === "member.profiles@example.test").active, false);
    assert.equal(JSON.stringify(importedPayload).includes("Owner123"), false);
    const second = await worker.fetch(request(preview.sourceCount), runtime, context);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).run.inserted_count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento = 'INTEGRACAO_SUPABASE_PROFILES_SINCRONIZADOS' AND resultado = 'SUCESSO'").get().total, 2);
  } finally { globalThis.fetch = nativeFetch; database.close(); }
});
