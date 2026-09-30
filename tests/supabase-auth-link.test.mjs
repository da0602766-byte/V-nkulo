import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";
import { cpfLoginRequest } from "./helpers/cpf-login.mjs";

const endpoint = "http://localhost/api/proprietario/integracoes/supabase/auth-link";
const iso = value => new Date(`${value.replace(" ", "T")}Z`).toISOString();

test("Auth é vinculado após CPF válido, recupera interrupção e preserva o login D1 em conflito", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerEmail = "owner.auth-link@example.test";
  const ownerId = await createPilotUser(database, { nome: "Owner", email: ownerEmail, senha: "Owner123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  const memberId = await createPilotUser(database, { nome: "Member", email: "member.auth-link@example.test", senha: "Member123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const conflictId = await createPilotUser(database, { nome: "Conflict", email: "conflict.auth-link@example.test", senha: "Conflict123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
  const worker = (await import(new URL(`../dist/server/index.js?auth-link-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-auth-link",
    SYSTEM_OWNER_EMAIL: ownerEmail, SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  async function login(email, password) {
    const response = await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
      body: new URLSearchParams({ email, senha: password }),
    })), runtime, context);
    const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
    return { response, cookie: values.map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean) };
  }
  const owner = await login(ownerEmail, "Owner123");
  const member = await login("member.auth-link@example.test", "Member123");
  await Promise.all(tasks.splice(0));
  assert.equal(owner.response.status, 303);
  assert.equal(member.response.status, 303);
  const configuration = { confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
    projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public", bucket: "", ativa: true };
  assert.equal((await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
    method: "PATCH", headers: { cookie: owner.cookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context)).status, 200);
  const source = database.prepare("SELECT id,nome,email,ativo,criado_em FROM usuarios ORDER BY id").all()
    .map(row => ({ legacy_d1_id: row.id, display_name: row.nome, email: row.email,
      active: Boolean(row.ativo), created_at: iso(row.criado_em) }));
  const authUsers = new Map();
  const links = new Map();
  const writes = [];
  let failLinkOnce = true;
  authUsers.set("conflict.auth-link@example.test", { id: "66666666-6666-4666-8666-666666666666",
    email: "conflict.auth-link@example.test", legacy: null });
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/vinkulo_tenant_foundation_health")) return Response.json(
      ["tenants", "profiles", "memberships", "migrationRuns"].map(table_key => ({ table_key, present: true, rls_enabled: true })));
    if (path.endsWith("/vinkulo_profile_snapshot")) return Response.json(source);
    if (path.endsWith("/vinkulo_catalog_copy_counts")) return Response.json([{
      tenants: 1, profiles: source.length, memberships: source.length, profile_details: 0,
      linked_auth: new Set([...authUsers.values()].filter(user => user.legacy).map(user => user.id).concat([...links.values()])).size,
    }]);
    if (path.endsWith("/vinkulo_auth_link_state")) {
      const id = JSON.parse(init.body).legacy_user_id;
      const row = source.find(item => item.legacy_d1_id === id);
      assert.ok(row);
      const candidate = authUsers.get(row.email);
      return Response.json([{ profile_id: "11111111-1111-4111-8111-111111111111", profile_email: row.email,
        linked_user_id: links.get(id) || null, candidate_user_id: candidate?.id || null,
        candidate_email: candidate?.email || null, candidate_legacy_id: candidate?.legacy || null,
        candidate_count: candidate ? 1 : 0 }]);
    }
    if (path.endsWith("/vinkulo_link_auth_profile")) {
      const body = JSON.parse(init.body);
      if (failLinkOnce) { failLinkOnce = false; return new Response("temporary", { status: 503 }); }
      links.set(body.legacy_user_id, body.new_auth_user_id);
      return Response.json([{ linked: true }]);
    }
    if (path === "/auth/v1/admin/users" && init.method === "POST") {
      const body = JSON.parse(init.body);
      writes.push({ method: "POST", body });
      if (authUsers.has(body.email)) return new Response("duplicate", { status: 422 });
      const id = "22222222-2222-4222-8222-222222222222";
      authUsers.set(body.email, { id, email: body.email, legacy: body.app_metadata?.vinkulo_legacy_d1_id });
      return Response.json({ id, email: body.email });
    }
    if (path.startsWith("/auth/v1/admin/users/") && init.method === "PUT") {
      writes.push({ method: "PUT", body: JSON.parse(init.body) });
      return Response.json({ id: path.split("/").at(-1) });
    }
    throw new Error(`RPC inesperada: ${url}`);
  };
  try {
    const call = (cookie, action, confirm) => worker.fetch(new Request(endpoint, {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action, confirm }),
    }), runtime, context);
    assert.equal((await call(member.cookie, "ENABLE", "ATIVAR_VINCULO_AUTH")).status, 403);
    assert.equal((await call(owner.cookie, "ENABLE", "ATIVAR_VINCULO_AUTH")).status, 409);
    database.prepare("INSERT INTO configuracoes(chave,valor,atualizado_por,atualizado_em) VALUES('supabase_auto_sync',?, 'sistema', CURRENT_TIMESTAMP)")
      .run(JSON.stringify({ enabled: true }));
    assert.equal((await call(owner.cookie, "ENABLE", "ATIVAR_VINCULO_AUTH")).status, 200);
    const invalid = await login("member.auth-link@example.test", "wrong");
    assert.equal(invalid.response.status, 303);
    assert.equal(invalid.cookie, undefined);
    assert.equal(writes.length, 0);
    const interrupted = await login("member.auth-link@example.test", "Member123");
    assert.equal(interrupted.response.status, 303);
    assert.ok(interrupted.cookie);
    assert.equal(writes.length, 1);
    assert.equal(links.has(memberId), false);
    assert.equal(writes[0].body.email_confirm, true);
    assert.equal(writes[0].body.app_metadata.vinkulo_legacy_d1_id, String(memberId));
    assert.equal(writes[0].body.password, "Member123");
    assert.equal(JSON.stringify(writes).includes("cpf"), false);
    assert.equal((await (await worker.fetch(new Request(endpoint, { headers: { cookie: owner.cookie } }), runtime, context)).json()).status.linked, 1);
    const recovered = await login("member.auth-link@example.test", "Member123");
    assert.equal(recovered.response.status, 303);
    assert.equal(links.get(memberId), "22222222-2222-4222-8222-222222222222");
    assert.equal(writes.filter(item => item.method === "POST").length, 1);
    assert.equal(writes.filter(item => item.method === "PUT").length, 1);
    const conflicting = await login("conflict.auth-link@example.test", "Conflict123");
    assert.equal(conflicting.response.status, 303);
    assert.ok(conflicting.cookie);
    assert.equal(links.has(conflictId), false);
    assert.equal(writes.length, 2);
    assert.equal((await (await worker.fetch(new Request(endpoint, { headers: { cookie: owner.cookie } }), runtime, context)).json()).status.linked, 1);
    assert.equal((await call(owner.cookie, "DISABLE")).status, 200);
    await login("member.auth-link@example.test", "Member123");
    assert.equal(writes.length, 2);
    assert.equal((await call(owner.cookie, "ENABLE", "ATIVAR_VINCULO_AUTH")).status, 200);
    const firstToken = `fa_${"a".repeat(64)}`;
    const digest = value => createHash("sha256").update(value).digest("hex");
    database.prepare("INSERT INTO redefinicoes_senha(usuario_id,token_hash,expira_em,usado) VALUES(?,?,datetime('now','+1 day'),0)")
      .run(memberId, `first:${digest(firstToken)}`);
    const first = await worker.fetch(new Request("http://localhost/api/auth/primeiro-acesso", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: firstToken, email: "member.auth-link@example.test",
        temporaryPassword: "Member123", password: "First1234", confirmPassword: "First1234" }),
    }), runtime, context);
    assert.equal(first.status, 200);
    assert.equal(writes.at(-1).method, "PUT");
    assert.equal(writes.at(-1).body.password, "First1234");
    const resetToken = "b".repeat(64);
    database.prepare("INSERT INTO redefinicoes_senha(usuario_id,token_hash,expira_em,usado) VALUES(?,?,datetime('now','+1 day'),0)")
      .run(memberId, digest(resetToken));
    const reset = await worker.fetch(new Request("http://localhost/api/auth/redefinir-senha", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: resetToken, senha: "Reset1234" }),
    }), runtime, context);
    assert.equal(reset.status, 200);
    assert.equal(writes.at(-1).method, "PUT");
    assert.equal(writes.at(-1).body.password, "Reset1234");
    assert.equal(writes.length, 4);
    assert.equal((await login("member.auth-link@example.test", "First1234")).cookie, undefined);
    assert.ok((await login("member.auth-link@example.test", "Reset1234")).cookie);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM configuracoes WHERE chave LIKE 'supabase_auth_link_lease:%'").get().n, 0);
  } finally { globalThis.fetch = nativeFetch; await Promise.all(tasks.splice(0)); database.close(); }
  assert.ok(ownerId > 0);
});

test("SQL Auth exige identidade confirmada, metadados confiáveis e bloqueia limpeza com contas criadas", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0010_auth_profile_link.sql", import.meta.url), "utf8");
  const typeFix = await readFile(new URL("../supabase/migrations/0011_auth_link_state_type_cast.sql", import.meta.url), "utf8");
  assert.match(sql, /email_confirmed_at is null/);
  assert.match(sql, /raw_app_meta_data->>'vinkulo_legacy_d1_id' is distinct from legacy_user_id::text/);
  assert.match(sql, /auth\.users u where u\.raw_app_meta_data \? 'vinkulo_legacy_d1_id'/);
  assert.match(sql, /select u\.id from auth\.users u where u\.raw_app_meta_data \? 'vinkulo_legacy_d1_id'/);
  assert.match(sql, /linked auth email mismatch/);
  assert.match(sql, /revoke select on public\.vinkulo_tenants, public\.vinkulo_profiles/);
  assert.match(sql, /drop policy if exists vinkulo_memberships_read_self_or_owner/);
  assert.match(typeFix, /select c\.email::text from candidates/);
  assert.match(typeFix, /grant execute on function public\.vinkulo_auth_link_state\(bigint\) to service_role/);
});
