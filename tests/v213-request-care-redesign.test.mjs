import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v213", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}
function createEnv(d1) {
  return { DB: d1, AUTH_SECRET: "segredo-ficticio-pedidos-v213", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
}
async function login(worker, env, email) {
  const response = await worker.fetch(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, senha: "Pedidos123" }),
  }), env, context);
  assert.equal(response.status, 303);
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  const cookie = values.map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0]).find(Boolean);
  assert.ok(cookie);
  return cookie;
}
async function call(worker, env, cookie, path, body, method = body ? "PATCH" : "GET") {
  const response = await worker.fetch(new Request(`http://localhost${path}`, {
    method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }), env, context);
  return { response, data: await response.json() };
}

test("Pedidos V213 separa acolhimento e operação sem duplicar a base", async () => {
  const [component, css, schema, migration, api, central] = await Promise.all([
    read("app/components/RequestsWorkspace.tsx"), read("app/globals.css"), read("db/schema.ts"),
    read("drizzle/0067_request_care_operations.sql"), read("app/api/pilot/solicitacoes/route.ts"),
    read("app/api/pilot/solicitacoes/central/route.ts"),
  ]);
  for (const copy of ["Estamos com você", "Meus pedidos", "Painel de atendimento", "Visitante aguardando retorno", "Já atendidos", "Nota interna da equipe", "Enviar atualização ao membro"]) assert.match(component, new RegExp(copy));
  assert.match(component, /request-mode-switch/);
  assert.match(component, /request-operations-table/);
  assert.match(component, /request-mobile-list/);
  assert.match(css, /@media \(max-width:760px\)[\s\S]*\.request-operations-table \{ display:none; \}/);
  assert.match(css, /\.request-mobile-list \{ display:grid;/);
  assert.match(migration, /ALTER TABLE `solicitacao_repositorio_itens` ADD `prioridade`/);
  assert.match(migration, /CREATE TABLE `solicitacao_eventos`/);
  assert.match(schema, /export const solicitacaoEventos/);
  assert.match(api, /s\.solicitante_id = \?/);
  assert.match(api, /s\.comunidade_id = \?/);
  assert.match(central, /PEDIDO_EVENTO_REGISTRADO/);
  assert.match(central, /m\.responsavel_usuario_id = \?/);
});

test("Pedidos V213 protege notas, permissões e comunidades durante todo o atendimento", async () => {
  const { database, d1 } = await createPilotD1();
  const pastorId = await createPilotUser(database, { nome: "Pastor V213", email: "pastor.v213@example.test", senha: "Pedidos123", memberships: [{ comunidadeId: 1, papel: "PASTOR" }] });
  const memberId = await createPilotUser(database, { nome: "Membro V213", email: "membro.v213@example.test", senha: "Pedidos123", memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  const officialId = await createPilotUser(database, { nome: "Oficial V213", email: "oficial.v213@example.test", senha: "Pedidos123", memberships: [{ comunidadeId: 1, papel: "LIDER" }] });
  await createPilotUser(database, { nome: "Líder sem delegação V213", email: "lider.v213@example.test", senha: "Pedidos123", memberships: [{ comunidadeId: 1, papel: "LIDER" }] });
  await createPilotUser(database, { nome: "Outro Membro V213", email: "outro.v213@example.test", senha: "Pedidos123", memberships: [{ comunidadeId: 1, papel: "MEMBRO" }] });
  await createPilotUser(database, { nome: "Membro Sul V213", email: "sul.v213@example.test", senha: "Pedidos123", memberships: [{ comunidadeId: 2, papel: "MEMBRO" }] });
  database.prepare("UPDATE usuarios SET telefone = ? WHERE id = ?").run("(11) 99999-0213", memberId);
  const officialMembershipId = Number(database.prepare("SELECT id FROM usuario_comunidades WHERE usuario_id = ? AND comunidade_id = 1").get(officialId).id);
  database.prepare("INSERT INTO oficiais_comunidade (usuario_comunidade_id, titulo, permissoes, atualizado_por) VALUES (?, 'PRESBITERO', 'requests.manage', ?)").run(officialMembershipId, officialId);

  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(worker, env, "pastor.v213@example.test");
  const memberCookie = await login(worker, env, "membro.v213@example.test");
  const officialCookie = await login(worker, env, "oficial.v213@example.test");
  const leaderCookie = await login(worker, env, "lider.v213@example.test");
  const otherCookie = await login(worker, env, "outro.v213@example.test");
  const southCookie = await login(worker, env, "sul.v213@example.test");

  const created = await call(worker, env, memberCookie, "/api/pilot/solicitacoes", {
    tipo: "ORACAO", titulo: "Oração pela família V213", descricao: "Pedido privado para acompanhamento da família.",
    visibilidade: "PRIVADA", preferenciaContato: "WHATSAPP", disponibilidade: "No período da noite", contatoAutorizado: true,
  }, "POST");
  assert.equal(created.response.status, 201);
  const requestId = Number(created.data.id);

  const own = await call(worker, env, memberCookie, "/api/pilot/solicitacoes");
  assert.equal(own.response.status, 200);
  assert.equal(own.data.solicitacoes.find((item) => item.id === requestId).is_mine, 1);
  assert.equal(own.data.solicitacoes.find((item) => item.id === requestId).preferencia_contato, "WHATSAPP");
  const stranger = await call(worker, env, otherCookie, "/api/pilot/solicitacoes");
  assert.equal(stranger.data.solicitacoes.some((item) => item.id === requestId), false);

  const central = await call(worker, env, pastorCookie, "/api/pilot/solicitacoes/central");
  assert.equal(central.response.status, 200);
  assert.equal(central.data.canOperate, true);
  const repositoryItem = central.data.repositories.flatMap((item) => item.items).find((item) => item.solicitacao_id === requestId);
  assert.ok(repositoryItem);
  const officialCentral = await call(worker, env, officialCookie, "/api/pilot/solicitacoes/central");
  assert.equal(officialCentral.data.canOperate, true);
  assert.ok(officialCentral.data.repositories.flatMap((item) => item.items).some((item) => item.solicitacao_id === requestId));
  const leaderCentral = await call(worker, env, leaderCookie, "/api/pilot/solicitacoes/central");
  assert.equal(leaderCentral.data.canOperate, false);
  assert.equal(leaderCentral.data.repositories.flatMap((item) => item.items).some((item) => item.solicitacao_id === requestId), false);

  const assume = await call(worker, env, pastorCookie, "/api/pilot/solicitacoes/central", { action: "ASSUMIR_ITEM", itemId: repositoryItem.id });
  assert.equal(assume.response.status, 200);
  const note = await call(worker, env, pastorCookie, "/api/pilot/solicitacoes/central", { action: "ADICIONAR_EVENTO", itemId: repositoryItem.id, tipo: "NOTA_INTERNA", mensagem: "Conteúdo interno protegido V213." });
  assert.equal(note.response.status, 200);
  const memberNoteAttempt = await call(worker, env, memberCookie, "/api/pilot/solicitacoes/central", { action: "ADICIONAR_EVENTO", itemId: repositoryItem.id, tipo: "NOTA_INTERNA", mensagem: "Tentativa indevida." });
  assert.equal(memberNoteAttempt.response.status, 403);
  const crossTenantAttempt = await call(worker, env, southCookie, "/api/pilot/solicitacoes/central", { action: "ASSUMIR_ITEM", itemId: repositoryItem.id });
  assert.ok([403, 404].includes(crossTenantAttempt.response.status));

  const memberAfterNote = await call(worker, env, memberCookie, "/api/pilot/solicitacoes");
  assert.doesNotMatch(JSON.stringify(memberAfterNote.data), /Conteúdo interno protegido V213/);
  const pastorAfterNote = await call(worker, env, pastorCookie, "/api/pilot/solicitacoes/central");
  assert.match(JSON.stringify(pastorAfterNote.data), /Conteúdo interno protegido V213/);

  const update = await call(worker, env, pastorCookie, "/api/pilot/solicitacoes/central", {
    action: "ATUALIZAR_ITEM", itemId: repositoryItem.id, status: "EM_ORACAO", prioridade: "URGENTE",
    proximoRetornoEm: "2027-01-10T19:00:00.000Z", mensagemAtendimento: "Seguimos em oração com você.",
  });
  assert.equal(update.response.status, 200);
  const answered = await call(worker, env, memberCookie, "/api/pilot/solicitacoes", {
    action: "CONFIRMAR_ORACAO_ATENDIDA", id: requestId, testemunho: "Resposta recebida.", testemunhoPermissao: "NAO_PERMITIR",
  });
  assert.equal(answered.response.status, 200);
  assert.equal(database.prepare("SELECT status FROM solicitacoes_comunidade WHERE id = ?").get(requestId).status, "CONCLUIDA");
  assert.equal(database.prepare("SELECT status FROM solicitacao_repositorio_itens WHERE id = ?").get(repositoryItem.id).status, "ORACAO_ATENDIDA");
  assert.equal(database.prepare("SELECT responsavel_usuario_id FROM solicitacao_repositorio_itens WHERE id = ?").get(repositoryItem.id).responsavel_usuario_id, pastorId);

  const visit = await call(worker, env, memberCookie, "/api/pilot/solicitacoes", {
    tipo: "VISITA", titulo: "Visita para minha família V213", descricao: "Gostaria de receber uma visita da comunidade.",
    visibilidade: "PRIVADA", preferenciaContato: "TELEFONE", disponibilidade: "Sábado pela manhã", dataPreferencial: "2027-02-20T12:00:00.000Z", contatoAutorizado: true,
  }, "POST");
  assert.equal(visit.response.status, 201);
  const visitId = Number(visit.data.id);
  const officialAfterVisit = await call(worker, env, officialCookie, "/api/pilot/solicitacoes/central");
  const visitItem = officialAfterVisit.data.repositories.flatMap((item) => item.items).find((item) => item.solicitacao_id === visitId);
  assert.ok(visitItem);
  assert.equal((await call(worker, env, officialCookie, "/api/pilot/solicitacoes/central", { action: "ASSUMIR_ITEM", itemId: visitItem.id })).response.status, 200);
  assert.equal((await call(worker, env, officialCookie, "/api/pilot/solicitacoes/central", {
    action: "ATUALIZAR_ITEM", itemId: visitItem.id, status: "VISITA_AGENDADA", prioridade: "NORMAL",
    visitaAgendadaEm: "2027-02-20T12:00:00.000Z", proximoRetornoEm: "2027-02-21T15:00:00.000Z", mensagemAtendimento: "Sua visita foi agendada.",
  })).response.status, 200);
  assert.equal((await call(worker, env, officialCookie, "/api/pilot/solicitacoes/central", {
    action: "TRANSFERIR_ITEM", itemId: visitItem.id, userId: pastorId,
  })).response.status, 200);
  assert.equal((await call(worker, env, pastorCookie, "/api/pilot/solicitacoes/central", {
    action: "ATUALIZAR_ITEM", itemId: visitItem.id, status: "VISITA_CONCLUIDA", prioridade: "NORMAL", resultado: "Família acolhida e retorno combinado.",
  })).response.status, 200);
  const memberAfterVisit = await call(worker, env, memberCookie, "/api/pilot/solicitacoes");
  const ownVisit = memberAfterVisit.data.solicitacoes.find((item) => item.id === visitId);
  assert.equal(ownVisit.operacional_status, "VISITA_CONCLUIDA");
  assert.equal(ownVisit.ultima_atualizacao, "Situação alterada para visita concluida.");
  assert.equal(database.prepare("SELECT resultado FROM solicitacao_repositorio_itens WHERE id = ?").get(visitItem.id).resultado, "Família acolhida e retorno combinado.");
  database.close();
});
