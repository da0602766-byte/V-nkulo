import { cpfLoginRequest } from './helpers/cpf-login.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/proprietario/integracoes/supabase/tenant-catalog";
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

test("catálogo Supabase compara, sincroniza e audita somente metadados de comunidades", async () => {
  const { database, d1 } = await createPilotD1();
  database.exec("UPDATE comunidades SET status = 'ARQUIVADA' WHERE id = 2");
  await createPilotUser(database, { nome: "Proprietário", email: "owner.catalog@example.test", senha: "Owner123", memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Membro", email: "member.catalog@example.test", senha: "Member123", memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const worker = (await import(new URL(`../dist/server/index.js?tenant-catalog-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-teste-catalogo", SYSTEM_OWNER_EMAIL: "owner.catalog@example.test", SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ownerCookie = await login(worker, runtime, "owner.catalog@example.test", "Owner123");
  const memberCookie = await login(worker, runtime, "member.catalog@example.test", "Member123");
  assert.equal((await worker.fetch(new Request(endpoint), runtime, context)).status, 401);
  assert.equal((await worker.fetch(new Request(endpoint, { headers: { cookie: memberCookie } }), runtime, context)).status, 403);

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
    if (url.endsWith("/rpc/vinkulo_tenant_catalog_snapshot")) return Response.json(destination);
    if (url.endsWith("/rpc/vinkulo_sync_tenant_catalog")) {
      importedPayload = JSON.parse(init.body);
      const before = new Map(destination.map(item => [item.legacy_d1_id, item]));
      destination = importedPayload.payload.map(item => ({ ...item }));
      const inserted = destination.filter(item => !before.has(item.legacy_d1_id)).length;
      return Response.json([{
        run_id: "00000000-0000-4000-8000-000000000001", source_count: destination.length,
        inserted_count: inserted, updated_count: 0, unchanged_count: destination.length - inserted,
      }]);
    }
    throw new Error(`Rota Supabase inesperada: ${url}`);
  };
  try {
    const previewResponse = await worker.fetch(new Request(endpoint, { headers: { cookie: ownerCookie } }), runtime, context);
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()).preview;
    assert.ok(preview.sourceCount >= 2);
    assert.equal(preview.destinationCount, 0);
    assert.equal(preview.sourceByStatus.ARQUIVADA, 1);

    const unconfirmed = await worker.fetch(new Request(endpoint, {
      method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify({ sourceCount: preview.sourceCount }),
    }), runtime, context);
    assert.equal(unconfirmed.status, 400);
    const stale = await worker.fetch(new Request(endpoint, {
      method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify({ confirm: "SINCRONIZAR_COMUNIDADES", sourceCount: preview.sourceCount + 1 }),
    }), runtime, context);
    assert.equal(stale.status, 409);

    const request = () => new Request(endpoint, {
      method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify({ confirm: "SINCRONIZAR_COMUNIDADES", sourceCount: preview.sourceCount }),
    });
    const first = await worker.fetch(request(), runtime, context);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.preview.ready, true);
    assert.equal(firstBody.run.inserted_count, preview.sourceCount);
    assert.deepEqual(Object.keys(importedPayload.payload[0]).sort(), ["created_at", "is_demo", "legacy_d1_id", "name", "slug", "status"]);
    assert.equal(importedPayload.payload.find(item => item.legacy_d1_id === 2).status, "ARQUIVADA");
    assert.equal(JSON.stringify(firstBody).includes(configuration.serviceRoleKey), false);

    const second = await worker.fetch(request(), runtime, context);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).run.inserted_count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento = 'INTEGRACAO_SUPABASE_TENANTS_SINCRONIZADOS' AND resultado = 'SUCESSO'").get().total, 2);
  } finally {
    globalThis.fetch = nativeFetch;
    database.close();
  }
});
