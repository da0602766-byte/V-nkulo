import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("visitors-v118", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-v118-visitantes",
    SYSTEM_OWNER_EMAIL: "owner.v118@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-12-31T23:59:59.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

test("acompanhamento fica dentro da pessoa em lista plana e responsiva", async () => {
  const [workspace, styles] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(workspace, /name="visitor-directory"/);
  assert.match(workspace, /className="visitor-inline-followup"/);
  assert.match(workspace, /Histórico e próximo cuidado desta pessoa/);
  assert.doesNotMatch(workspace, /<aside className="followup-panel">/);
  assert.match(styles, /diretório plano: sem cartões aninhados/);
  assert.match(styles, /\.visitor-inline-contact/);
  assert.match(styles, /@media \(max-width:680px\)[\s\S]*\.visitor-inline-section \.pilot-form/);
});

test("faixas etárias classificam e migram visitantes no backend sem cruzar comunidades", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastora V118",
    email: "pastora.v118@example.test",
    senha: "Visitantes118",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const foreignCategoryId = Number(database.prepare(
    `INSERT INTO visitante_categorias
     (comunidade_id, nome, descricao, icone, cor, ordem, migracao_automatica)
     VALUES (2, 'Categoria externa V118', '', '◎', '#7357e8', 0, 0)`,
  ).run().lastInsertRowid);
  const worker = await loadWorker();
  const env = createEnv(d1);
  const cookie = await login(worker, env, "pastora.v118@example.test", "Visitantes118");

  const teen = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "POST",
    cookie,
    body: {
      nome: "TEEN V118",
      descricao: "Até dezesseis anos",
      icone: "✦",
      cor: "#12a879",
      migracaoAutomatica: true,
      idadeMaxima: 16,
    },
  });
  assert.equal(teen.response.status, 201, JSON.stringify(teen.body));

  const adult = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "POST",
    cookie,
    body: {
      nome: "O2 V118",
      descricao: "A partir de dezessete anos",
      icone: "◇",
      cor: "#2f80ed",
      migracaoAutomatica: true,
      idadeMinima: 17,
    },
  });
  assert.equal(adult.response.status, 201, JSON.stringify(adult.body));

  const overlap = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "POST",
    cookie,
    body: {
      nome: "Faixa sobreposta V118",
      descricao: "Não deve ser aceita",
      icone: "○",
      cor: "#df5b72",
      migracaoAutomatica: true,
      idadeMinima: 15,
      idadeMaxima: 18,
    },
  });
  assert.equal(overlap.response.status, 409);
  assert.match(overlap.body.error, /sobrepõe/);

  const wrongTenant = await jsonRequest(worker, env, "/api/pilot/visitantes", {
    method: "POST",
    cookie,
    body: visitorPayload("Pessoa externa V118", yearsAgo(16), foreignCategoryId),
  });
  assert.equal(wrongTenant.response.status, 400);
  assert.match(wrongTenant.body.error, /comunidade ativa/);

  const created = await jsonRequest(worker, env, "/api/pilot/visitantes", {
    method: "POST",
    cookie,
    body: visitorPayload("Transição Etária V118", yearsAgo(16), null),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));

  const teenList = await jsonRequest(worker, env, "/api/pilot/visitantes?busca=Transi%C3%A7%C3%A3o", { cookie });
  assert.equal(teenList.response.status, 200);
  assert.equal(teenList.body.visitantes[0].categoria_nome, "TEEN V118");

  const migrated = await jsonRequest(worker, env, `/api/pilot/visitantes/${created.body.id}`, {
    method: "PATCH",
    cookie,
    body: visitorPayload("Transição Etária V118", yearsAgo(20), teen.body.id),
  });
  assert.equal(migrated.response.status, 200, JSON.stringify(migrated.body));

  const adultList = await jsonRequest(worker, env, "/api/pilot/visitantes?busca=Transi%C3%A7%C3%A3o", { cookie });
  assert.equal(adultList.response.status, 200);
  assert.equal(adultList.body.visitantes[0].categoria_nome, "O2 V118");
  assert.equal(
    database.prepare("SELECT categoria_id FROM visitantes WHERE id = ?").get(created.body.id).categoria_id,
    adult.body.id,
  );
  database.close();
});

function visitorPayload(nomeCompleto, dataNascimento, categoriaId) {
  return {
    nomeCompleto,
    dataNascimento,
    telefone: "47999998888",
    email: "transicao.v118@example.test",
    batizado: "NAO_INFORMADO",
    status: "NOVO",
    dataEntrada: new Date().toISOString().slice(0, 10),
    categoriaId,
  };
}

function yearsAgo(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function login(worker, env, email, senha) {
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, senha }),
    }),
    env,
    context,
  );
  assert.equal(response.status, 303);
  return getCookie(response, "__Host-adote_session");
}

async function jsonRequest(worker, env, path, options = {}) {
  const headers = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    env,
    context,
  );
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function getCookie(response, name) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const cookie = values.map((value) => value.match(new RegExp(`${name}=[^;]+`))?.[0]).find(Boolean);
  assert.ok(cookie, `cookie ausente: ${name}`);
  return cookie;
}
