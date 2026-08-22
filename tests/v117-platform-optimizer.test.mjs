import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";

function createContext() {
  const pending = [];
  return {
    waitUntil(promise) { pending.push(promise); },
    passThroughOnException() {},
    async drain() {
      await Promise.allSettled(pending.splice(0));
    },
  };
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("v117", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-exclusivo-otimizador-v117",
    SYSTEM_OWNER_EMAIL: "owner.optimizer@example.test",
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-12-31T23:59:59.000Z",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function login(worker, env, context, email, senha) {
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

async function optimizerApi(worker, env, context, cookie, body) {
  const response = await worker.fetch(
    new Request("http://localhost/api/proprietario/otimizacao", {
      method: body ? "PATCH" : "GET",
      headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    context,
  );
  return { response, data: await response.json() };
}

test("otimizador possui painel compacto, execução periódica e limites explícitos", async () => {
  const [component, route, optimizer, worker, owner, css] = await Promise.all([
    readFile(new URL("../app/components/PlatformOptimizerWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/proprietario/otimizacao/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform-optimizer.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/OwnerWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(owner, /id: "optimization", label: "Otimização"/);
  assert.match(component, /Otimizador da plataforma/);
  assert.match(component, /não remove usuários, comunidades, ministérios, publicações, imagens, arquivos/);
  assert.match(component, /Todos os dias/);
  assert.match(component, /Toda semana/);
  assert.match(component, /A cada 30 dias/);
  assert.match(route, /!user\.ativo \|\| !user\.system_owner/);
  assert.match(worker, /ctx\.waitUntil/);
  assert.match(worker, /runPlatformOptimizationIfDue/);
  assert.match(optimizer, /WHERE status IN \('APROVADA', 'RECUSADA'\)/);
  assert.match(optimizer, /SET status = 'EXPIRADO'/);
  assert.doesNotMatch(optimizer, /DELETE FROM acessos_temporarios/);
  assert.doesNotMatch(optimizer, /DELETE FROM usuarios/);
  assert.doesNotMatch(optimizer, /DELETE FROM comunidades/);
  assert.match(css, /\.platform-optimizer-candidates>div \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:620px\)/);
});

test("backend limita o otimizador ao proprietário e preserva registros ativos", async () => {
  const { database, d1 } = await createPilotD1();
  const ownerId = await createPilotUser(database, {
    nome: "Proprietário Otimizador",
    email: "owner.optimizer@example.test",
    senha: "Optimizer123",
    memberships: [{ comunidadeId: 1, papel: "ADMIN_COMUNIDADE" }],
  });
  const commonId = await createPilotUser(database, {
    nome: "Pessoa Comum",
    email: "common.optimizer@example.test",
    senha: "Optimizer123",
    memberships: [{ comunidadeId: 1, papel: "MEMBRO" }],
  });
  const pendingId = await createPilotUser(database, {
    nome: "Solicitante Pendente",
    email: "pending.optimizer@example.test",
    senha: "Optimizer123",
    memberships: [],
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const context = createContext();
  const ownerCookie = await login(worker, env, context, "owner.optimizer@example.test", "Optimizer123");
  await context.drain();
  const commonCookie = await login(worker, env, context, "common.optimizer@example.test", "Optimizer123");
  await context.drain();

  const denied = await optimizerApi(worker, env, context, commonCookie);
  assert.equal(denied.response.status, 403);

  database.prepare(
    "INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES (?, 'expired-v117', datetime('now', '-1 day'))",
  ).run(commonId);
  database.prepare(
    "INSERT INTO redefinicoes_senha (usuario_id, token_hash, expira_em, usado) VALUES (?, 'reset-v117', datetime('now', '-1 hour'), 0)",
  ).run(commonId);
  database.prepare(
    `INSERT INTO solicitacoes_entrada_comunidade
      (comunidade_id, usuario_id, mensagem, status, analisado_por, solicitado_em, analisado_em, atualizado_em)
     VALUES (1, ?, 'Concluída antiga', 'APROVADA', ?, datetime('now', '-9 days'), datetime('now', '-8 days'), datetime('now', '-8 days'))`,
  ).run(commonId, ownerId);
  database.prepare(
    `INSERT INTO solicitacoes_entrada_comunidade
      (comunidade_id, usuario_id, mensagem, status, solicitado_em, atualizado_em)
     VALUES (1, ?, 'Ainda pendente', 'PENDENTE', datetime('now', '-20 days'), datetime('now', '-20 days'))`,
  ).run(pendingId);
  database.prepare(
    `INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados, criado_em)
     VALUES (1, ?, 'REGISTRO_ANTIGO_V117', 'SUCESSO', '{}', datetime('now', '-15 days'))`,
  ).run(ownerId);
  database.prepare(
    `INSERT INTO convites_comunidade
      (comunidade_id, email, papel, token_hash, status, expira_em, criado_por)
     VALUES (1, 'expired.invite@example.test', 'MEMBRO', 'invite-v117', 'PENDENTE', datetime('now', '-1 day'), ?)`,
  ).run(ownerId);

  const ministryId = Number(database.prepare(
    `INSERT INTO ministerios_comunidade
      (comunidade_id, nome, descricao, categoria, status, criado_por)
     VALUES (1, 'Manutenção V117', '', 'OUTRO', 'ATIVO', ?)`,
  ).run(ownerId).lastInsertRowid);
  const volunteerId = Number(database.prepare(
    `INSERT INTO ministerio_voluntarios
      (comunidade_id, ministerio_id, usuario_id, funcao, papel, ativo)
     VALUES (1, ?, ?, 'Apoio', 'VOLUNTARIO', 1)`,
  ).run(ministryId, commonId).lastInsertRowid);
  const scaleId = Number(database.prepare(
    `INSERT INTO escalas_ministerio
      (comunidade_id, ministerio_id, titulo, inicia_em, termina_em, status, criado_por)
     VALUES (1, ?, 'Escala encerrada', datetime('now', '-2 days'), datetime('now', '-1 day'), 'PUBLICADA', ?)`,
  ).run(ministryId, ownerId).lastInsertRowid);
  const designationId = Number(database.prepare(
    `INSERT INTO escala_designacoes
      (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status, ativo)
     VALUES (1, ?, ?, ?, 'Apoio', 'CONFIRMADO', 1)`,
  ).run(scaleId, volunteerId, commonId).lastInsertRowid);
  database.prepare(
    `INSERT INTO acessos_temporarios
      (comunidade_id, escala_id, designacao_id, beneficiario_usuario_id, recurso,
       token_hash, token_hint, inicia_em, termina_em, status, autorizado_por, criado_por)
     VALUES (1, ?, ?, ?, 'ESCALA_LEITURA', 'temporary-v117', 'v117',
       datetime('now', '-2 days'), datetime('now', '-1 day'), 'ATIVO', ?, ?)`,
  ).run(scaleId, designationId, commonId, ownerId, ownerId);

  const before = await optimizerApi(worker, env, context, ownerCookie);
  assert.equal(before.response.status, 200);
  assert.deepEqual(before.data.candidates, {
    expiredSessions: 1,
    expiredPasswordResets: 1,
    resolvedJoinRequests: 1,
    oldAuditRecords: 1,
    expiredInvites: 1,
    expiredTemporaryAccesses: 1,
  });

  const configured = await optimizerApi(worker, env, context, ownerCookie, {
    action: "CONFIGURAR", enabled: true, intervalHours: 24,
  });
  assert.equal(configured.response.status, 200);
  assert.equal(configured.data.config.intervalHours, 24);

  const executed = await optimizerApi(worker, env, context, ownerCookie, { action: "EXECUTAR_AGORA" });
  assert.equal(executed.response.status, 200);
  assert.equal(executed.data.execution.executed, true);
  assert.deepEqual(executed.data.execution.result.counts, {
    expiredSessions: 1,
    expiredPasswordResets: 1,
    resolvedJoinRequests: 1,
    oldAuditRecords: 1,
    expiredInvites: 1,
    expiredTemporaryAccesses: 1,
  });
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sessoes WHERE token_hash = 'expired-v117'").get().total, 0);
  assert.ok(database.prepare("SELECT COUNT(*) AS total FROM sessoes WHERE usuario_id = ?").get(ownerId).total >= 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM solicitacoes_entrada_comunidade WHERE usuario_id = ?").get(commonId).total, 0);
  assert.equal(database.prepare("SELECT status FROM solicitacoes_entrada_comunidade WHERE usuario_id = ?").get(pendingId).status, "PENDENTE");
  assert.equal(database.prepare("SELECT status FROM convites_comunidade WHERE token_hash = 'invite-v117'").get().status, "EXPIRADO");
  assert.equal(database.prepare("SELECT status FROM acessos_temporarios WHERE token_hash = 'temporary-v117'").get().status, "EXPIRADO");
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auditoria_piloto WHERE evento = 'REGISTRO_ANTIGO_V117'").get().total, 0);
  assert.equal(database.prepare("SELECT resultado FROM auditoria_piloto WHERE evento = 'OTIMIZADOR_PLATAFORMA_EXECUTADO' ORDER BY id DESC LIMIT 1").get().resultado, "SUCESSO");
  database.close();
});
