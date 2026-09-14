import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  AUTH_RATE_LIMITS,
  decidirLimite,
  estadoDaLinha,
  origemDaRequisicao,
} from "../app/lib/rate-limit-policy.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const configuracaoLogin = {
  limite: AUTH_RATE_LIMITS.login.limite,
  janelaSegundos: AUTH_RATE_LIMITS.login.janelaSegundos,
  bloqueioSegundos: AUTH_RATE_LIMITS.login.bloqueioSegundos,
};

test("a origem passa enquanto estiver dentro da cota da janela", () => {
  let estado = undefined;
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  for (let tentativa = 1; tentativa <= configuracaoLogin.limite; tentativa += 1) {
    const decisao = decidirLimite({ agoraMs, ...configuracaoLogin, estado });
    assert.equal(decisao.permitido, true, `tentativa ${tentativa} deveria passar`);
    assert.equal(decisao.restantes, configuracaoLogin.limite - tentativa);
    estado = decisao.proximoEstado;
  }
});

test("a tentativa seguinte ao limite bloqueia a origem pelo tempo configurado", () => {
  let estado = undefined;
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  for (let tentativa = 1; tentativa <= configuracaoLogin.limite; tentativa += 1) {
    estado = decidirLimite({ agoraMs, ...configuracaoLogin, estado }).proximoEstado;
  }
  const excedida = decidirLimite({ agoraMs, ...configuracaoLogin, estado });
  assert.equal(excedida.permitido, false);
  assert.equal(excedida.motivo, "LIMITE_EXCEDIDO");
  assert.equal(excedida.tentarEmSegundos, configuracaoLogin.bloqueioSegundos);
  assert.equal(
    excedida.proximoEstado.bloqueadoAteMs,
    agoraMs + configuracaoLogin.bloqueioSegundos * 1000,
  );
});

test("bater na porta durante o bloqueio não estende o bloqueio", () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const bloqueadoAteMs = agoraMs + 900_000;
  const estado = { tentativas: 0, janelaInicioMs: agoraMs, bloqueadoAteMs };

  const primeiraBatida = decidirLimite({
    agoraMs: agoraMs + 60_000,
    ...configuracaoLogin,
    estado,
  });
  const segundaBatida = decidirLimite({
    agoraMs: agoraMs + 120_000,
    ...configuracaoLogin,
    estado: primeiraBatida.proximoEstado,
  });

  assert.equal(primeiraBatida.permitido, false);
  assert.equal(segundaBatida.permitido, false);
  // O fim do bloqueio continua o mesmo instante: quem divide um IP com um
  // atacante sai da punição na hora prevista, não "daqui a 15 minutos" para
  // sempre.
  assert.equal(segundaBatida.proximoEstado.bloqueadoAteMs, bloqueadoAteMs);
  assert.equal(segundaBatida.tentarEmSegundos, 780);
});

test("a cota volta inteira quando a janela vence", () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const estado = {
    tentativas: configuracaoLogin.limite,
    janelaInicioMs: agoraMs,
    bloqueadoAteMs: 0,
  };
  const depoisDaJanela = decidirLimite({
    agoraMs: agoraMs + configuracaoLogin.janelaSegundos * 1000 + 1,
    ...configuracaoLogin,
    estado,
  });
  assert.equal(depoisDaJanela.permitido, true);
  assert.equal(depoisDaJanela.restantes, configuracaoLogin.limite - 1);
});

test("a cota recomeça inteira depois que o bloqueio vence", () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  let estado = undefined;
  for (let tentativa = 1; tentativa <= configuracaoLogin.limite; tentativa += 1) {
    estado = decidirLimite({ agoraMs, ...configuracaoLogin, estado }).proximoEstado;
  }
  estado = decidirLimite({ agoraMs, ...configuracaoLogin, estado }).proximoEstado;

  const depoisDoBloqueio = decidirLimite({
    agoraMs: agoraMs + configuracaoLogin.bloqueioSegundos * 1000 + 1,
    ...configuracaoLogin,
    estado,
  });
  assert.equal(depoisDoBloqueio.permitido, true);
  assert.equal(depoisDoBloqueio.restantes, configuracaoLogin.limite - 1);
});

test("origens diferentes não compartilham contador", () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const primeira = decidirLimite({ agoraMs, ...configuracaoLogin, estado: undefined });
  const segunda = decidirLimite({ agoraMs, ...configuracaoLogin, estado: undefined });
  assert.equal(primeira.restantes, segunda.restantes);
  assert.equal(primeira.permitido, true);
  assert.equal(segunda.permitido, true);
});

test("o IP sai de CF-Connecting-IP e cai para X-Forwarded-For", () => {
  const cabecalhos = (valores) => new Headers(valores);
  assert.equal(
    origemDaRequisicao(cabecalhos({ "cf-connecting-ip": "203.0.113.7" })),
    "203.0.113.7",
  );
  assert.equal(
    origemDaRequisicao(cabecalhos({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" })),
    "203.0.113.9",
  );
  // O cabeçalho da Cloudflare vence o que o cliente mandou.
  assert.equal(
    origemDaRequisicao(
      cabecalhos({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" }),
    ),
    "203.0.113.7",
  );
  // Sem IP confiável o chamador precisa deixar passar em vez de jogar todo
  // mundo no mesmo balde.
  assert.equal(origemDaRequisicao(cabecalhos({})), null);
});

test("o estado gravado pelo SQLite é lido como UTC", () => {
  // CURRENT_TIMESTAMP grava "YYYY-MM-DD HH:MM:SS" sem sufixo de fuso. Ler isso
  // como hora local faria o bloqueio vencer horas antes ou depois.
  const estado = estadoDaLinha({
    tentativas: 3,
    janela_inicio: "2026-09-14 12:00:00",
    bloqueado_ate: "2026-09-14 12:15:00",
  });
  assert.equal(estado.tentativas, 3);
  assert.equal(estado.janelaInicioMs, Date.UTC(2026, 8, 14, 12, 0, 0));
  assert.equal(estado.bloqueadoAteMs, Date.UTC(2026, 8, 14, 12, 15, 0));

  const vazio = estadoDaLinha(null);
  assert.deepEqual(vazio, { tentativas: 0, janelaInicioMs: 0, bloqueadoAteMs: 0 });
});

test("a migração 0071 cria a tabela de limites com índice único", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(
    (await source("drizzle/0071_limites_autenticacao.sql"))
      .split("--> statement-breakpoint")
      .join("\n"),
  );

  const tabela = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("limites_autenticacao");
  assert.ok(tabela, "a tabela limites_autenticacao precisa existir");

  database
    .prepare(
      `INSERT INTO limites_autenticacao (escopo, chave, tentativas)
       VALUES ('login', 'hash-a', 1)`,
    )
    .run();
  // O par escopo+chave é único: sem isso a mesma origem geraria várias linhas
  // e o contador nunca chegaria ao limite.
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO limites_autenticacao (escopo, chave, tentativas)
           VALUES ('login', 'hash-a', 1)`,
        )
        .run(),
    /UNIQUE/i,
  );
  // A mesma chave em outra finalidade é permitida.
  database
    .prepare(
      `INSERT INTO limites_autenticacao (escopo, chave, tentativas)
       VALUES ('cadastro', 'hash-a', 1)`,
    )
    .run();
});

test("os endpoints sensíveis de autenticação consultam o limite por origem", async () => {
  const rotas = {
    "app/api/auth/login/route.ts": "login",
    "app/api/auth/cadastro/route.ts": "cadastro",
    "app/api/auth/esqueci-senha/route.ts": "esqueci-senha",
    "app/api/auth/redefinir-senha/route.ts": "redefinir-senha",
    "app/api/auth/primeiro-acesso/route.ts": "primeiro-acesso",
  };
  for (const [rota, escopo] of Object.entries(rotas)) {
    const conteudo = await source(rota);
    assert.match(
      conteudo,
      new RegExp(`verificarLimiteAutenticacao\\(request, "${escopo}"\\)`),
      `${rota} precisa conferir o limite da finalidade "${escopo}"`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(AUTH_RATE_LIMITS, escopo),
      `a finalidade "${escopo}" precisa ter limite configurado`,
    );
  }
});

test("o IP nunca é gravado em texto e a limitação nunca derruba o login", async () => {
  const conteudo = await source("app/lib/rate-limit.ts");
  // A chave é sempre o hash do IP com o segredo do ambiente.
  assert.match(conteudo, /sha256\(`\$\{segredo\}:\$\{escopo\}:\$\{origem\}`\)/);
  assert.match(conteudo, /AUTH_SECRET/);
  // Falha de banco devolve PERMITIDO em vez de barrar todo mundo.
  assert.match(conteudo, /catch \{\s*return PERMITIDO;/);
  // A resposta de bloqueio precisa do 429 com Retry-After.
  assert.match(conteudo, /status: 429/);
  assert.match(conteudo, /"Retry-After"/);
});
