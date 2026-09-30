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
  let remoteReads = 0;
  let remoteMode = "normal";
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path === "/storage/v1/bucket") return Response.json([{ id: "private-images", name: "private-images", public: false }]);
    if (path.includes("/storage/v1/object/authenticated/private-images/")) {
      remoteReads++;
      assert.equal(init.redirect, "manual");
      if (remoteMode === "failure") return new Response("unavailable", { status: 503 });
      if (remoteMode === "slow-body") return new Response(new ReadableStream({ start() {} }));
      return remote ? new Response(remote) : Response.json({ statusCode: "404", error: "not_found", message: "Object not found" }, { status: 400 });
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
    const imageRequest = (suffix = "") => worker.fetch(new Request(`http://localhost/api/pilot/uploads/${key}${suffix}`), runtime, context);
    const changeSource = (source, cookie = ownerCookie, origin = "http://localhost") => worker.fetch(new Request(endpoint, {
      method: "PATCH", headers: { ...(cookie ? { cookie } : {}), origin, "content-type": "application/json" },
      body: JSON.stringify({ source, confirm: "ALTERAR_LEITURA_IMAGENS" }),
    }), runtime, context);
    assert.equal((await changeSource("SUPABASE", "")).status, 401);
    assert.equal((await changeSource("SUPABASE", memberCookie)).status, 403);
    assert.equal((await changeSource("SUPABASE", ownerCookie, "https://attacker.test")).status, 403);
    assert.equal((await changeSource("UNKNOWN")).status, 400);
    const readsBeforeDefault = remoteReads;
    assert.equal((await imageRequest()).headers.get("X-Vinkulo-Storage"), "r2");
    assert.equal(remoteReads, readsBeforeDefault, "R2 continues to be the default");
    const activated = await changeSource("SUPABASE");
    assert.equal(activated.status, 200);
    assert.equal((await activated.json()).readSource, "SUPABASE");
    const r2BeforePrimary = calls.get;
    const primary = await imageRequest("?download=1");
    assert.equal(primary.status, 200);
    assert.equal(primary.headers.get("X-Vinkulo-Storage"), "supabase");
    assert.equal(primary.headers.get("Content-Type"), "image/jpeg");
    assert.match(primary.headers.get("Cache-Control"), /no-store/);
    assert.match(primary.headers.get("Content-Disposition"), /attachment/);
    assert.equal(await primary.text(), "the original image bytes");
    assert.equal(calls.get, r2BeforePrimary, "primary Supabase read skips R2");
    const benchmarkUrl = "http://localhost/api/proprietario/integracoes/supabase/storage-read-benchmark";
    const measure = cookie => worker.fetch(new Request(benchmarkUrl, { method: "POST", headers: cookie ? { cookie } : {} }), runtime, context);
    assert.equal((await measure()).status, 401);
    assert.equal((await measure(memberCookie)).status, 403);
    const measured = await measure(ownerCookie);
    assert.equal(measured.status, 200);
    const measuredResult = (await measured.json()).result;
    assert.equal(measuredResult.matching, true);
    assert.equal(measuredResult.samples.length, 3);
    assert.equal(measuredResult.sizeBytes, bytes.byteLength);
    assert.equal(JSON.stringify(measuredResult).includes(key), false);
    assert.equal(JSON.stringify(measuredResult).includes("original image"), false);
    remoteMode = "failure";
    assert.equal((await imageRequest()).headers.get("X-Vinkulo-Storage"), "r2");
    runtime.BUCKET.get = async () => { throw new Error("R2 unavailable"); };
    const unavailable = await imageRequest();
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
    runtime.BUCKET.get = r2Get;
    remoteMode = "slow-body";
    const started = performance.now();
    assert.equal((await imageRequest()).headers.get("X-Vinkulo-Storage"), "r2");
    assert.ok(performance.now() - started < 4000, "slow body must fall back within bounded time");
    remoteMode = "normal";
    const intactPrimary = remote;
    remote = new TextEncoder().encode("tampered").buffer;
    assert.equal((await imageRequest()).headers.get("X-Vinkulo-Storage"), "r2", "hash mismatch cannot expose corrupted bytes");
    remote = intactPrimary;
    database.prepare("INSERT INTO platform_reset_history(id,mode,owner_id,summary) VALUES('storage-test','DELETE',1,'{}')").run();
    database.prepare("INSERT INTO platform_reset_files(object_key,reset_id,disposition) VALUES(?,'storage-test','DELETE_PENDING')").run(key);
    const beforeDeletedRead = remoteReads;
    assert.equal((await imageRequest()).status, 404);
    assert.equal(remoteReads, beforeDeletedRead, "deleted files never reach Supabase");
    database.prepare("DELETE FROM platform_reset_files WHERE object_key=?").run(key);
    // A setting belongs to one exact target and cannot follow a project/bucket change.
    const preference = database.prepare("SELECT valor FROM configuracoes WHERE chave='supabase_storage_read_source'").get().valor;
    database.prepare("UPDATE configuracoes SET valor=? WHERE chave='supabase_storage_read_source'")
      .run(JSON.stringify({ ...JSON.parse(preference), bucket: "other" }));
    const beforeWrongBucket = remoteReads;
    assert.equal((await imageRequest()).headers.get("X-Vinkulo-Storage"), "r2");
    assert.equal(remoteReads, beforeWrongBucket);
    database.prepare("UPDATE configuracoes SET valor=? WHERE chave='supabase_storage_read_source'").run(preference);
    assert.equal((await changeSource("R2")).status, 200);
    runtime.BUCKET.get = async value => {
      database.prepare("INSERT INTO platform_reset_files(object_key,reset_id,disposition) VALUES(?,'storage-test','DELETE_PENDING')").run(key);
      return r2Get(value);
    };
    assert.equal((await imageRequest()).status, 404, "deletion during download must block the response");
    database.prepare("DELETE FROM platform_reset_files WHERE object_key=?").run(key);
    runtime.BUCKET.get = async () => null;
    const fallback = await worker.fetch(new Request(`http://localhost/api/pilot/uploads/${key}`), runtime, context);
    assert.equal(fallback.status, 200);
    assert.equal(await fallback.text(), "the original image bytes");
    const intact = remote;
    remote = new TextEncoder().encode("changed image bytes").buffer;
    const rejectedFallback = await worker.fetch(new Request(`http://localhost/api/pilot/uploads/${key}`), runtime, context);
    assert.equal(rejectedFallback.status, 503);
    remote = intact;
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
    assert.equal((await changeSource("SUPABASE")).status, 200);
    const rollback = await rollbackRequest();
    assert.equal(rollback.status, 200);
    assert.deepEqual((await rollback.json()).result, { removed: 1, remaining: 0 });
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM supabase_storage_copies").get().n, 0);
    assert.equal(calls.delete, 0);
    assert.equal(JSON.parse(database.prepare("SELECT valor FROM configuracoes WHERE chave='supabase_storage_read_source'").get().valor).source, "R2");
    assert.equal((await changeSource("SUPABASE")).status, 409);
  } finally { globalThis.fetch = nativeFetch; }
});
