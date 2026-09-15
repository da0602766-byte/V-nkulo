import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createPilotD1, createPilotUser } from "./helpers/sqlite-d1.mjs";
import { gerarCodigo, PASSO_SEGUNDOS } from "../app/lib/totp.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const context = { waitUntil() {}, passThroughOnException() {} };

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("integration", `mfa-${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

function createEnv(d1, overrides = {}) {
  return {
    DB: d1,
    AUTH_SECRET: "segredo-ficticio-exclusivo-do-teste-mfa",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    ...overrides,
  };
}

// `community.lifecycle.review` só existe para o proprietário global, que é
// resolvido pelo par de variáveis abaixo (ver isSystemOwnerAccount).
function ambienteDoProprietario(d1, email) {
  return createEnv(d1, {
    SYSTEM_OWNER_EMAIL: email,
    SYSTEM_OWNER_LOCKED_BEFORE: "2099-01-01T00:00:00.000Z",
  });
}

async function login(worker, env, email, senha) {
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email, senha }),
    }),
    env,
    context,
  );
  assert.equal(response.status, 303);
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
  const cookie = setCookies
    .map((value) => value.match(/__Host-adote_session=[^;]+/)?.[0])
    .find(Boolean);
  assert.ok(cookie, "cookie de sessão ausente");
  return cookie;
}

function chamarMfa(worker, env, cookie, corpo) {
  return worker.fetch(
    new Request("http://localhost/api/conta/mfa", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    env,
    context,
  );
}

async function contaComMfa(worker, env, cookie) {
  const inicio = await chamarMfa(worker, env, cookie, { acao: "iniciar" });
  assert.equal(inicio.status, 200);
  const { segredo } = await inicio.json();
  const confirmacao = await chamarMfa(worker, env, cookie, {
    acao: "confirmar",
    codigo: await gerarCodigo(segredo),
  });
  assert.equal(confirmacao.status, 200);
  const { codigosRecuperacao } = await confirmacao.json();
  return { segredo, codigosRecuperacao };
}

test("o cadastro do segundo fator exige provar que o aplicativo leu o segredo", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Analista MFA",
    email: "analista.mfa@example.test",
    senha: "Continuidade123",
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const cookie = await login(worker, env, "analista.mfa@example.test", "Continuidade123");

  const antes = await (
    await worker.fetch(
      new Request("http://localhost/api/conta/mfa", { headers: { cookie } }),
      env,
      context,
    )
  ).json();
  assert.deepEqual(antes, {
    ativo: false,
    cadastroPendente: false,
    codigosRecuperacaoRestantes: 0,
  });

  const inicio = await chamarMfa(worker, env, cookie, { acao: "iniciar" });
  assert.equal(inicio.status, 200);
  const dados = await inicio.json();
  assert.match(dados.uri, /^otpauth:\/\/totp\//);
  assert.match(dados.uri, /analista\.mfa%40example\.test/);

  // Iniciado não é ativo: quem fechou a tela antes de escanear não fica preso.
  const pendente = await (
    await worker.fetch(
      new Request("http://localhost/api/conta/mfa", { headers: { cookie } }),
      env,
      context,
    )
  ).json();
  assert.equal(pendente.ativo, false);
  assert.equal(pendente.cadastroPendente, true);

  const codigoErrado = await chamarMfa(worker, env, cookie, {
    acao: "confirmar",
    codigo: "000000",
  });
  assert.equal(codigoErrado.status, 401);

  const confirmacao = await chamarMfa(worker, env, cookie, {
    acao: "confirmar",
    codigo: await gerarCodigo(dados.segredo),
  });
  assert.equal(confirmacao.status, 200);
  const confirmado = await confirmacao.json();
  assert.equal(confirmado.codigosRecuperacao.length, 10);
  for (const codigo of confirmado.codigosRecuperacao) {
    assert.match(codigo, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  }

  const depois = await (
    await worker.fetch(
      new Request("http://localhost/api/conta/mfa", { headers: { cookie } }),
      env,
      context,
    )
  ).json();
  assert.deepEqual(depois, {
    ativo: true,
    cadastroPendente: false,
    codigosRecuperacaoRestantes: 10,
  });
});

test("o segredo do segundo fator nunca é gravado em claro no banco", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Analista Cifrado",
    email: "cifrado.mfa@example.test",
    senha: "Continuidade123",
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const cookie = await login(worker, env, "cifrado.mfa@example.test", "Continuidade123");
  const { segredo, codigosRecuperacao } = await contaComMfa(worker, env, cookie);

  const linha = database.prepare("SELECT * FROM usuario_mfa LIMIT 1").get();
  const serializado = JSON.stringify(linha);
  assert.doesNotMatch(serializado, new RegExp(segredo), "o segredo vazou para o banco");
  assert.ok(linha.segredo_ciphertext.length > 0);
  assert.ok(linha.segredo_iv.length > 0);

  // Os códigos de recuperação também só existem como hash.
  const guardados = database
    .prepare("SELECT codigo_hash FROM usuario_mfa_recuperacao")
    .all()
    .map((registro) => registro.codigo_hash)
    .join(" ");
  for (const codigo of codigosRecuperacao) {
    assert.doesNotMatch(guardados, new RegExp(codigo.replace("-", "")));
  }
});

test("o mesmo código do aplicativo não serve duas vezes", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Analista Replay",
    email: "replay.mfa@example.test",
    senha: "Continuidade123",
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const cookie = await login(worker, env, "replay.mfa@example.test", "Continuidade123");
  const { segredo } = await contaComMfa(worker, env, cookie);

  // A confirmação já consumiu o passo atual: reapresentá-lo para desativar
  // precisa falhar, senão um código interceptado ainda valeria.
  const codigoAtual = await gerarCodigo(segredo);
  const reuso = await chamarMfa(worker, env, cookie, {
    acao: "desativar",
    codigo: codigoAtual,
  });
  assert.equal(reuso.status, 401);

  const status = await (
    await worker.fetch(
      new Request("http://localhost/api/conta/mfa", { headers: { cookie } }),
      env,
      context,
    )
  ).json();
  assert.equal(status.ativo, true, "a conta não podia ter perdido o segundo fator");
});

test("o código de recuperação desliga o segundo fator e vale só uma vez", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Analista Perdido",
    email: "perdido.mfa@example.test",
    senha: "Continuidade123",
  });
  const worker = await loadWorker();
  const env = createEnv(d1);
  const cookie = await login(worker, env, "perdido.mfa@example.test", "Continuidade123");
  const { codigosRecuperacao } = await contaComMfa(worker, env, cookie);

  const primeiro = codigosRecuperacao[0];
  // Digitado sem hífen e em minúscula, como quem copia do papel às pressas.
  const desativacao = await chamarMfa(worker, env, cookie, {
    acao: "desativar",
    codigo: primeiro.replace("-", "").toLowerCase(),
  });
  assert.equal(desativacao.status, 200);

  const status = await (
    await worker.fetch(
      new Request("http://localhost/api/conta/mfa", { headers: { cookie } }),
      env,
      context,
    )
  ).json();
  assert.equal(status.ativo, false);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM usuario_mfa_recuperacao").get().total,
    0,
    "desligar o fator precisa limpar os códigos de recuperação",
  );
});

test("a aprovação crítica de continuidade exige segundo fator configurado e código válido", async () => {
  const { database, d1 } = await createPilotD1();
  // O analista precisa de SUPERADMIN e da permissão de revisão; o solicitante
  // é outra pessoa, porque autoaprovação já era barrada antes.
  const analistaId = await createPilotUser(database, {
    nome: "Suporte Continuidade",
    email: "suporte.continuidade@example.test",
    senha: "Continuidade123",
    perfil: "SUPERADMIN",
    memberships: [{ comunidadeId: 1, papel: "OWNER" }],
  });
  const solicitanteId = await createPilotUser(database, {
    nome: "Pastor Solicitante",
    email: "pastor.continuidade@example.test",
    senha: "Continuidade123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  assert.ok(analistaId && solicitanteId);

  database.prepare("UPDATE comunidades SET status = 'SUSPENSA' WHERE id = 1").run();
  database
    .prepare(
      `INSERT INTO solicitacoes_ciclo_comunidade
       (comunidade_id, tipo, status, motivo, categoria_motivo, descricao,
        evidencias, evidencia_obrigatoria, senha_reconfirmada, mfa_status,
        solicitante_id, bloqueios, snapshot_configuracao)
       VALUES (1, 'REATIVACAO', 'REATIVACAO_SOLICITADA', 'Retomada das atividades',
        'SEM_USO', 'A comunidade voltou a se reunir e precisa do acesso de volta.',
        '[]', 0, 1, 'PENDENTE_EXTERNO', ?, '[]', '{}')`,
    )
    .run(solicitanteId);
  const requestId = Number(
    database.prepare("SELECT id FROM solicitacoes_ciclo_comunidade LIMIT 1").get().id,
  );

  const worker = await loadWorker();
  const env = ambienteDoProprietario(d1, "suporte.continuidade@example.test");
  const cookie = await login(
    worker,
    env,
    "suporte.continuidade@example.test",
    "Continuidade123",
  );

  const aprovar = (corpo) =>
    worker.fetch(
      new Request("http://localhost/api/pilot/continuidade", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          action: "APROVAR",
          requestId,
          reviewReason: "Analisado com a liderança e aprovado.",
          ...corpo,
        }),
      }),
      env,
      context,
    );

  // Sem segundo fator configurado a aprovação continua barrada — mas agora
  // pedindo o cadastro, não alegando dependência externa.
  const semCadastro = await aprovar({});
  assert.equal(semCadastro.status, 423);
  const semCadastroCorpo = await semCadastro.json();
  assert.equal(semCadastroCorpo.mfaSetupRequired, true);
  assert.doesNotMatch(semCadastroCorpo.error, /externo/i);

  const { segredo } = await contaComMfa(worker, env, cookie);

  const codigoErrado = await aprovar({ mfaCode: "000000" });
  assert.equal(codigoErrado.status, 401);

  // A solicitação continua pendente depois das recusas.
  assert.equal(
    database.prepare("SELECT decisao FROM solicitacoes_ciclo_comunidade WHERE id = ?").get(requestId).decisao,
    "PENDENTE",
  );

  // O passo atual já foi gasto na confirmação do cadastro; o próximo vale.
  const proximoCodigo = await gerarCodigo(segredo, Date.now() + PASSO_SEGUNDOS * 1000);
  const aprovada = await aprovar({ mfaCode: proximoCodigo });
  assert.equal(aprovada.status, 200);
  assert.deepEqual(await aprovada.json(), { ok: true, status: "REATIVADA" });

  const solicitacao = database
    .prepare("SELECT status, decisao FROM solicitacoes_ciclo_comunidade WHERE id = ?")
    .get(requestId);
  assert.equal(solicitacao.decisao, "APROVADA");
  assert.equal(solicitacao.status, "REATIVADA");
  assert.equal(
    database.prepare("SELECT status FROM comunidades WHERE id = 1").get().status,
    "REATIVADA",
  );
});

test("aprovar cancelamento continua bloqueado, mas pela política e não por MFA externo", async () => {
  const { database, d1 } = await createPilotD1();
  await createPilotUser(database, {
    nome: "Suporte Cancelamento",
    email: "suporte.cancelamento@example.test",
    senha: "Continuidade123",
    perfil: "SUPERADMIN",
    memberships: [{ comunidadeId: 1, papel: "OWNER" }],
  });
  const solicitanteId = await createPilotUser(database, {
    nome: "Pastor Cancelamento",
    email: "pastor.cancelamento@example.test",
    senha: "Continuidade123",
    memberships: [{ comunidadeId: 1, papel: "PASTOR" }],
  });
  database
    .prepare(
      `INSERT INTO solicitacoes_ciclo_comunidade
       (comunidade_id, tipo, status, motivo, categoria_motivo, descricao,
        evidencias, evidencia_obrigatoria, senha_reconfirmada, mfa_status,
        solicitante_id, bloqueios, snapshot_configuracao)
       VALUES (1, 'CANCELAMENTO', 'CANCELAMENTO_SOLICITADO', 'Encerramento',
        'SEM_USO', 'A comunidade encerrou as atividades neste endereço.',
        '[]', 0, 1, 'PENDENTE_EXTERNO', ?, '[]', '{}')`,
    )
    .run(solicitanteId);
  const requestId = Number(
    database.prepare("SELECT id FROM solicitacoes_ciclo_comunidade LIMIT 1").get().id,
  );

  const worker = await loadWorker();
  const env = ambienteDoProprietario(d1, "suporte.cancelamento@example.test");
  const cookie = await login(
    worker,
    env,
    "suporte.cancelamento@example.test",
    "Continuidade123",
  );
  const { segredo } = await contaComMfa(worker, env, cookie);

  const resposta = await worker.fetch(
    new Request("http://localhost/api/pilot/continuidade", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        action: "APROVAR",
        requestId,
        reviewReason: "Analisado com a liderança e aprovado.",
        mfaCode: await gerarCodigo(segredo, Date.now() + PASSO_SEGUNDOS * 1000),
      }),
    }),
    env,
    context,
  );
  assert.equal(resposta.status, 423);
  const corpo = await resposta.json();
  assert.equal(corpo.pendingPolicy, true);
  assert.equal(corpo.mfaRequired, false);

  // O ponto crítico: a comunidade e a solicitação não podem ter sido tocadas.
  // Antes desta rodada, APROVAR caía no trecho final do handler e gravava
  // decisao = 'RECUSADA'.
  assert.equal(
    database.prepare("SELECT decisao FROM solicitacoes_ciclo_comunidade WHERE id = ?").get(requestId).decisao,
    "PENDENTE",
  );
  assert.equal(
    database.prepare("SELECT status FROM comunidades WHERE id = 1").get().status,
    "ATIVA",
  );
});

test("o MFA deixou de ser declarado como dependência externa", async () => {
  const continuidade = await source("app/api/pilot/continuidade/route.ts");
  assert.doesNotMatch(continuidade, /MFA externo não homologado/);
  assert.doesNotMatch(continuidade, /Provedor de MFA e canal seguro/);
  assert.match(continuidade, /mfaAtivo\(access\.user\.id\)/);
  assert.match(continuidade, /verificarMfa\(access\.user\.id/);

  // O segredo é cifrado com chave própria, separada da integração Google.
  const mfa = await source("app/lib/mfa.ts");
  assert.match(mfa, /vinkulo-mfa:/);
  assert.match(mfa, /AES-GCM/);
  assert.doesNotMatch(mfa, /segredo_base32|segredoEmClaro/);
});
