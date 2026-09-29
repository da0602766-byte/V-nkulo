import assert from "node:assert/strict";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";
import { cpfLoginRequest } from "./helpers/cpf-login.mjs";

const endpoint = "http://localhost/api/proprietario/integracoes/supabase/storage-copy";

test("cópia de imagens exige proprietário e confere bytes sem apagar o R2", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerEmail = "owner.storage-copy@example.test";
  await createPilotUser(database, { nome: "Owner", email: ownerEmail, senha: "Owner123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }] });
  await createPilotUser(database, { nome: "Member", email: "member.storage-copy@example.test", senha: "Member123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const tasks = [];
  const context = { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} };
  const worker = (await import(new URL(`../dist/server/index.js?storage-copy-${Date.now()}`, import.meta.url))).default;
  const key = "images/post-image/1/550e8400-e29b-41d4-a716-446655440000.jpg";
  const bytes = new TextEncoder().encode("the original image bytes");
  const calls = { list: 0, get: 0, delete: 0 };
  const runtime = {
    DB: d1, AUTH_SECRET: "segredo-ficticio-para-storage-copy",
    SYSTEM_OWNER_EMAIL: ownerEmail, SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z",
    BUCKET: {
      async list() { calls.list++; return { objects: [{ key }, { key: "platform/archive" }], truncated: false }; },
      async get(value) { calls.get++; assert.equal(value, key); return { body: new Blob([bytes]).stream(), httpMetadata: { contentType: "image/jpeg" } }; },
      async delete() { calls.delete++; },
    },
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
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
  const memberCookie = await login("member.storage-copy@example.test", "Member123");
  await Promise.all(tasks.splice(0));
  const call = cookie => worker.fetch(new Request(endpoint, { method: "POST", headers: {
    "content-type": "application/json", ...(cookie ? { cookie } : {}),
  }, body: JSON.stringify({ confirm: true }) }), runtime, context);
  assert.equal((await call()).status, 401);
  assert.equal((await call(memberCookie)).status, 403);
  assert.equal(calls.list, 0);
  const configuration = { confirm: true, ambiente: "PRODUCAO", url: "https://example-project.supabase.co",
    projectRef: "example-project", anonKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    serviceRoleKey: "sb_secret_abcdefghijklmnopqrstuvwxyz", jwtSecret: "", schema: "public", bucket: "private-images", ativa: true };
  assert.equal((await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
    method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(configuration),
  }), runtime, context)).status, 200);

  let remote = null;
  let uploads = 0;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path === "/storage/v1/bucket") return Response.json([{ id: "private-images", name: "private-images", public: false }]);
    if (path.includes("/storage/v1/object/authenticated/private-images/")) {
      return remote ? new Response(remote) : Response.json({ code: "NoSuchKey" }, { status: 404 });
    }
    if (path.includes("/storage/v1/object/private-images/")) {
      if (init.method === "DELETE") { remote = null; return Response.json({ message: "Successfully deleted" }); }
      assert.equal(init.method, "POST");
      assert.equal(init.headers["x-upsert"], "false");
      uploads++;
      remote = await new Response(init.body).arrayBuffer();
      return Response.json({ Key: key });
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  try {
    const first = await call(ownerCookie);
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).result, { scanned: 2, copied: 1, verified: 0, skipped: 1, nextCursor: null });
    const second = await call(ownerCookie);
    assert.equal(second.status, 200);
    assert.deepEqual((await second.json()).result, { scanned: 2, copied: 0, verified: 1, skipped: 1, nextCursor: null });
    assert.equal(uploads, 1);
    assert.equal(calls.delete, 0);
    assert.equal(calls.get, 2);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM supabase_storage_copies").get().n, 1);
    const r2Get = runtime.BUCKET.get;
    runtime.BUCKET.get = async () => null;
    const fallback = await worker.fetch(new Request(`http://localhost/api/pilot/uploads/${key}`), runtime, context);
    assert.equal(fallback.status, 200);
    assert.equal(await fallback.text(), "the original image bytes");
    runtime.BUCKET.get = r2Get;
    const changedBucket = await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
      method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ ...configuration, bucket: "another-bucket", serviceRoleKey: "" }),
    }), runtime, context);
    assert.equal(changedBucket.status, 409);
    const removed = await worker.fetch(new Request("http://localhost/api/proprietario/integracoes/supabase", {
      method: "DELETE", headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirm: "REMOVER_INTEGRACAO_SUPABASE" }),
    }), runtime, context);
    assert.equal(removed.status, 409);
    const originalRemote = remote;
    remote = new TextEncoder().encode("different bytes").buffer;
    const conflict = await call(ownerCookie);
    assert.equal(conflict.status, 409);
    assert.match((await conflict.json()).error, /conteúdo diferente/);
    assert.equal(calls.delete, 0);
    const rollbackRequest = () => worker.fetch(new Request(endpoint, { method: "DELETE", headers: {
      cookie: ownerCookie, "content-type": "application/json",
    }, body: JSON.stringify({ confirm: "REMOVER_COPIAS_SUPABASE" }) }), runtime, context);
    assert.equal((await rollbackRequest()).status, 409);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM supabase_storage_copies").get().n, 1);
    remote = originalRemote;
    const rollback = await rollbackRequest();
    assert.equal(rollback.status, 200);
    assert.deepEqual((await rollback.json()).result, { removed: 1, remaining: 0 });
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM supabase_storage_copies").get().n, 0);
    assert.equal(calls.delete, 0);
  } finally { globalThis.fetch = nativeFetch; }
});
