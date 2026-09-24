import { cpfLoginRequest } from './helpers/cpf-login.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const endpoint = "http://localhost/api/proprietario/integracoes/supabase/auto-sync";
const configuration = { confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
  projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public", bucket: "", ativa: true };
const iso = value => new Date(`${value.replace(" ", "T")}Z`).toISOString();

async function login(worker, runtime, context, email, password) {
  const response = await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email, senha: password }),
  })), runtime, context);
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  return values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
}

test("conciliação automática é exclusiva do proprietário, ordenada, pausável e não envia credenciais", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, { nome: "Proprietário", email: "owner.auto@example.test", senha: "Owner123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Membro", email: "member.auto@example.test", senha: "Member123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
  const worker = (await import(new URL(`../dist/server/index.js?auto-sync-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-sincronizacao", SYSTEM_OWNER_EMAIL: "owner.auto@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ownerCookie = await login(worker, runtime, context, "owner.auto@example.test", "Owner123");
  const memberCookie = await login(worker, runtime, context, "member.auto@example.test", "Member123");
  await Promise.all(tasks.splice(0));
  const call = (action, cookie = ownerCookie) => worker.fetch(new Request(endpoint, {
    method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action }),
  }), runtime, context);
  assert.equal((await worker.fetch(new Request(endpoint), runtime, context)).status, 401);
  assert.equal((await call("ENABLE", memberCookie)).status, 403);
  assert.equal((await worker.fetch(new Request(endpoint, { headers: { cookie: ownerCookie } }), runtime, context)).status, 200);
  assert.equal((await (await worker.fetch(new Request(endpoint, { headers: { cookie: ownerCookie } }), runtime, context)).json()).status.enabled, false);
  assert.equal((await call("ENABLE")).status, 409);
  assert.equal((await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
    method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context)).status, 200);

  const tenants = database.prepare("SELECT id, slug, nome, status, ambiente_demo, criado_em FROM comunidades").all().map(row => ({
    legacy_d1_id: row.id, slug: row.slug, name: row.nome, status: row.status, is_demo: Boolean(row.ambiente_demo), created_at: iso(row.criado_em),
  }));
  const profiles = database.prepare("SELECT id, nome, email, ativo, criado_em FROM usuarios").all().map(row => ({
    legacy_d1_id: row.id, display_name: row.nome, email: row.email, active: Boolean(row.ativo), created_at: iso(row.criado_em),
  }));
  const memberships = database.prepare("SELECT id, usuario_id, comunidade_id, papel, status, criado_em FROM usuario_comunidades").all().map(row => ({
    legacy_d1_id: row.id, legacy_user_id: row.usuario_id, legacy_tenant_id: row.comunidade_id,
    role: row.papel, status: row.status, created_at: iso(row.criado_em),
  }));
  const destination = { tenants: [], profiles: [], memberships: [] };
  const writes = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (request, init = {}) => {
    const url = String(request);
    if (url.endsWith("/rpc/vinkulo_tenant_foundation_health")) return Response.json([
      { table_key: "tenants", present: true, rls_enabled: true }, { table_key: "profiles", present: true, rls_enabled: true },
      { table_key: "memberships", present: true, rls_enabled: true }, { table_key: "migrationRuns", present: true, rls_enabled: true },
    ]);
    const snapshots = { vinkulo_tenant_catalog_snapshot: "tenants", vinkulo_profile_snapshot: "profiles", vinkulo_membership_snapshot: "memberships" };
    for (const [name, key] of Object.entries(snapshots)) if (url.endsWith(`/rpc/${name}`)) return Response.json(destination[key]);
    const syncs = { vinkulo_sync_tenant_catalog: "tenants", vinkulo_sync_profiles: "profiles", vinkulo_sync_memberships: "memberships" };
    for (const [name, key] of Object.entries(syncs)) if (url.endsWith(`/rpc/${name}`)) {
      const body = JSON.parse(init.body);
      writes.push({ key, body });
      destination[key] = body.payload.map(item => ({ ...item }));
      return Response.json([{ run_id: "00000000-0000-4000-8000-000000000001", source_count: body.payload.length,
        inserted_count: body.payload.length, updated_count: 0, unchanged_count: 0 }]);
    }
    throw new Error(`RPC inesperada: ${url}`);
  };
  try {
    const enabled = (await (await call("ENABLE")).json()).status;
    assert.equal(enabled.enabled, true);
    assert.ok(enabled.lastSuccessAt);
    assert.deepEqual(writes.map(item => item.key), ["tenants", "profiles", "memberships"]);
    assert.deepEqual(destination.tenants, tenants);
    assert.deepEqual(destination.profiles, profiles);
    assert.deepEqual(destination.memberships, memberships);
    assert.deepEqual(Object.keys(writes[1].body.payload[0]).sort(), ["active", "created_at", "display_name", "email", "legacy_d1_id"]);
    assert.equal(JSON.stringify(writes).includes("Owner123"), false);
    assert.equal(JSON.stringify(enabled).includes("@example.test"), false);
    const changedProject = await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
      method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ ...configuration, url: "https://another-project.supabase.co", projectRef: "another-project" }),
    }), runtime, context);
    assert.equal(changedProject.status, 409);

    database.prepare("UPDATE usuarios SET nome = 'Membro atualizado' WHERE email = 'member.auto@example.test'").run();
    database.prepare("UPDATE usuario_comunidades SET status = 'REMOVIDO' WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'member.auto@example.test')").run();
    const updated = (await (await call("RECONCILE")).json()).status;
    assert.equal(updated.lastError, null);
    assert.equal(updated.lastResult.profiles.changed, 1);
    assert.equal(updated.lastResult.memberships.changed, 1);
    assert.equal(destination.profiles.find(item => item.email === "member.auto@example.test").display_name, "Membro atualizado");
    assert.equal(destination.memberships.find(item => item.legacy_user_id === profiles.find(profile => profile.email === "member.auto@example.test").legacy_d1_id).status, "REMOVIDO");

    destination.profiles.push({ legacy_d1_id: 999, display_name: "Extra", email: "extra@example.test", active: true, created_at: new Date().toISOString() });
    const blocked = (await (await call("RECONCILE")).json()).status;
    assert.match(blocked.lastError, /perfis extras/);
    assert.equal(destination.profiles.some(item => item.legacy_d1_id === 999), true);
    const disabled = (await (await call("DISABLE")).json()).status;
    assert.equal(disabled.enabled, false);
    const writeCount = writes.length;
    await call("RECONCILE");
    assert.equal(writes.length, writeCount);
  } finally { globalThis.fetch = nativeFetch; await Promise.all(tasks.splice(0)); database.close(); }
});

test("worker agenda conciliação após mutações relevantes e em tráfego posterior", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /relevantCatalogMutation\(url\.pathname, request\.method\)/);
  assert.match(worker, /ctx\.waitUntil\(runWithRuntimeEnv[\s\S]*runAutoSyncIfDue/);
  assert.match(worker, /url\.pathname === "\/painel" \|\| url\.pathname === "\/proprietario"/);
});
