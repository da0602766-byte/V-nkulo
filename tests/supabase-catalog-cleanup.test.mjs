import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";
import { cpfLoginRequest } from "./helpers/cpf-login.mjs";

const base = "http://localhost/api/proprietario/integracoes/supabase";
const cleanup = `${base}/catalog-copies`;

test("cópias dos catálogos só são removidas pelo proprietário com contagens conferidas", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerEmail = "owner.catalog-cleanup@example.test";
  await createPilotUser(database, { nome: "Owner", email: ownerEmail, senha: "Owner123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Member", email: "member.catalog-cleanup@example.test", senha: "Member123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
  const worker = (await import(new URL(`../dist/server/index.js?catalog-cleanup-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-limpeza",
    SYSTEM_OWNER_EMAIL: ownerEmail, SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  async function login(email, password) {
    const response = await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
      body: new URLSearchParams({ email, senha: password }),
    })), runtime, context);
    assert.equal(response.status, 303);
    const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
    return values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  }
  const ownerCookie = await login(ownerEmail, "Owner123");
  const memberCookie = await login("member.catalog-cleanup@example.test", "Member123");
  await Promise.all(tasks.splice(0));
  const config = { confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
    projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public", bucket: "", ativa: true };
  assert.equal((await worker.fetch(new Request(base, { method: "PATCH", headers: { cookie: ownerCookie,
    "content-type": "application/json" }, body: JSON.stringify(config) }), runtime, context)).status, 200);
  const remote = { tenants: 2, profiles: 3, memberships: 4, profile_details: 2, linked_auth: 0 };
  let clearCalls = 0;
  let countsAvailable = true;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/vinkulo_catalog_copy_counts")) return countsAvailable
      ? Response.json([remote]) : new Response("missing", { status: 404 });
    if (path.endsWith("/vinkulo_clear_catalog_copies")) {
      clearCalls++;
      const body = JSON.parse(init.body);
      assert.deepEqual([body.expected_tenants, body.expected_profiles, body.expected_memberships, body.expected_profile_details],
        [remote.tenants, remote.profiles, remote.memberships, remote.profile_details]);
      const removed = { tenants: remote.tenants, profiles: remote.profiles,
        memberships: remote.memberships, profile_details: remote.profile_details };
      Object.assign(remote, { tenants: 0, profiles: 0, memberships: 0, profile_details: 0 });
      return Response.json([removed]);
    }
    throw new Error(`RPC inesperada: ${url}`);
  };
  try {
    const call = (url, method, cookie, body) => worker.fetch(new Request(url, {
      method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }), runtime, context);
    assert.equal((await call(cleanup, "GET", "")).status, 401);
    assert.equal((await call(cleanup, "GET", memberCookie)).status, 403);
    assert.equal((await call(cleanup, "DELETE", memberCookie, { confirm: "REMOVER_COPIAS_CATALOGOS_SUPABASE", expected: remote })).status, 403);
    const shown = (await (await call(cleanup, "GET", ownerCookie)).json()).counts;
    assert.deepEqual(shown, remote);
    const projectChange = await call(base, "PATCH", ownerCookie, { ...config,
      url: "https://another-project.supabase.co", projectRef: "another-project" });
    assert.equal(projectChange.status, 409);
    const removeKey = await call(base, "PATCH", ownerCookie, { ...config, ativa: false,
      serviceRoleKey: "", removeServiceRoleKey: true });
    assert.equal(removeKey.status, 409);
    assert.equal((await call(base, "DELETE", ownerCookie, { confirm: "REMOVER_INTEGRACAO_SUPABASE" })).status, 409);
    const reset = await call("http://localhost/api/proprietario/reset", "POST", ownerCookie, { action: "PREVIEW" });
    assert.equal(reset.status, 409);
    assert.match((await reset.json()).error, /cópias de comunidades/);
    countsAvailable = false;
    assert.equal((await call("http://localhost/api/proprietario/reset", "POST", ownerCookie, { action: "PREVIEW" })).status, 409);
    const unavailable = await call(base, "DELETE", ownerCookie, { confirm: "REMOVER_INTEGRACAO_SUPABASE" });
    assert.equal(unavailable.status, 424);
    assert.match((await unavailable.json()).error, /migração SQL 0009/);
    countsAvailable = true;
    assert.equal((await call(cleanup, "DELETE", ownerCookie, { confirm: "REMOVER_COPIAS_CATALOGOS_SUPABASE",
      expected: { ...shown, profiles: shown.profiles + 1 } })).status, 409);
    assert.equal(clearCalls, 0);
    remote.linked_auth = 1;
    assert.equal((await call(cleanup, "DELETE", ownerCookie, { confirm: "REMOVER_COPIAS_CATALOGOS_SUPABASE", expected: shown })).status, 409);
    assert.equal(clearCalls, 0);
    remote.linked_auth = 0;
    const cleared = await call(cleanup, "DELETE", ownerCookie,
      { confirm: "REMOVER_COPIAS_CATALOGOS_SUPABASE", expected: shown });
    assert.equal(cleared.status, 200, await cleared.clone().text());
    assert.equal(clearCalls, 1);
    assert.deepEqual((await cleared.json()).counts, { tenants: 0, profiles: 0, memberships: 0, profile_details: 0, linked_auth: 0 });
    const saved = JSON.parse(database.prepare("SELECT valor FROM configuracoes WHERE chave='supabase_integration'").get().valor);
    assert.equal(saved.ativa, false);
    assert.equal((await call(base, "DELETE", ownerCookie, { confirm: "REMOVER_INTEGRACAO_SUPABASE" })).status, 200);
  } finally { globalThis.fetch = nativeFetch; await Promise.all(tasks.splice(0)); database.close(); }
});

test("SQL de limpeza recusa vínculos Auth e dependências operacionais", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0009_catalog_copy_cleanup.sql", import.meta.url), "utf8");
  assert.match(sql, /actual_linked > 0 then raise exception/);
  assert.match(sql, /truncate table[\s\S]*restrict;/i);
  assert.doesNotMatch(sql, /truncate table[\s\S]*cascade;/i);
  assert.match(sql, /revoke all on function public\.vinkulo_clear_catalog_copies[\s\S]*from public, anon, authenticated;/);
});
