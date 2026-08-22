import assert from "node:assert/strict";
import test from "node:test";
import {
  createPilotD1,
  createPilotUser,
} from "./helpers/sqlite-d1.mjs";

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("temporary-access", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-temporary-access-test",
    SYSTEM_OWNER_EMAIL: "owner.categorias@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-12-31T23:59:59.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

test("categorias de Visitantes respeitam Pastor, Líder autorizado e tenant", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Pastora de Categorias",
    email: "pastora.categorias@example.test",
    senha: "Categorias123",
    memberships: [
      { comunidadeId: 1, papel: "PASTOR" },
      { comunidadeId: 2, papel: "PASTOR" },
    ],
  });
  await createPilotUser(database, {
    nome: "Proprietária da Plataforma",
    email: "owner.categorias@example.test",
    senha: "Categorias123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const authorizedLeaderId = await createPilotUser(database, {
    nome: "Líder Autorizada",
    email: "lider.autorizada.categorias@example.test",
    senha: "Categorias123",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  await createPilotUser(database, {
    nome: "Líder Sem Autorização",
    email: "lider.comum.categorias@example.test",
    senha: "Categorias123",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  const authorizedMembership = database
    .prepare(
      `SELECT id FROM usuario_comunidades
       WHERE usuario_id = ? AND comunidade_id = 1`,
    )
    .get(authorizedLeaderId).id;
  database
    .prepare(
      `INSERT INTO oficiais_comunidade
       (usuario_comunidade_id, titulo, permissoes, atualizado_por)
       VALUES (?, 'LIDER_AUTORIZADO', 'visitor.categories.manage', ?)`,
    )
    .run(authorizedMembership, authorizedLeaderId);
  const northMinistryId = Number(database.prepare(
    `INSERT INTO ministerios_comunidade
     (comunidade_id, nome, descricao, categoria, status, responsavel_usuario_id, criado_por, atualizado_por)
     VALUES (1, 'Acolhimento Norte', '', 'OUTRO', 'ATIVO', ?, ?, ?)`,
  ).run(authorizedLeaderId, authorizedLeaderId, authorizedLeaderId).lastInsertRowid);
  const southMinistryId = Number(database.prepare(
    `INSERT INTO ministerios_comunidade
     (comunidade_id, nome, descricao, categoria, status, responsavel_usuario_id, criado_por, atualizado_por)
     VALUES (2, 'Acolhimento Sul', '', 'OUTRO', 'ATIVO', ?, ?, ?)`,
  ).run(authorizedLeaderId, authorizedLeaderId, authorizedLeaderId).lastInsertRowid);

  const worker = await loadWorker();
  const env = createEnv(d1);
  const pastorCookie = await login(worker, env, "pastora.categorias@example.test", "Categorias123");
  const ownerCookie = await login(worker, env, "owner.categorias@example.test", "Categorias123");
  const authorizedCookie = await login(worker, env, "lider.autorizada.categorias@example.test", "Categorias123");
  const commonLeaderCookie = await login(worker, env, "lider.comum.categorias@example.test", "Categorias123");

  const createNorth = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "POST",
    cookie: pastorCookie,
    body: {
      nome: "Primeira visita",
      descricao: "Acompanhamento inicial desta comunidade.",
      icone: "◎",
      cor: "#7357e8",
      ordem: 1,
      ministerioId: northMinistryId,
    },
  });
  assert.equal(createNorth.response.status, 201);
  const northCategoryId = createNorth.body.id;

  const leaderCreate = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "POST",
    cookie: authorizedCookie,
    body: {
      nome: "Retorno autorizado",
      descricao: "Criada por líder com permissão explícita.",
      icone: "◇",
      cor: "#22a06b",
      ordem: 2,
    },
  });
  assert.equal(leaderCreate.response.status, 201);
  const leaderCategoryId = leaderCreate.body.id;

  const ownerCreate = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      nome: "Categoria da proprietária",
      descricao: "Criada pela proprietária no contexto da comunidade ativa.",
      icone: "✦",
      cor: "#2563eb",
      ordem: 3,
    },
  });
  assert.equal(ownerCreate.response.status, 201);
  const ownerCategoryId = ownerCreate.body.id;

  const commonLeaderDenied = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "POST",
    cookie: commonLeaderCookie,
    body: { nome: "Não autorizada", icone: "◎", cor: "#7357e8" },
  });
  assert.equal(commonLeaderDenied.response.status, 403);

  const northList = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    cookie: pastorCookie,
  });
  assert.equal(northList.response.status, 200);
  assert.deepEqual(
    northList.body.categorias.map((item) => item.nome),
    ["Primeira visita", "Retorno autorizado", "Categoria da proprietária"],
  );
  assert.equal(northList.body.categorias[0].descricao, "Acompanhamento inicial desta comunidade.");
  assert.equal(northList.body.categorias[0].ministerio_id, northMinistryId);
  assert.equal(northList.body.categorias[0].ministerio_nome, "Acolhimento Norte");
  assert.ok(northList.body.meses.length === 6);

  const reorder = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "PUT",
    cookie: pastorCookie,
    body: { ids: [leaderCategoryId, northCategoryId, ownerCategoryId] },
  });
  assert.equal(reorder.response.status, 200);
  const reorderedList = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    cookie: pastorCookie,
  });
  assert.deepEqual(
    reorderedList.body.categorias.map((item) => item.id),
    [leaderCategoryId, northCategoryId, ownerCategoryId],
  );

  const commonLeaderReorderDenied = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "PUT",
    cookie: commonLeaderCookie,
    body: { ids: [northCategoryId, leaderCategoryId, ownerCategoryId] },
  });
  assert.equal(commonLeaderReorderDenied.response.status, 403);

  const crossTenantMinistry = await jsonRequest(
    worker,
    env,
    `/api/pilot/visitante-categorias/${northCategoryId}`,
    {
      method: "PATCH",
      cookie: pastorCookie,
      body: {
        nome: "Primeira visita",
        descricao: "Acompanhamento inicial desta comunidade.",
        icone: "◎",
        cor: "#7357e8",
        ordem: 1,
        ministerioId: southMinistryId,
      },
    },
  );
  assert.equal(crossTenantMinistry.response.status, 400);

  const visitorId = Number(database.prepare(
    `INSERT INTO visitantes
     (comunidade_id, nome_completo, telefone, batizado, status, data_entrada,
      categoria_id, criado_por, ativo, escopo_confirmado, criado_em)
     VALUES (1, 'Contato WhatsApp', '51999999999', 'NAO_INFORMADO', 'NOVO',
       date('now'), ?, 'pastora.categorias@example.test', 1, 1, CURRENT_TIMESTAMP)`,
  ).run(northCategoryId).lastInsertRowid);
  const growthList = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    cookie: pastorCookie,
  });
  assert.equal(growthList.body.categorias.find((item) => item.id === northCategoryId).total_visitantes, 1);
  assert.ok(growthList.body.crescimento.some((item) => item.categoria_id === northCategoryId && item.novos === 1));
  const ministryList = await jsonRequest(worker, env, "/api/pilot/ministerios", {
    cookie: pastorCookie,
  });
  const northMinistry = ministryList.body.ministerios.find((item) => item.id === northMinistryId);
  assert.equal(northMinistry.categorias_visitantes[0].nome, "Primeira visita");

  const switchSouth = await jsonRequest(worker, env, "/api/pilot/comunidade-ativa", {
    method: "POST",
    cookie: pastorCookie,
    body: { comunidadeId: 2 },
  });
  assert.equal(switchSouth.response.status, 200);
  const southCommunityCookie = getCookie(switchSouth.response, "__Host-vinkulo_community");
  const southCookies = `${pastorCookie}; ${southCommunityCookie}`;
  const southList = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    cookie: southCookies,
  });
  assert.equal(southList.response.status, 200);
  assert.deepEqual(southList.body.categorias, []);

  const crossTenantReorder = await jsonRequest(worker, env, "/api/pilot/visitante-categorias", {
    method: "PUT",
    cookie: southCookies,
    body: { ids: [leaderCategoryId, northCategoryId, ownerCategoryId] },
  });
  assert.equal(crossTenantReorder.response.status, 409);

  const crossTenantUpdate = await jsonRequest(
    worker,
    env,
    `/api/pilot/visitante-categorias/${northCategoryId}`,
    {
      method: "PATCH",
      cookie: southCookies,
      body: {
        nome: "Tentativa cruzada",
        descricao: "",
        icone: "◎",
        cor: "#7357e8",
      },
    },
  );
  assert.equal(crossTenantUpdate.response.status, 404);

  database.prepare("UPDATE visitantes SET ativo = 0 WHERE id = ?").run(visitorId);

  const deactivate = await jsonRequest(
    worker,
    env,
    `/api/pilot/visitante-categorias/${northCategoryId}`,
    { method: "DELETE", cookie: pastorCookie },
  );
  assert.equal(deactivate.response.status, 200);
  assert.equal(
    database.prepare("SELECT ativa FROM visitante_categorias WHERE id = ?").get(northCategoryId).ativa,
    0,
  );
  database.close();
});

test("acesso temporário valida pessoa, comunidade, recurso, horário, cancelamento e expiração", async () => {
  const { database, d1 } = await createPilotD1();
  const leaderId = await createPilotUser(database, {
    nome: "Líder de Estacionamento",
    email: "lider.temp@example.test",
    senha: "Temporario123",
    memberships: [{ comunidadeId: 1, papel: "LIDER" }],
  });
  const beneficiaryId = await createPilotUser(database, {
    nome: "Pessoa Escalada",
    email: "pessoa.temp@example.test",
    senha: "Temporario123",
    memberships: [
      { comunidadeId: 1, papel: "MEMBRO" },
      { comunidadeId: 2, papel: "MEMBRO" },
    ],
  });
  const secondBeneficiaryId = await createPilotUser(database, {
    nome: "Segunda Pessoa Escalada",
    email: "segunda.temp@example.test",
    senha: "Temporario123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const substituteUserId = await createPilotUser(database, {
    nome: "Pessoa Substituta",
    email: "substituta.temp@example.test",
    senha: "Temporario123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  await createPilotUser(database, {
    nome: "Conta Incorreta",
    email: "errada.temp@example.test",
    senha: "Temporario123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const ministryId = Number(
    database.prepare(
      `INSERT INTO ministerios_comunidade
       (comunidade_id, nome, descricao, categoria, status,
        responsavel_usuario_id, criado_por, atualizado_por)
       VALUES (1, 'Estacionamento Temporário', '', 'ESTACIONAMENTO', 'ATIVO', ?, ?, ?)`,
    ).run(leaderId, leaderId, leaderId).lastInsertRowid,
  );
  const volunteerId = Number(
    database.prepare(
      `INSERT INTO ministerio_voluntarios
       (comunidade_id, ministerio_id, usuario_id, funcao, papel,
        dias_disponiveis, periodo_preferido, ativo)
       VALUES (1, ?, ?, 'Entrada', 'VOLUNTARIO', '[]', 'FLEXIVEL', 1)`,
    ).run(ministryId, beneficiaryId).lastInsertRowid,
  );
  const secondVolunteerId = Number(
    database.prepare(
      `INSERT INTO ministerio_voluntarios
       (comunidade_id, ministerio_id, usuario_id, funcao, papel,
        dias_disponiveis, periodo_preferido, ativo)
       VALUES (1, ?, ?, 'Apoio', 'VOLUNTARIO', '[]', 'FLEXIVEL', 1)`,
    ).run(ministryId, secondBeneficiaryId).lastInsertRowid,
  );
  const substituteVolunteerId = Number(
    database.prepare(
      `INSERT INTO ministerio_voluntarios
       (comunidade_id, ministerio_id, usuario_id, funcao, papel,
        dias_disponiveis, periodo_preferido, ativo)
       VALUES (1, ?, ?, 'Reserva', 'VOLUNTARIO', '[]', 'FLEXIVEL', 1)`,
    ).run(ministryId, substituteUserId).lastInsertRowid,
  );
  const scheduleStarts = new Date(Date.now() + 60_000).toISOString();
  const scheduleEnds = new Date(Date.now() + 10 * 60_000).toISOString();
  const scheduleId = Number(
    database.prepare(
      `INSERT INTO escalas_ministerio
       (comunidade_id, ministerio_id, titulo, inicia_em, termina_em,
        local, status, observacoes, criado_por, atualizado_por)
       VALUES (1, ?, 'Plantão temporário', ?, ?, 'Entrada', 'PUBLICADA', '', ?, ?)`,
    ).run(ministryId, scheduleStarts, scheduleEnds, leaderId, leaderId).lastInsertRowid,
  );
  const designationId = Number(
    database.prepare(
      `INSERT INTO escala_designacoes
       (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status, ativo)
       VALUES (1, ?, ?, ?, 'Entrada', 'PENDENTE', 1)`,
    ).run(scheduleId, volunteerId, beneficiaryId).lastInsertRowid,
  );
  const secondDesignationId = Number(
    database.prepare(
      `INSERT INTO escala_designacoes
       (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status, ativo)
       VALUES (1, ?, ?, ?, 'Apoio', 'PENDENTE', 1)`,
    ).run(scheduleId, secondVolunteerId, secondBeneficiaryId).lastInsertRowid,
  );
  assert.ok(Number.isInteger(designationId) && designationId > 0);

  const worker = await loadWorker();
  const env = createEnv(d1);
  const leaderCookie = await login(worker, env, "lider.temp@example.test", "Temporario123");
  const beneficiaryCookie = await login(worker, env, "pessoa.temp@example.test", "Temporario123");
  const wrongCookie = await login(worker, env, "errada.temp@example.test", "Temporario123");

  const invalidLink = await jsonRequest(worker, env, `/api/acesso-temporario/${"0".repeat(64)}`);
  assert.equal(invalidLink.response.status, 404);

  const groupAccess = await jsonRequest(
    worker,
    env,
    `/api/pilot/escalas/${scheduleId}/acessos`,
    {
      method: "POST",
      cookie: leaderCookie,
      body: {
        designacaoIds: [designationId, secondDesignationId],
        recurso: "ESCALA_LEITURA",
        iniciaEm: scheduleStarts,
        terminaEm: scheduleEnds,
      },
    },
  );
  assert.equal(groupAccess.response.status, 201, JSON.stringify(groupAccess.body));
  assert.equal(groupAccess.body.acessos.length, 2);
  assert.equal(new Set(groupAccess.body.acessos.map((item) => item.token)).size, 2);
  assert.deepEqual(
    groupAccess.body.acessos.map((item) => item.beneficiarioNome),
    ["Pessoa Escalada", "Segunda Pessoa Escalada"],
  );

  const created = await createAccess(worker, env, leaderCookie, scheduleId, {
    designacaoId: designationId,
    recurso: "ESTACIONAMENTO",
    iniciaEm: scheduleStarts,
    terminaEm: scheduleEnds,
  });
  assert.equal(created.status, "AGUARDANDO_HORARIO");
  const token = created.token;

  const beforeTime = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`);
  assert.equal(beforeTime.response.status, 200);
  assert.equal(beforeTime.body.status, "AGUARDANDO_HORARIO");
  assert.equal(beforeTime.body.beneficiaryName, "Pessoa Escalada");
  assert.equal(beforeTime.body.assignmentStatus, "PENDENTE");
  const activationTooEarly = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`, {
    method: "POST",
    cookie: beneficiaryCookie,
  });
  assert.equal(activationTooEarly.response.status, 409);
  const wrongUser = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`, {
    method: "POST",
    cookie: wrongCookie,
  });
  assert.equal(wrongUser.response.status, 403);

  const activeStarts = new Date(Date.now() - 60_000).toISOString();
  database.prepare("UPDATE escalas_ministerio SET inicia_em = ? WHERE id = ?").run(activeStarts, scheduleId);
  database.prepare("UPDATE acessos_temporarios SET inicia_em = ? WHERE id = ?").run(activeStarts, created.id);
  const released = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`);
  assert.equal(released.body.status, "ATIVO");

  const requiresConfirmation = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`, {
    method: "POST",
    cookie: beneficiaryCookie,
  });
  assert.equal(requiresConfirmation.response.status, 409);
  assert.equal(requiresConfirmation.body.requiresConfirmation, true);

  const confirmation = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`, {
    method: "POST",
    cookie: beneficiaryCookie,
    body: { action: "RESPONDER_ESCALA", status: "CONFIRMADA" },
  });
  assert.equal(confirmation.response.status, 200);
  assert.equal(confirmation.body.assignmentStatus, "CONFIRMADA");
  assert.equal(confirmation.body.mayEnter, true);

  const activated = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`, {
    method: "POST",
    cookie: beneficiaryCookie,
  });
  assert.equal(activated.response.status, 200);
  assert.equal(activated.body.destination, "/painel?view=estacionamento");
  const tempCookie = getCookie(activated.response, "__Host-vinkulo_temp_access");
  const northCommunityCookie = getCookie(activated.response, "__Host-vinkulo_community");
  const activeCookies = `${beneficiaryCookie}; ${northCommunityCookie}; ${tempCookie}`;

  const parkingAllowed = await jsonRequest(worker, env, "/api/pilot/estacionamento", {
    cookie: activeCookies,
  });
  assert.equal(parkingAllowed.response.status, 200);
  const otherModuleDenied = await jsonRequest(worker, env, "/api/pilot/visitantes", {
    cookie: activeCookies,
  });
  assert.equal(otherModuleDenied.response.status, 403);

  const switchSouth = await jsonRequest(worker, env, "/api/pilot/comunidade-ativa", {
    method: "POST",
    cookie: activeCookies,
    body: { comunidadeId: 2 },
  });
  const southCommunityCookie = getCookie(switchSouth.response, "__Host-vinkulo_community");
  const wrongCommunityParking = await jsonRequest(worker, env, "/api/pilot/estacionamento", {
    cookie: `${beneficiaryCookie}; ${southCommunityCookie}; ${tempCookie}`,
  });
  assert.equal(wrongCommunityParking.response.status, 403);

  const cancelled = await jsonRequest(
    worker,
    env,
    `/api/pilot/escalas/${scheduleId}/acessos/${created.id}`,
    { method: "PATCH", cookie: leaderCookie, body: { acao: "CANCELAR" } },
  );
  assert.equal(cancelled.response.status, 200);
  const cancelledStatus = await jsonRequest(worker, env, `/api/acesso-temporario/${token}`);
  assert.equal(cancelledStatus.body.status, "CANCELADO");
  const cancelledOperation = await jsonRequest(worker, env, "/api/pilot/estacionamento", {
    cookie: activeCookies,
  });
  assert.equal(cancelledOperation.response.status, 403);

  const activeAccess = await createAccess(worker, env, leaderCookie, scheduleId, {
    designacaoId: designationId,
    recurso: "ESTACIONAMENTO",
    iniciaEm: activeStarts,
    terminaEm: scheduleEnds,
  });
  assert.equal(activeAccess.status, "ATIVO");
  database.prepare("UPDATE acessos_temporarios SET termina_em = datetime('now','-1 minute') WHERE id = ?").run(activeAccess.id);
  const expired = await jsonRequest(worker, env, `/api/acesso-temporario/${activeAccess.token}`);
  assert.equal(expired.body.status, "EXPIRADO");

  const membershipRevokedAccess = await createAccess(worker, env, leaderCookie, scheduleId, {
    designacaoId: designationId,
    recurso: "ESCALA_LEITURA",
    iniciaEm: activeStarts,
    terminaEm: scheduleEnds,
  });
  database.prepare(
    `UPDATE usuario_comunidades SET status = 'SUSPENSO'
     WHERE usuario_id = ? AND comunidade_id = 1`,
  ).run(beneficiaryId);
  const afterMembershipRevocation = await jsonRequest(
    worker,
    env,
    `/api/acesso-temporario/${membershipRevokedAccess.token}`,
  );
  assert.equal(afterMembershipRevocation.body.status, "CANCELADO");
  database.prepare(
    `UPDATE usuario_comunidades SET status = 'ATIVO'
     WHERE usuario_id = ? AND comunidade_id = 1`,
  ).run(beneficiaryId);

  const replacementScheduleId = Number(
    database.prepare(
      `INSERT INTO escalas_ministerio
       (comunidade_id, ministerio_id, titulo, inicia_em, termina_em,
        local, status, observacoes, criado_por, atualizado_por)
       VALUES (1, ?, 'Plantão com substituição', ?, ?, 'Entrada', 'PUBLICADA', '', ?, ?)`,
    ).run(ministryId, activeStarts, scheduleEnds, leaderId, leaderId).lastInsertRowid,
  );
  const replacementOriginalDesignationId = Number(
    database.prepare(
      `INSERT INTO escala_designacoes
       (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status, ativo)
       VALUES (1, ?, ?, ?, 'Entrada', 'PENDENTE', 1)`,
    ).run(replacementScheduleId, volunteerId, beneficiaryId).lastInsertRowid,
  );
  const replacementAccess = await createAccess(
    worker,
    env,
    leaderCookie,
    replacementScheduleId,
    {
      designacaoId: replacementOriginalDesignationId,
      recurso: "ESCALA_LEITURA",
      iniciaEm: activeStarts,
      terminaEm: scheduleEnds,
    },
  );
  const replacementSnapshot = await jsonRequest(
    worker,
    env,
    `/api/acesso-temporario/${replacementAccess.token}`,
    { cookie: beneficiaryCookie },
  );
  assert.ok(
    replacementSnapshot.body.replacementCandidates.some(
      (candidate) => candidate.voluntarioId === substituteVolunteerId,
    ),
  );
  const missingReplacement = await jsonRequest(
    worker,
    env,
    `/api/acesso-temporario/${replacementAccess.token}`,
    {
      method: "POST",
      cookie: beneficiaryCookie,
      body: { action: "RESPONDER_ESCALA", status: "INDISPONIVEL" },
    },
  );
  assert.equal(missingReplacement.response.status, 400);
  const substitution = await jsonRequest(
    worker,
    env,
    `/api/acesso-temporario/${replacementAccess.token}`,
    {
      method: "POST",
      cookie: beneficiaryCookie,
      body: {
        action: "RESPONDER_ESCALA",
        status: "INDISPONIVEL",
        substitutoVoluntarioId: substituteVolunteerId,
      },
    },
  );
  assert.equal(substitution.response.status, 200, JSON.stringify(substitution.body));
  assert.equal(substitution.body.replacement.candidate.usuarioId, substituteUserId);
  assert.equal(
    database.prepare("SELECT status FROM escala_designacoes WHERE id = ?").get(replacementOriginalDesignationId).status,
    "INDISPONIVEL",
  );
  const replacementDesignation = database.prepare(
    `SELECT status FROM escala_designacoes
     WHERE escala_id = ? AND voluntario_id = ? AND ativo = 1`,
  ).get(replacementScheduleId, substituteVolunteerId);
  assert.equal(replacementDesignation.status, "PENDENTE");
  const deniedHistoryDelete = await jsonRequest(
    worker,
    env,
    `/api/pilot/escalas/${replacementScheduleId}/acessos/${replacementAccess.id}`,
    { method: "DELETE", cookie: wrongCookie },
  );
  assert.equal(deniedHistoryDelete.response.status, 403);
  const deletedHistory = await jsonRequest(
    worker,
    env,
    `/api/pilot/escalas/${replacementScheduleId}/acessos/${replacementAccess.id}`,
    { method: "DELETE", cookie: leaderCookie },
  );
  assert.equal(deletedHistory.response.status, 200);
  assert.equal(
    database.prepare("SELECT id FROM acessos_temporarios WHERE id = ?").get(replacementAccess.id),
    undefined,
  );
  const deletedToken = await jsonRequest(
    worker,
    env,
    `/api/acesso-temporario/${replacementAccess.token}`,
  );
  assert.equal(deletedToken.response.status, 404);

  const scaleCancelledAccess = await createAccess(worker, env, leaderCookie, scheduleId, {
    designacaoId: designationId,
    recurso: "ESCALA_LEITURA",
    iniciaEm: activeStarts,
    terminaEm: scheduleEnds,
  });
  const cancelScale = await jsonRequest(worker, env, `/api/pilot/escalas/${scheduleId}`, {
    method: "PATCH",
    cookie: leaderCookie,
    body: { acao: "CANCELAR" },
  });
  assert.equal(cancelScale.response.status, 200);
  const afterScaleCancel = await jsonRequest(worker, env, `/api/acesso-temporario/${scaleCancelledAccess.token}`);
  assert.equal(afterScaleCancel.body.status, "CANCELADO");

  const auditEvents = database.prepare(
    `SELECT evento FROM auditoria_piloto
     WHERE comunidade_id = 1 AND evento LIKE 'ACESSO_TEMPORARIO_%'`,
  ).all().map((row) => row.evento);
  for (const event of [
    "ACESSO_TEMPORARIO_CRIADO",
    "ACESSO_TEMPORARIO_AUTORIZADO",
    "ACESSO_TEMPORARIO_LINK_GERADO",
    "ACESSO_TEMPORARIO_INICIADO",
    "ACESSO_TEMPORARIO_SESSAO_ATIVADA",
    "ACESSO_TEMPORARIO_CANCELADO",
    "ACESSO_TEMPORARIO_EXPIRADO",
    "ACESSO_TEMPORARIO_HISTORICO_EXCLUIDO",
  ]) {
    assert.ok(auditEvents.includes(event), `auditoria ausente: ${event}`);
  }

  const browserLogin = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: "pessoa.temp@example.test",
        senha: "Temporario123",
        returnTo: `/acesso/${scaleCancelledAccess.token}`,
      }),
    }),
    env,
    context,
  );
  assert.equal(browserLogin.status, 303);
  assert.equal(
    new URL(browserLogin.headers.get("location")).pathname,
    `/acesso/${scaleCancelledAccess.token}`,
  );
  database.close();
});

async function createAccess(worker, env, cookie, scheduleId, body) {
  const result = await jsonRequest(
    worker,
    env,
    `/api/pilot/escalas/${scheduleId}/acessos`,
    { method: "POST", cookie, body },
  );
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body;
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
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
  const cookie = values
    .map((value) => value.match(new RegExp(`${name}=[^;]+`))?.[0])
    .find(Boolean);
  assert.ok(cookie, `cookie ausente: ${name}`);
  return cookie;
}
