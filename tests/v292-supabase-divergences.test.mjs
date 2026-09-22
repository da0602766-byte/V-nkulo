import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const endpoint = "http://localhost/api/proprietario/integracoes/supabase/divergences";
const iso = value => new Date(`${value.replace(" ", "T")}Z`).toISOString();

async function login(worker, runtime, context, email, password) {
  const response = await worker.fetch(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email, senha: password }),
  }), runtime, context);
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  return values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
}

test("proprietário vê somente IDs e campos divergentes, sem modificar catálogos ou expor valores pessoais", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerEmail = "owner.private-diff@example.test";
  await createPilotUser(database, { nome: "Sensitive Owner", email: ownerEmail, senha: "Owner123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Sensitive Member", email: "member.private-diff@example.test", senha: "Member123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
  const worker = (await import(new URL(`../dist/server/index.js?divergences-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-diagnostico", SYSTEM_OWNER_EMAIL: ownerEmail,
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ownerCookie = await login(worker, runtime, context, ownerEmail, "Owner123");
  const memberCookie = await login(worker, runtime, context, "member.private-diff@example.test", "Member123");
  await Promise.all(tasks.splice(0));
  const call = (cookie = "") => worker.fetch(new Request(endpoint, { headers: cookie ? { cookie } : {} }), runtime, context);
  assert.equal((await call()).status, 401);
  assert.equal((await call(memberCookie)).status, 403);
  assert.equal((await call(ownerCookie)).status, 503);
  const configuration = { confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
    projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public", bucket: "", ativa: true };
  assert.equal((await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
    method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context)).status, 200);

  const destination = {
    communities: database.prepare("SELECT id, slug, nome, status, ambiente_demo, criado_em FROM comunidades").all().map(row => ({
      legacy_d1_id: row.id, slug: row.slug, name: row.nome, status: row.status, is_demo: Boolean(row.ambiente_demo), created_at: iso(row.criado_em),
    })),
    profiles: database.prepare("SELECT id, nome, email, ativo, criado_em FROM usuarios").all().map(row => ({
      legacy_d1_id: row.id, display_name: row.nome, email: row.email, active: Boolean(row.ativo), created_at: iso(row.criado_em),
    })),
    memberships: database.prepare("SELECT id, usuario_id, comunidade_id, papel, status, criado_em FROM usuario_comunidades").all().map(row => ({
      legacy_d1_id: row.id, legacy_user_id: row.usuario_id, legacy_tenant_id: row.comunidade_id,
      role: row.papel, status: row.status, created_at: iso(row.criado_em),
    })),
  };
  const nativeFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    const scope = String(url).endsWith("/vinkulo_tenant_catalog_snapshot") ? "communities"
      : String(url).endsWith("/vinkulo_profile_snapshot") ? "profiles"
        : String(url).endsWith("/vinkulo_membership_snapshot") ? "memberships" : null;
    assert.ok(scope, `RPC inesperada: ${url}`);
    return Response.json(destination[scope]);
  };
  try {
    const clean = await (await call(ownerCookie)).json();
    assert.equal(clean.report.ready, true);
    assert.deepEqual(clean.report.issues, []);

    const originalCommunity = destination.communities[0].name;
    destination.communities[0].name = "Remote Private Community";
    destination.communities.push({ ...destination.communities[0], legacy_d1_id: 999, slug: "remote-extra" });
    destination.profiles[0].email = "private-remote@example.test";
    destination.profiles.push({ ...destination.profiles[0], legacy_d1_id: 998, email: "orphan@example.test" });
    destination.memberships[0].role = "ROLE_REMOTE_PRIVATE";
    const missingMembership = destination.memberships.pop();
    assert.ok(missingMembership);
    const response = await call(ownerCookie);
    assert.equal(response.status, 200);
    const text = await response.text();
    const { report } = JSON.parse(text);
    assert.equal(report.ready, false);
    assert.deepEqual(report.counts.communities, { source: destination.communities.length - 1, destination: destination.communities.length,
      missing: 0, different: 1, extra: 1, untracked: 0 });
    assert.equal(report.counts.profiles.extra, 1);
    assert.equal(report.counts.profiles.different, 1);
    assert.equal(report.counts.memberships.missing, 1);
    assert.equal(report.counts.memberships.different, 1);
    assert.ok(report.issues.some(item => item.scope === "profiles" && item.kind === "DIFFERENT" && item.fields.includes("e-mail")));
    assert.ok(report.issues.some(item => item.scope === "communities" && item.kind === "EXTRA" && item.legacyId === 999));
    assert.ok(report.issues.some(item => item.scope === "memberships" && item.kind === "MISSING"));
    for (const value of [ownerEmail, "Sensitive Owner", "Remote Private Community", "private-remote@example.test", "orphan@example.test", originalCommunity]) {
      assert.equal(text.includes(value), false, `dado pessoal ou valor remoto exposto: ${value}`);
    }
    assert.equal(calls.every(item => item.method === "POST" && item.body === "{}"), true);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM usuarios").get().count, destination.profiles.length - 1);

    destination.profiles.push({ ...destination.profiles[0], legacy_d1_id: null });
    const untracked = (await (await call(ownerCookie)).json()).report;
    assert.equal(untracked.counts.profiles.untracked, 1);
    assert.ok(untracked.issues.some(item => item.scope === "profiles" && item.kind === "UNTRACKED" && item.legacyId === null));
    destination.profiles.push({ ...destination.profiles[0] });
    const duplicate = await call(ownerCookie);
    assert.equal(duplicate.status, 503);
    assert.match((await duplicate.json()).error, /IDs duplicados/);
  } finally { globalThis.fetch = nativeFetch; await Promise.all(tasks.splice(0)); database.close(); }
});

test("a interface de triagem não oferece exclusão ou reativação", async () => {
  const ui = await readFile(new URL("../app/components/SupabaseDivergences.tsx", import.meta.url), "utf8");
  assert.match(ui, /Verificar divergências/);
  assert.match(ui, /Não altera ou exclui registros/);
  assert.doesNotMatch(ui, /method: "(POST|DELETE|PATCH)"/);
});
