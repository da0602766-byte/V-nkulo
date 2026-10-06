import assert from "node:assert/strict";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";
import { cpfLoginRequest } from "./helpers/cpf-login.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };

// Hold the first read until the other independent reads have started. This
// catches a new serial waterfall without depending on wall-clock benchmarks.
function observeConcurrentReads(d1, patterns) {
  const started = new Set();
  let timedOut = false;
  let release;
  let timer;
  const gate = new Promise(resolve => { release = resolve; });
  const wrap = (statement, query) => new Proxy(statement, {
    get(target, property) {
      if (property === "bind") return (...args) => wrap(target.bind(...args), query);
      if (property === "first" || property === "all") return async (...args) => {
        const index = patterns.findIndex(pattern => pattern.test(query));
        if (index >= 0) {
          started.add(index);
          timer ??= setTimeout(() => { timedOut = true; release(); }, 1000);
          if (started.size === patterns.length) { clearTimeout(timer); release(); }
          await gate;
        }
        return target[property](...args);
      };
      return typeof target[property] === "function" ? target[property].bind(target) : target[property];
    },
  });
  return {
    db: new Proxy(d1, {
      get(target, property) {
        if (property === "prepare") return query => wrap(target.prepare(query), query);
        return typeof target[property] === "function" ? target[property].bind(target) : target[property];
      },
    }),
    verify() {
      clearTimeout(timer);
      assert.equal(started.size, patterns.length, "all independent queries must execute");
      assert.equal(timedOut, false, "queries waited for each other instead of starting together");
    },
    close() { clearTimeout(timer); release(); },
  };
}

test("access reads overlap; module and membership revocations apply to the next request", async () => {
  const { database, d1 } = await createPilotD1();
  const userId = await createPilotUser(database, {
    nome: "Performance", email: "performance@example.test", senha: "Performance123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const worker = (await import(new URL(`../dist/server/index.js?performance-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "performance-test-secret-only", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const login = await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email: "performance@example.test", senha: "Performance123" }),
  })), runtime, context);
  assert.equal(login.status, 303);
  const cookie = login.headers.getSetCookie().map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(cookie);
  const reads = observeConcurrentReads(d1, [
    /AS lider,/, /FROM rede_administradores ra/, /SELECT d.id, d.escala_id/,
    /AS voluntarioLider/, /FROM assinaturas_comunidade/, /chave = 'community_modules:'/,
  ]);
  const request = () => new Request("http://localhost/api/pilot/publicacoes?limit=10", { headers: { cookie } });
  try {
    const response = await worker.fetch(request(), { ...runtime, DB: reads.db }, context);
    assert.equal(response.status, 200);
    reads.verify();
    const allowedIds = new Set(database.prepare("SELECT id FROM publicacoes_piloto WHERE comunidade_id=1").all().map(row => row.id));
    const posts = (await response.json()).publicacoes;
    assert.ok(posts.length > 0);
    assert.ok(posts.every(post => allowedIds.has(post.id)), "no posts from another community");
    assert.ok(posts.every(post => post.can_delete === 0), "member does not gain owner permissions");

    const eventsRequest = () => new Request("http://localhost/api/pilot/eventos", { headers: { cookie } });
    assert.equal((await worker.fetch(eventsRequest(), runtime, context)).status, 200);
    // node:sqlite binds JS numbers as REAL (1.0); use the same concatenation
    // as the adapter instead of assuming SQLite will format them as integers.
    const moduleKey = database.prepare("SELECT 'community_modules:' || ? AS chave").get(1).chave;
    database.prepare("INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES (?,'[]',?) ON CONFLICT(chave) DO UPDATE SET valor='[]'").run(moduleKey, String(userId));
    assert.equal((await worker.fetch(eventsRequest(), runtime, context)).status, 403);
    database.prepare("DELETE FROM configuracoes WHERE chave=?").run(moduleKey);
    assert.equal((await worker.fetch(eventsRequest(), runtime, context)).status, 200);
    database.prepare("UPDATE usuario_comunidades SET status='REMOVIDO' WHERE usuario_id=?").run(userId);
    assert.equal((await worker.fetch(request(), runtime, context)).status, 403);
  } finally { reads.close(); database.close(); }
});

test("panel loads feature flags and editorial policy concurrently", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, { nome: "Painel", email: "panel.performance@example.test", senha: "Performance123" });
  const worker = (await import(new URL(`../dist/server/index.js?panel-performance-${Date.now()}`, import.meta.url))).default;
  const runtime = { DB: d1, AUTH_SECRET: "performance-panel-secret-only", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const login = await worker.fetch(await cpfLoginRequest(runtime, new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email: "panel.performance@example.test", senha: "Performance123" }),
  })), runtime, context);
  assert.equal(login.status, 303);
  const cookie = login.headers.getSetCookie().map(value => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  const reads = observeConcurrentReads(d1, [/FROM feature_flags/, /FROM politicas_editoriais_ia/]);
  try {
    const response = await worker.fetch(new Request("http://localhost/painel", { headers: { cookie } }), { ...runtime, DB: reads.db }, context);
    assert.equal(response.status, 200);
    await response.text();
    reads.verify();
  } finally { reads.close(); database.close(); }
});
