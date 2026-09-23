import assert from "node:assert/strict";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/proprietario/integracoes/supabase/membership-catalog";
const integrationEndpoint = "http://localhost/api/proprietario/integracoes/supabase";
const configuration = {
  confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
  projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public",
  bucket: "", ativa: true,
};

async function login(worker, runtime, email, password) {
  const response = await worker.fetch(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email, senha: password }),
  }), runtime, context);
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  return values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
}

const iso = value => new Date(`${value.replace(" ", "T")}Z`).toISOString();

test("vínculos Supabase preservam papéis e remoções sem expor perfis ou ampliar acesso", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, { nome: "Proprietário", email: "owner.memberships@example.test", senha: "Owner123", memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Membro", email: "member.memberships@example.test", senha: "Member123", memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const worker = (await import(new URL(`../dist/server/index.js?membership-catalog-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-teste-vinculos", SYSTEM_OWNER_EMAIL: "owner.memberships@example.test", SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ownerCookie = await login(worker, runtime, "owner.memberships@example.test", "Owner123");
  const memberCookie = await login(worker, runtime, "member.memberships@example.test", "Member123");
  database.exec("UPDATE usuario_comunidades SET status = 'REMOVIDO' WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'member.memberships@example.test')");
  assert.equal((await worker.fetch(new Request(endpoint), runtime, context)).status, 401);
  assert.equal((await worker.fetch(new Request(endpoint, { headers: { cookie: memberCookie } }), runtime, context)).status, 403);
  const saved = await worker.fetch(new Request(integrationEndpoint, {
    method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context);
  assert.equal(saved.status, 200);

  const profiles = database.prepare("SELECT id, nome, email, ativo, criado_em FROM usuarios").all().map(row => ({
    legacy_d1_id: row.id, display_name: row.nome, email: row.email, active: Boolean(row.ativo), created_at: iso(row.criado_em),
  }));
  const tenants = database.prepare("SELECT id, slug, nome, status, ambiente_demo, criado_em FROM comunidades").all().map(row => ({
    legacy_d1_id: row.id, slug: row.slug, name: row.nome, status: row.status, is_demo: Boolean(row.ambiente_demo), created_at: iso(row.criado_em),
  }));
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
    if (url.endsWith("/rpc/vinkulo_profile_snapshot")) return Response.json(profiles);
    if (url.endsWith("/rpc/vinkulo_tenant_catalog_snapshot")) return Response.json(tenants);
    if (url.endsWith("/rpc/vinkulo_membership_snapshot")) return Response.json(destination);
    if (url.endsWith("/rpc/vinkulo_sync_memberships")) {
      importedPayload = JSON.parse(init.body);
      const before = new Map(destination.map(item => [item.legacy_d1_id, item]));
      destination = importedPayload.payload.map(item => ({ ...item }));
      const inserted = destination.filter(item => !before.has(item.legacy_d1_id)).length;
      return Response.json([{ run_id: "00000000-0000-4000-8000-000000000003", source_count: destination.length,
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
    assert.equal(preview.removedCount, 1);
    const request = count => new Request(endpoint, { method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirm: "SINCRONIZAR_VINCULOS", sourceCount: count }) });
    assert.equal((await worker.fetch(request(preview.sourceCount + 1), runtime, context)).status, 409);
    const first = await worker.fetch(request(preview.sourceCount), runtime, context);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).preview.ready, true);
    assert.deepEqual(Object.keys(importedPayload.payload[0]).sort(), ["created_at", "legacy_d1_id", "legacy_tenant_id", "legacy_user_id", "role", "status"]);
    assert.equal(importedPayload.payload.find(item => item.status === "REMOVIDO")?.role, "MEMBRO");
    assert.equal(JSON.stringify(importedPayload).includes("@example.test"), false);
    const second = await worker.fetch(request(preview.sourceCount), runtime, context);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).run.inserted_count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento = 'INTEGRACAO_SUPABASE_MEMBERSHIPS_SINCRONIZADOS' AND resultado = 'SUCESSO'").get().total, 2);
  } finally { globalThis.fetch = nativeFetch; database.close(); }
});
