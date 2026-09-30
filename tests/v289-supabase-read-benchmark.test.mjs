import { cpfLoginRequest } from './helpers/cpf-login.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/proprietario/integracoes/supabase/read-benchmark";
const configuration = {
  confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
  projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public",
  bucket: "", ativa: true,
};
const iso = value => new Date(`${value.replace(" ", "T")}Z`).toISOString();

async function login(worker, runtime, email, password) {
  const response = await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email, senha: password }),
  })), runtime, context);
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  return values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
}

test("comparação de leitura é exclusiva do proprietário e não devolve vínculos pessoais", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, { nome: "Proprietário", email: "owner.read@example.test", senha: "Owner123", memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Membro", email: "member.read@example.test", senha: "Member123", memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const worker = (await import(new URL(`../dist/server/index.js?read-benchmark-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-teste-leitura", SYSTEM_OWNER_EMAIL: "owner.read@example.test", SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ownerCookie = await login(worker, runtime, "owner.read@example.test", "Owner123");
  const memberCookie = await login(worker, runtime, "member.read@example.test", "Member123");
  const request = cookie => new Request(endpoint, { method: "POST", headers: cookie ? { cookie } : {} });
  assert.equal((await worker.fetch(request(), runtime, context)).status, 401);
  assert.equal((await worker.fetch(request(memberCookie), runtime, context)).status, 403);
  assert.equal((await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
    method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context)).status, 200);

  const profiles = database.prepare("SELECT id, nome, email, ativo, criado_em FROM usuarios").all().map(row => ({
    legacy_d1_id: row.id, display_name: row.nome, email: row.email, active: Boolean(row.ativo), created_at: iso(row.criado_em),
  }));
  const tenants = database.prepare("SELECT id, slug, nome, status, ambiente_demo, criado_em FROM comunidades").all().map(row => ({
    legacy_d1_id: row.id, slug: row.slug, name: row.nome, status: row.status, is_demo: Boolean(row.ambiente_demo), created_at: iso(row.criado_em),
  }));
  const memberships = database.prepare("SELECT id, usuario_id, comunidade_id, papel, status, criado_em FROM usuario_comunidades").all().map(row => ({
    legacy_d1_id: row.id, legacy_user_id: row.usuario_id, legacy_tenant_id: row.comunidade_id,
    role: row.papel, status: row.status, created_at: iso(row.criado_em),
  }));
  let remoteMemberships = memberships;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async request => {
    const url = String(request);
    if (url.endsWith("/rpc/vinkulo_tenant_foundation_health")) return Response.json([
      { table_key: "tenants", present: true, rls_enabled: true },
      { table_key: "profiles", present: true, rls_enabled: true },
      { table_key: "memberships", present: true, rls_enabled: true },
      { table_key: "migrationRuns", present: true, rls_enabled: true },
    ]);
    if (url.endsWith("/rpc/vinkulo_profile_snapshot")) return Response.json(profiles);
    if (url.endsWith("/rpc/vinkulo_tenant_catalog_snapshot")) return Response.json(tenants);
    if (url.endsWith("/rpc/vinkulo_membership_snapshot")) return Response.json(remoteMemberships);
    throw new Error(`RPC inesperada: ${url}`);
  };
  try {
    const response = await worker.fetch(request(ownerCookie), runtime, context);
    assert.equal(response.status, 200);
    const result = (await response.json()).result;
    assert.equal(result.matching, true);
    assert.equal(result.sourceCount, memberships.length);
    assert.equal(result.destinationCount, memberships.length);
    assert.equal(result.samples.length, 3);
    assert.ok(result.d1MedianMs >= 0 && result.supabaseMedianMs >= 0);
    assert.equal(JSON.stringify(result).includes("@example.test"), false);
    assert.equal(JSON.stringify(result).includes("MEMBRO"), false);

    remoteMemberships = memberships.map((item, index) => index === 0 ? { ...item, status: "REMOVIDO" } : item);
    const mismatch = (await (await worker.fetch(request(ownerCookie), runtime, context)).json()).result;
    assert.equal(mismatch.matching, false);
    assert.equal(mismatch.samples.length, 1);
    assert.equal(mismatch.recommendation, "KEEP_D1");
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento = 'INTEGRACAO_SUPABASE_LEITURA_COMPARADA' AND resultado = 'SUCESSO'").get().total, 2);
  } finally { globalThis.fetch = nativeFetch; database.close(); }
});

test("consultas independentes do contexto de acesso rodam juntas sem mudar a ordem das permissões", async () => {
  const source = await readFile(new URL("../app/lib/tenant.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("export async function getActiveTenantContext"), source.indexOf("async function getCommunityModules"));
  assert.match(block, /Promise\.all\(\[\s*getDiaconiaPermissions[\s\S]*getNetworkPermissions[\s\S]*getActiveParkingAssignment[\s\S]*getParkingLeaderPermissions/);
  assert.match(block, /for \(const permission of diaconiaPermissions\)[\s\S]*for \(const permission of networkPermissions\)[\s\S]*if \(parkingAssignment\)[\s\S]*for \(const permission of parkingLeaderPermissions\)/);
  assert.match(block, /const \[subscription, configuredModules\] = await Promise\.all\(\[\s*getSubscription\(membership\.comunidadeId\),\s*getCommunityModules\(membership\.comunidadeId\)/);
  assert.match(block, /filterPlanPermissions/);
});
