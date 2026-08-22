import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v144", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-visitors-v144",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function login(worker, env, email, senha) {
  const response = await worker.fetch(new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, senha }),
  }), env, context);
  assert.equal(response.status, 303);
  const raw = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const cookie = raw.map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(cookie);
  return cookie;
}

async function jsonRequest(worker, env, path, { method = "GET", cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await worker.fetch(new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, context);
  return { response, body: await response.json().catch(() => ({})) };
}

test("Visitantes oferece ficha única, filtros, aniversários e exclusão definitiva", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastora Visitantes",
    email: "pastora.visitantes.v144@example.test",
    senha: "Visitantes144",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const cookie = await login(worker, env, "pastora.visitantes.v144@example.test", "Visitantes144");
  const month = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const uniquePhone = "47999991444";

  const created = await jsonRequest(worker, env, "/api/pilot/visitantes", {
    method: "POST",
    cookie,
    body: {
      nomeCompleto: "Pessoa Única V144",
      email: "pessoa.unica.v144@example.test",
      telefone: uniquePhone,
      parente: "Familiar V144",
      dataNascimento: `1990-${month}-22`,
      dataEntrada: "2026-08-21",
      batizado: "NAO_INFORMADO",
      status: "NOVO",
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));

  const duplicatePreview = await jsonRequest(
    worker,
    env,
    `/api/pilot/visitantes?duplicidade=1&telefone=${uniquePhone}`,
    { cookie },
  );
  assert.equal(duplicatePreview.response.status, 200);
  assert.equal(duplicatePreview.body.duplicados[0].parente, "Familiar V144");

  const duplicateCreate = await jsonRequest(worker, env, "/api/pilot/visitantes", {
    method: "POST",
    cookie,
    body: {
      nomeCompleto: "Pessoa Única V144",
      telefone: uniquePhone,
      dataEntrada: "2026-08-21",
      batizado: "NAO_INFORMADO",
      status: "NOVO",
    },
  });
  assert.equal(duplicateCreate.response.status, 409);

  const directory = await jsonRequest(worker, env, "/api/pilot/visitantes", { cookie });
  assert.equal(directory.response.status, 200);
  assert.ok(directory.body.visitantes.length <= 10);
  assert.ok(directory.body.aniversariantes.some((item) => item.id === created.body.id));

  const deleted = await jsonRequest(
    worker,
    env,
    `/api/pilot/visitantes/${created.body.id}?permanente=1`,
    { method: "DELETE", cookie },
  );
  assert.equal(deleted.response.status, 200, JSON.stringify(deleted.body));
  assert.equal(database.prepare("SELECT id FROM visitantes WHERE id = ?").get(created.body.id), undefined);
});

test("layout compacto inclui dashboard por categoria, filtro e diálogo em portal", async () => {
  const [workspace, styles, visitorsApi, categoryApi] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/globals.css"),
    source("app/api/pilot/visitantes/route.ts"),
    source("app/api/pilot/visitante-categorias/route.ts"),
  ]);
  assert.match(workspace, /createPortal\(/);
  assert.match(workspace, /visitor-category-dashboards/);
  assert.match(workspace, /visitor-birthday-card/);
  assert.match(workspace, /Filtrar visitantes por categoria/);
  assert.match(workspace, /Possível cadastro duplicado/);
  assert.match(workspace, /Excluir cadastro/);
  assert.match(styles, /\.visitor-overview-grid/);
  assert.match(styles, /max-height:690px;[^}]*overflow-y:auto/);
  assert.match(visitorsApi, /const PAGE_SIZE = 10/);
  assert.match(visitorsApi, /ORDER BY v\.id DESC/);
  assert.match(categoryApi, /vc\.exibir_dashboard/);
});
