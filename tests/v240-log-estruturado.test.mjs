import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  NIVEIS,
  ehCampoSensivel,
  montarLinha,
  redigirContexto,
} from "../app/lib/logger.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("toda linha sai com momento, nível e evento", () => {
  const linha = montarLinha({
    nivel: "info",
    evento: "login_concluido",
    contexto: { usuarioId: 42 },
    momento: "2026-09-14T12:00:00.000Z",
  });
  assert.deepEqual(linha, {
    momento: "2026-09-14T12:00:00.000Z",
    nivel: "info",
    evento: "login_concluido",
    usuarioId: 42,
  });
  // O formato precisa sobreviver a JSON.stringify: é assim que ele chega ao
  // painel de logs do ambiente hospedado.
  assert.doesNotThrow(() => JSON.stringify(linha));
});

test("nível desconhecido vira info em vez de quebrar a linha", () => {
  const linha = montarLinha({ nivel: "catastrofe", evento: "x" });
  assert.equal(linha.nivel, "info");
  assert.deepEqual(NIVEIS, ["debug", "info", "warn", "error"]);
});

test("dado pessoal e segredo nunca chegam ao log", () => {
  const redigido = redigirContexto({
    usuarioId: 7,
    email: "pessoa@exemplo.org",
    senha: "SenhaReal123",
    senhaHash: "abc",
    senha_salt: "def",
    token: "tok_123",
    refreshToken: "rt_123",
    Authorization: "Bearer abc",
    cookie: "__Host-adote_session=abc",
    telefone: "11999999999",
    ip: "203.0.113.7",
    rota: "/api/auth/login",
  });

  assert.equal(redigido.usuarioId, 7);
  assert.equal(redigido.rota, "/api/auth/login");
  for (const campo of [
    "email",
    "senha",
    "senhaHash",
    "senha_salt",
    "token",
    "refreshToken",
    "Authorization",
    "cookie",
    "telefone",
    "ip",
  ]) {
    assert.equal(redigido[campo], "[redigido]", `${campo} precisa ser redigido`);
  }

  const serializado = JSON.stringify(redigido);
  assert.doesNotMatch(serializado, /pessoa@exemplo\.org/);
  assert.doesNotMatch(serializado, /SenhaReal123/);
  assert.doesNotMatch(serializado, /tok_123/);
  assert.doesNotMatch(serializado, /203\.0\.113\.7/);
});

test("a redação não depende de grafia, acento ou separador", () => {
  assert.equal(ehCampoSensivel("senha"), true);
  assert.equal(ehCampoSensivel("SENHA"), true);
  assert.equal(ehCampoSensivel("senha_hash"), true);
  assert.equal(ehCampoSensivel("senhaHash"), true);
  assert.equal(ehCampoSensivel("endereço"), true);
  assert.equal(ehCampoSensivel("client-secret"), true);
  assert.equal(ehCampoSensivel("usuarioId"), false);
  assert.equal(ehCampoSensivel("rota"), false);
});

test("dado sensível aninhado também é redigido", () => {
  const redigido = redigirContexto({
    requisicao: { corpo: { email: "a@b.org", nome: "Maria" } },
    lista: [{ token: "t1" }, { token: "t2" }],
  });
  assert.equal(redigido.requisicao.corpo.email, "[redigido]");
  assert.equal(redigido.requisicao.corpo.nome, "Maria");
  assert.equal(redigido.lista[0].token, "[redigido]");
  assert.equal(redigido.lista[1].token, "[redigido]");
});

test("erro vira nome, mensagem e pilha curta", () => {
  const redigido = redigirContexto({ erro: new TypeError("falha ao ler") });
  assert.equal(redigido.erro.nome, "TypeError");
  assert.equal(redigido.erro.mensagem, "falha ao ler");
  assert.ok(Array.isArray(redigido.erro.pilha));
  assert.ok(redigido.erro.pilha.length <= 5);
});

test("texto longo e estrutura profunda são cortados", () => {
  const longo = "a".repeat(900);
  assert.equal(redigirContexto({ nota: longo }).nota.length, 501);

  const profundo = { a: { b: { c: { d: { e: "fundo" } } } } };
  assert.equal(redigirContexto(profundo).a.b.c.d, "[profundo demais]");
});

test("referência circular não derruba quem estava sendo registrado", async () => {
  const { registrar } = await import("../app/lib/logger.mjs");
  const circular = {};
  circular.ele = circular;
  const original = console.error;
  const capturado = [];
  console.error = (linha) => capturado.push(linha);
  try {
    assert.doesNotThrow(() => registrar("error", "evento_circular", circular));
  } finally {
    console.error = original;
  }
  assert.equal(capturado.length, 1);
  assert.match(capturado[0], /log_nao_serializavel|evento_circular/);
});

test("o worker registra a falha em vez de engolir o 500", async () => {
  const worker = await source("worker/index.ts");
  assert.match(worker, /import \{ log \} from "\.\.\/app\/lib\/logger\.mjs"/);
  assert.match(worker, /log\.error\("requisicao_falhou"/);
  // As rotinas de manutenção também deixaram de falhar em silêncio.
  assert.match(worker, /log\.error\("otimizador_falhou"/);
  assert.match(worker, /log\.error\("retencao_mensagens_falhou"/);
  assert.doesNotMatch(worker, /\.catch\(\(\) => undefined\)/);
});
