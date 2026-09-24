import { cpfLoginRequest } from './helpers/cpf-login.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v293", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

test("sessão assinada preserva revogação com uma só consulta D1", async () => {
  const { database, d1 } = await createPilotD1();
  const userId = await createPilotUser(database, {
    nome: "Usuário de Medição",
    email: "medicao.sessao@example.test",
    senha: "Medicao123",
  });
  const worker = await loadWorker();
  const env = {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-exclusivo-desempenho-v293",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const login = await worker.fetch(await cpfLoginRequest(env, new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: "medicao.sessao@example.test", senha: "Medicao123" }),
  })), env, context);
  assert.equal(login.status, 303);
  const setCookies = typeof login.headers.getSetCookie === "function"
    ? login.headers.getSetCookie()
    : [login.headers.get("set-cookie") || ""];
  const cookie = setCookies.map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(cookie);

  const originalPrepare = d1.prepare.bind(d1);
  const sessionQueries = [];
  d1.prepare = (query) => {
    if (/\bFROM sessoes\b/i.test(query)) sessionQueries.push(query);
    return originalPrepare(query);
  };
  const panel = await worker.fetch(new Request("http://localhost/painel", {
    headers: { accept: "text/html", cookie },
  }), env, context);
  assert.equal(panel.status, 200);
  // O render do painel valida a sessão duas vezes em camadas distintas; cada
  // validação agora usa só uma consulta, não duas consultas sequenciais.
  assert.equal(sessionQueries.length, 2);
  for (const query of sessionQueries) {
    assert.match(query, /LEFT JOIN usuarios u ON u\.id = s\.usuario_id/);
    assert.match(query, /s\.token_hash = \?/);
    assert.match(query, /datetime\(s\.expira_em\) > CURRENT_TIMESTAMP/);
  }

  database.prepare("DELETE FROM sessoes WHERE usuario_id = ?").run(userId);
  sessionQueries.length = 0;
  const revoked = await worker.fetch(new Request("http://localhost/painel", {
    headers: { accept: "text/html", cookie },
  }), env, context);
  assert.equal(revoked.status, 307);
  assert.match(revoked.headers.get("location") || "", /motivo=sessao_invalida/);
  assert.equal(sessionQueries.length, 1);
  database.close();
});

test("Meus pedidos não espera a Central operacional para sair do carregamento", async () => {
  const component = await readFile(new URL("../app/components/RequestsWorkspace.tsx", import.meta.url), "utf8");
  assert.match(component, /const requestsTask = \(async \(\) => \{/);
  assert.match(component, /const centralTask = \(async \(\) => \{/);
  assert.match(component, /finally \{ if \(!quiet\) setLoading\(false\); \}/);
  assert.match(component, /await Promise\.all\(\[requestsTask, centralTask\]\)/);
});
