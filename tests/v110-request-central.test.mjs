import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v110", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-exclusivo-central-v110",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function login(worker, env, email, senha) {
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, senha }),
    }),
    env,
    context,
  );
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const cookie = values.map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(cookie);
  return cookie;
}

async function api(worker, env, cookie, path, body) {
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, {
      method: body ? "PATCH" : "GET",
      headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    context,
  );
  return { response, data: await response.json() };
}

test("Central V110 implementa categorias, dashboard compacto e confirmação antes do WhatsApp", async () => {
  const component = await readFile(new URL("../app/components/RequestsWorkspace.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const apiSource = await readFile(new URL("../app/api/pilot/solicitacoes/central/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0045_funny_thaddeus_ross.sql", import.meta.url), "utf8");
  for (const category of ["ORACAO", "VISITA", "ACONSELHAMENTO", "APOIO", "MINISTERIO", "OUTRO"]) {
    assert.match(component, new RegExp(category));
  }
  assert.match(component, /request-dashboard/);
  assert.match(component, /request-category-tabs/);
  assert.match(component, /CONFIRMAR CONTATO/);
  assert.match(component, /window\.open\(pendingPastor\.whatsappUrl/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(apiSource, /communityId/);
  assert.match(apiSource, /access\.context\.papel !== "PASTOR"/);
  assert.match(apiSource, /m\.responsavel_usuario_id = \?/);
  assert.match(migration, /CREATE TABLE `solicitacao_repositorios`/);
  assert.match(migration, /CREATE TABLE `solicitacao_repositorio_itens`/);
  assert.match(migration, /CREATE TABLE `pastor_whatsapp_preferencias`/);
  assert.doesNotMatch(migration, /CREATE TABLE `acessos_temporarios`/);
});

test("Central V110 isola comunidades, exige opt-in e restringe repositórios no backend", async () => {
  const { database, d1 } = await createPilotD1();
  const pastorId = await createPilotUser(database, {
    nome: "Pastor Central", email: "pastor.central@example.test", senha: "Central123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  const memberId = await createPilotUser(database, {
    nome: "Membro Central", email: "membro.central@example.test", senha: "Central123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const leaderId = await createPilotUser(database, {
    nome: "Responsável Visitas", email: "lider.central@example.test", senha: "Central123",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  await createPilotUser(database, {
    nome: "Membro Sul Central", email: "sul.central@example.test", senha: "Central123",
    memberships: [{ comunidadeId: 2, papel: "MEMBRO" }],
  });
  database.prepare("UPDATE usuarios SET telefone = ? WHERE id = ?").run("(11) 99999-0001", pastorId);
  database.prepare("UPDATE usuarios SET telefone = ? WHERE id = ?").run("(11) 98888-0002", memberId);
  const ministryId = Number(database.prepare(
    `INSERT INTO ministerios_comunidade
     (comunidade_id, nome, descricao, categoria, status, responsavel_usuario_id, criado_por)
     VALUES (1, 'Cuidado Pastoral', 'Acompanhamento de pedidos', 'PASTORAL', 'ATIVO', ?, ?)`
  ).run(leaderId, pastorId).lastInsertRowid);

  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(worker, env, "pastor.central@example.test", "Central123");
  const memberCookie = await login(worker, env, "membro.central@example.test", "Central123");
  const leaderCookie = await login(worker, env, "lider.central@example.test", "Central123");
  const southCookie = await login(worker, env, "sul.central@example.test", "Central123");

  const initialPastor = await api(worker, env, pastorCookie, "/api/pilot/solicitacoes/central");
  assert.equal(initialPastor.response.status, 200);
  assert.deepEqual(initialPastor.data.repositories.map((item) => item.tipo).sort(), ["ORACAO", "VISITA"]);
  assert.ok(initialPastor.data.repositories.every((item) => item.status === "SUGERIDO"));
  assert.deepEqual(initialPastor.data.pastoresContato, []);

  const memberToggle = await api(worker, env, memberCookie, "/api/pilot/solicitacoes/central", {
    action: "TOGGLE_WHATSAPP", enabled: true,
  });
  assert.equal(memberToggle.response.status, 403);
  const pastorToggle = await api(worker, env, pastorCookie, "/api/pilot/solicitacoes/central", {
    action: "TOGGLE_WHATSAPP", enabled: true,
  });
  assert.equal(pastorToggle.response.status, 200);

  const memberCentral = await api(worker, env, memberCookie, "/api/pilot/solicitacoes/central");
  assert.equal(memberCentral.response.status, 200);
  assert.equal(memberCentral.data.repositories.length, 0);
  assert.equal(memberCentral.data.pastoresContato.length, 1);
  assert.equal(memberCentral.data.pastoresContato[0].nome, "Pastor Central");
  assert.equal(memberCentral.data.pastoresContato[0].whatsappUrl, "https://wa.me/5511999990001");

  const southCentral = await api(worker, env, southCookie, "/api/pilot/solicitacoes/central");
  assert.equal(southCentral.response.status, 200);
  assert.equal(southCentral.data.pastoresContato.length, 0);
  assert.equal(southCentral.data.repositories.length, 0);

  const prayerRepository = initialPastor.data.repositories.find((item) => item.tipo === "ORACAO");
  const memberConfirm = await api(worker, env, memberCookie, "/api/pilot/solicitacoes/central", {
    action: "CONFIRMAR_REPOSITORIO", repositoryId: prayerRepository.id, ministryId,
  });
  assert.equal(memberConfirm.response.status, 403);
  const pastorConfirm = await api(worker, env, pastorCookie, "/api/pilot/solicitacoes/central", {
    action: "CONFIRMAR_REPOSITORIO", repositoryId: prayerRepository.id, ministryId,
  });
  assert.equal(pastorConfirm.response.status, 200);

  const createRequest = await worker.fetch(
    new Request("http://localhost/api/pilot/solicitacoes", {
      method: "POST",
      headers: { cookie: memberCookie, "content-type": "application/json" },
      body: JSON.stringify({
        tipo: "ORACAO", titulo: "Oração pela família",
        descricao: "Pedido de acompanhamento pastoral para a família.",
        visibilidade: "PASTORAL",
      }),
    }),
    env,
    context,
  );
  assert.equal(createRequest.status, 201);
  const requestId = Number((await createRequest.json()).id);
  const forward = await api(worker, env, pastorCookie, "/api/pilot/solicitacoes/central", {
    action: "ENCAMINHAR_REPOSITORIO", repositoryId: prayerRepository.id, requestId,
  });
  assert.equal(forward.response.status, 200);

  const leaderCentral = await api(worker, env, leaderCookie, "/api/pilot/solicitacoes/central");
  assert.equal(leaderCentral.response.status, 200);
  assert.equal(leaderCentral.data.repositories.length, 1);
  assert.equal(leaderCentral.data.repositories[0].ministerio_nome, "Cuidado Pastoral");
  assert.equal(leaderCentral.data.repositories[0].items.length, 1);
  assert.equal(leaderCentral.data.repositories[0].items[0].solicitante_nome, "Membro Central");
  assert.equal(leaderCentral.data.repositories[0].items[0].solicitante_telefone, "(11) 98888-0002");

  const updateItem = await api(worker, env, leaderCookie, "/api/pilot/solicitacoes/central", {
    action: "ATUALIZAR_ITEM", itemId: leaderCentral.data.repositories[0].items[0].id,
    status: "EM_ORACAO",
    mensagemAtendimento: "Seguimos em oração e entregamos uma mensagem de cuidado.",
  });
  assert.equal(updateItem.response.status, 200);
  const crossTenantForward = await api(worker, env, southCookie, "/api/pilot/solicitacoes/central", {
    action: "ENCAMINHAR_REPOSITORIO", repositoryId: prayerRepository.id, requestId,
  });
  assert.equal(crossTenantForward.response.status, 403);

  const after = await api(worker, env, pastorCookie, "/api/pilot/solicitacoes/central");
  assert.equal(after.data.repositories.find((item) => item.tipo === "ORACAO").status, "ATIVO");
  assert.equal(after.data.repositories.filter((item) => item.tipo === "ORACAO" && item.status === "SUGERIDO").length, 0);
  assert.equal(database.prepare("SELECT status FROM solicitacoes_comunidade WHERE id = ?").get(requestId).status, "EM_ANALISE");
  database.close();
});
