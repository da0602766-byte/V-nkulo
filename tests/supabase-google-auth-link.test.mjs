import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import ts from "typescript";

async function load(path, dependencies, globals = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Request, Response, AbortController, crypto: webcrypto, setTimeout, clearTimeout,
      require: key => { assert.ok(key in dependencies, `Unexpected import ${key}`); return dependencies[key]; }, ...globals });
  return exports;
}

const email = "member@example.test";
const authId = "22222222-2222-4222-8222-222222222222";
const identity = { sub: "google-member-1", email, email_verified: true };
async function fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE configuracoes(chave TEXT PRIMARY KEY,valor TEXT,atualizado_por TEXT,atualizado_em TEXT);
    CREATE TABLE usuarios(id INTEGER PRIMARY KEY,email TEXT,ativo INTEGER);
    CREATE TABLE google_connections(usuario_id INTEGER,google_sub TEXT);
    INSERT INTO usuarios VALUES(1,'member@example.test',1);
    INSERT INTO google_connections VALUES(1,'google-member-1');`);
  sqlite.prepare("INSERT INTO configuracoes VALUES('supabase_auth_link_policy',?,'1',CURRENT_TIMESTAMP)")
    .run(JSON.stringify({ enabled: true, url: "https://project.supabase.co", projectRef: "project" }));
  const db = { prepare: sql => ({ bind: (...args) => ({
    first: async () => sqlite.prepare(sql).get(...args) || null,
    run: async () => sqlite.prepare(sql).run(...args),
  }) }) };
  const config = { ativa: true, url: "https://project.supabase.co", projectRef: "project", schema: "public", serviceRoleKey: "encrypted" };
  const state = { profile_id: "11111111-1111-4111-8111-111111111111", profile_email: email,
    linked_user_id: null, candidate_user_id: null, candidate_email: null, candidate_legacy_id: null, candidate_count: 0 };
  const calls = [], writes = [];
  const behavior = { failLink: false, concurrentCreate: false, unavailable: false };
  const candidate = () => Object.assign(state, { candidate_user_id: authId, candidate_email: email, candidate_legacy_id: "1", candidate_count: 1 });
  const auth = await load("app/lib/supabase-auth-link.ts", {
    "../../db": { getD1: () => db }, "./access-security": { auditAccess: async () => {} },
    "./supabase-integration": { readIntegration: async () => ({ config }), reveal: async () => "fake-service-key" },
  }, { fetch: async (url, init) => {
    calls.push(String(url));
    if (behavior.unavailable) throw new Error("synthetic network error");
    const path = new URL(url).pathname, body = JSON.parse(init.body);
    if (path.endsWith("/vinkulo_auth_link_state")) return Response.json([state]);
    if (path === "/auth/v1/admin/users") {
      writes.push({ path, body }); candidate();
      if (behavior.concurrentCreate) return new Response(null, { status: 422 });
      return Response.json({ id: authId });
    }
    if (path.startsWith("/auth/v1/admin/users/")) { writes.push({ path, body }); return Response.json({ id: authId }); }
    if (path.endsWith("/vinkulo_link_auth_profile")) {
      if (behavior.failLink) { behavior.failLink = false; return new Response(null, { status: 503 }); }
      assert.equal(body.new_auth_user_id, authId); state.linked_user_id = authId;
      return Response.json([{ linked: true }]);
    }
    throw new Error(`Unexpected path ${path}`);
  } });
  return { auth, sqlite, config, state, calls, writes, behavior, candidate };
}

test("Google prepara conta sem senha; login CPF posterior sincroniza a senha na mesma conta", async t => {
  const f = await fixture(t);
  assert.equal(await f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity), "LINKED");
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].body, { email, email_confirm: true, app_metadata: { vinkulo_legacy_d1_id: "1" } });
  assert.equal(f.state.linked_user_id, authId);
  await f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity);
  assert.equal(f.writes.length, 1, "Google não altera senha/conta existente");
  await f.auth.linkAuthAfterVerifiedLogin(1, email, "VerifiedPassword123");
  assert.equal(f.writes.length, 2);
  assert.equal(f.writes[1].path, `/auth/v1/admin/users/${authId}`);
  assert.equal(f.writes[1].body.password, "VerifiedPassword123");
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM configuracoes WHERE chave LIKE 'supabase_auth_link_lease:%'").get().n, 0);
});

test("Google retoma criação interrompida sem duplicar conta nem apagar senha", async t => {
  const f = await fixture(t); f.behavior.failLink = true;
  await assert.rejects(f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity));
  assert.equal(f.state.linked_user_id, null);
  await f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity);
  assert.equal(f.state.linked_user_id, authId); assert.equal(f.writes.length, 1);
});

test("Google resolve criação concorrente somente com metadados administrativos correspondentes", async t => {
  const f = await fixture(t); f.behavior.concurrentCreate = true;
  await f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity);
  assert.equal(f.state.linked_user_id, authId); assert.equal(f.writes.length, 1);
});

test("Google recusa identidade não confirmada, outro sub, cadastro inativo e e-mail divergente", async t => {
  const f = await fixture(t);
  for (const invalid of [{ ...identity, email_verified: false }, { ...identity, sub: "other" }, { ...identity, email: "other@example.test" }]) {
    await assert.rejects(f.auth.linkAuthAfterVerifiedGoogleLogin(1, invalid));
  }
  f.sqlite.exec("UPDATE usuarios SET ativo=0");
  await assert.rejects(f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity));
  assert.equal(f.calls.length, 0);
});

test("Google não assume conta remota com mesmo e-mail e identidade legada diferente", async t => {
  const f = await fixture(t); f.candidate(); f.state.candidate_legacy_id = "2";
  await assert.rejects(f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity), error => error.code === "CONFLICT");
  assert.equal(f.writes.length, 0); assert.equal(f.state.linked_user_id, null);
  f.state.candidate_legacy_id = "1"; f.state.candidate_count = 2;
  await assert.rejects(f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity), error => error.code === "CONFLICT");
  assert.equal(f.writes.length, 0);
});

test("pausa ou troca de projeto impede vínculo e falha remota libera tentativa", async t => {
  const f = await fixture(t); f.config.projectRef = "other";
  assert.equal(await f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity), "SKIPPED");
  f.config.projectRef = "project"; f.config.ativa = false;
  assert.equal(await f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity), "SKIPPED");
  assert.equal(f.calls.length, 0);
  f.config.ativa = true; f.behavior.unavailable = true;
  await assert.rejects(f.auth.linkAuthAfterVerifiedGoogleLogin(1, identity), error => error.code === "UNAVAILABLE");
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM configuracoes WHERE chave LIKE 'supabase_auth_link_lease:%'").get().n, 0);
});

async function callbackFixture(options = {}) {
  const order = [], audits = [];
  const state = { purpose: options.drive ? "drive" : "login", userId: 1, nonce: "nonce", returnTo: "/painel",
    ...(options.native ? { channel: "android", pairingHash: "pairing" } : {}) };
  const route = await load("app/api/auth/google/callback/route.ts", {
    "../../../../../db": { getD1: () => ({ prepare: () => ({ bind: () => ({
      first: async () => options.missing ? null : { id: 1, email, ativo: options.inactive ? 0 : 1 }, run: async () => {},
    }) }) }) },
    "../../../../lib/local-auth": { normalizeEmail: value => value.toLowerCase(), getSessionUser: async () => ({ id: 1, email }),
      createSession: async () => { order.push("session"); return {}; }, attachSessionCookie: response => { response.headers.set("set-cookie", "test-session=1"); return response; } },
    "../../../../lib/google-integration": { readGoogleState: async () => state,
      exchangeGoogleCode: async () => ({ id_token: "verified-id-token" }),
      verifyGoogleIdentity: async () => { if (options.invalid) throw new Error("invalid token"); order.push("verified"); return identity; },
      saveGoogleConnection: async () => { order.push("saved"); } },
    "../../../../lib/google-native-handoff": {
      readGoogleNativeHandoff: async () => ({ purpose: state.purpose, expires_at: new Date(Date.now() + 60_000).toISOString(), requested_user_id: 1 }),
      failGoogleNativeHandoff: async () => order.push("failed"), finishGoogleNativeHandoff: async () => order.push("handoff"),
    },
    "../../../../lib/access-security": { auditAccess: async (...args) => audits.push(args) },
    "../../../../lib/supabase-auth-link": { AuthLinkError: class extends Error {},
      linkAuthAfterVerifiedGoogleLogin: async (id, value) => {
        assert.equal(id, 1); assert.equal(value.sub, identity.sub); order.push("auth-link");
        if (options.fail) throw new Error("private remote error should not leak"); return "LINKED";
      } },
  });
  const response = await route.GET(new Request("https://example.test/api/auth/google/callback?state=test&code=test", {
    headers: { cookie: options.badNonce ? "" : "__Host-vinkulo_google_state=nonce" },
  }));
  return { response, order, audits };
}

test("callback Google vincula após validação e preserva sessão web mesmo se Supabase falhar", async () => {
  for (const fail of [false, true]) {
    const { response, order, audits } = await callbackFixture({ fail });
    assert.equal(response.status, 303); assert.equal(new URL(response.headers.get("location")).pathname, "/painel");
    assert.match(response.headers.get("set-cookie"), /test-session=1/);
    assert.deepEqual(order, ["verified", "saved", "auth-link", "session"]);
    assert.equal(JSON.stringify(audits).includes("private remote error"), false);
    assert.equal(audits[0][2].source, "GOOGLE");
  }
});

test("callback Android preserva handoff mesmo se Supabase falhar; Drive não inicia migração Auth", async () => {
  for (const fail of [false, true]) {
    const result = await callbackFixture({ native: true, fail });
    assert.deepEqual(result.order, ["verified", "saved", "auth-link", "handoff"]);
    assert.equal(new URL(result.response.headers.get("location")).pathname, "/login/google-concluido");
  }
  for (const native of [false, true]) {
    const result = await callbackFixture({ drive: true, native });
    assert.equal(result.order.includes("auth-link"), false);
    assert.equal(result.order.includes("session"), false);
  }
});

test("callback não migra com nonce/token inválido, conta ausente ou inativa", async () => {
  for (const options of [{ badNonce: true }, { invalid: true }, { missing: true }, { inactive: true }]) {
    const result = await callbackFixture(options);
    assert.equal(result.order.includes("auth-link"), false);
    assert.equal(result.order.includes("session"), false);
    assert.equal(new URL(result.response.headers.get("location")).pathname, "/login");
  }
});
