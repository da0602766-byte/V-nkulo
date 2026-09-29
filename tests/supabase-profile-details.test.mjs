import assert from "node:assert/strict";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";
import { cpfLoginRequest } from "./helpers/cpf-login.mjs";

const endpoint = "http://localhost/api/proprietario/integracoes/supabase/profile-details";
const iso = value => new Date(`${value.replace(" ", "T")}Z`).toISOString();

test("dados cadastrais são copiados ao serviço e a API devolve apenas contagens", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerEmail = "owner.details@example.test";
  const ownerId = await createPilotUser(database, { nome: "Sensitive Owner", email: ownerEmail,
    senha: "Owner123", memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Sensitive Member", email: "member.details@example.test",
    senha: "Member123", memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  database.prepare("UPDATE usuarios SET telefone=?,endereco=?,observacoes=?,cadastro_dados=? WHERE id=?")
    .run("11999990000", "Rua Confidencial 123", "Observação privada", JSON.stringify({ campo: "dado sensível" }), ownerId);
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
  const worker = (await import(new URL(`../dist/server/index.js?profile-details-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "segredo-ficticio-para-detalhes",
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
  const memberCookie = await login("member.details@example.test", "Member123");
  await Promise.all(tasks.splice(0));
  const configuration = { confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
    projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public", bucket: "", ativa: true };
  assert.equal((await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
    method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context)).status, 200);
  const remoteProfiles = database.prepare("SELECT id,nome,email,ativo,criado_em FROM usuarios ORDER BY id").all()
    .map(row => ({ legacy_d1_id: row.id, display_name: row.nome, email: row.email,
      active: Boolean(row.ativo), created_at: iso(row.criado_em) }));
  let remoteDetails = [];
  let privatePayload = null;
  let removedCount = null;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/vinkulo_tenant_foundation_health")) return Response.json(
      ["tenants", "profiles", "memberships", "migrationRuns"].map(table_key => ({ table_key, present: true, rls_enabled: true })));
    if (path.endsWith("/vinkulo_profile_snapshot")) return Response.json(remoteProfiles);
    if (path.endsWith("/vinkulo_profile_details_snapshot")) return Response.json(remoteDetails);
    if (path.endsWith("/vinkulo_sync_profile_details")) {
      privatePayload = JSON.parse(init.body);
      remoteDetails = privatePayload.payload;
      return Response.json([{ run_id: "run-1", source_count: remoteDetails.length,
        inserted_count: remoteDetails.length, updated_count: 0, unchanged_count: 0 }]);
    }
    if (path.endsWith("/vinkulo_clear_profile_details")) {
      removedCount = remoteDetails.length;
      remoteDetails = [];
      return Response.json([{ deleted_count: removedCount }]);
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  try {
    const call = (cookie, method = "GET", body) => worker.fetch(new Request(endpoint, {
      method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }), runtime, context);
    assert.equal((await call("")).status, 401);
    assert.equal((await call(memberCookie)).status, 403);
    const before = await call(ownerCookie);
    assert.equal(before.status, 200);
    const beforeBody = await before.text();
    const preview = JSON.parse(beforeBody).preview;
    assert.equal(preview.destinationCount, 0);
    assert.equal(preview.pendingCount, preview.sourceCount);
    for (const secret of ["11999990000", "Rua Confidencial 123", "Observação privada", "dado sensível"]) {
      assert.equal(beforeBody.includes(secret), false);
    }
    assert.equal((await call(ownerCookie, "POST", { confirm: "SINCRONIZAR_DADOS_CADASTRAIS", sourceCount: preview.sourceCount + 1 })).status, 409);
    const copied = await call(ownerCookie, "POST", { confirm: "SINCRONIZAR_DADOS_CADASTRAIS", sourceCount: preview.sourceCount });
    assert.equal(copied.status, 200, await copied.clone().text());
    const responseText = await copied.text();
    assert.equal(JSON.parse(responseText).preview.ready, true);
    assert.equal((await (await call(ownerCookie)).json()).copyTracked, true);
    const resetBlocked = await worker.fetch(new Request("http://localhost/api/proprietario/reset", {
      method: "POST", headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "PREVIEW" }),
    }), runtime, context);
    assert.equal(resetBlocked.status, 409);
    assert.match((await resetBlocked.json()).error, /cópia dos dados cadastrais/);
    const integrationDelete = () => worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
      method: "DELETE", headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirm: "REMOVER_INTEGRACAO_SUPABASE" }),
    }), runtime, context);
    assert.equal((await integrationDelete()).status, 409);
    assert.equal(privatePayload.payload.length, preview.sourceCount);
    const ownerDetails = privatePayload.payload.find(item => item.legacy_d1_id === ownerId).details;
    assert.equal(ownerDetails.phone, "11999990000");
    assert.equal(ownerDetails.registration_data.campo, "dado sensível");
    assert.equal(JSON.stringify(privatePayload).includes("senha_hash"), false);
    assert.equal(JSON.stringify(privatePayload).includes("senha_salt"), false);
    for (const secret of ["11999990000", "Rua Confidencial 123", "Observação privada", "dado sensível"]) {
      assert.equal(responseText.includes(secret), false);
    }
    database.prepare("UPDATE usuarios SET cadastro_dados=? WHERE id=?").run("{invalid", ownerId);
    const invalid = await call(ownerCookie);
    assert.equal(invalid.status, 422);
    assert.match((await invalid.json()).error, /formato inválido/);
    assert.equal(remoteDetails.length, preview.sourceCount);
    database.prepare("UPDATE usuarios SET cadastro_dados=? WHERE id=?")
      .run(JSON.stringify({ origem: "LINK_CADASTRO_MEMBROS", operacao: "private-token" }), ownerId);
    const marker = await call(ownerCookie);
    assert.equal(marker.status, 409);
    assert.match((await marker.json()).error, /marcador ou credencial/);
    assert.equal((await call(ownerCookie, "DELETE", { confirm: "REMOVER_COPIA_DADOS_CADASTRAIS", destinationCount: remoteDetails.length + 1 })).status, 409);
    assert.equal(remoteDetails.length, preview.sourceCount);
    database.prepare("UPDATE usuarios SET cadastro_dados=? WHERE id=?").run("{}", ownerId);
    const removed = await call(ownerCookie, "DELETE", { confirm: "REMOVER_COPIA_DADOS_CADASTRAIS", destinationCount: remoteDetails.length });
    assert.equal(removed.status, 200, await removed.clone().text());
    assert.equal((await removed.json()).deleted, preview.sourceCount);
    assert.equal(removedCount, preview.sourceCount);
    assert.equal(remoteDetails.length, 0);
    assert.equal((await (await call(ownerCookie)).json()).copyTracked, false);
    assert.equal((await integrationDelete()).status, 200);
  } finally { globalThis.fetch = nativeFetch; }
});
