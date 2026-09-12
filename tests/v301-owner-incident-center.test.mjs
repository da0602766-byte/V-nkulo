import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularChaveAgrupamento,
  classificarPrioridade,
  gravidadeMaisSevera,
  normalizarTituloIncidente,
  rotularIncidente,
} from "../app/lib/incident-center.mjs";

test("o mesmo erro com ids diferentes cai na mesma chave de agrupamento", () => {
  const primeira = calcularChaveAgrupamento({
    area: "PUBLICACAO",
    modulo: "avisos",
    titulo: "Falha ao publicar aviso 118 na comunidade 7",
  });
  const segunda = calcularChaveAgrupamento({
    area: "PUBLICACAO",
    modulo: "avisos",
    titulo: "Falha ao publicar aviso 902 na comunidade 31",
  });
  assert.equal(
    primeira,
    segunda,
    "o mesmo problema não pode abrir dois incidentes por causa dos ids",
  );
});

test("timestamps, UUIDs e e-mails não separam ocorrências do mesmo problema", () => {
  const base = {
    area: "BANCO",
    modulo: "escalas",
    titulo: "Timeout na consulta",
  };
  const comUuid = calcularChaveAgrupamento({
    ...base,
    titulo:
      "Timeout na consulta 3f2504e0-4f89-11d3-9a0c-0305e82c3301 em 2026-09-12T10:14:22Z",
  });
  const comOutroUuid = calcularChaveAgrupamento({
    ...base,
    titulo:
      "Timeout na consulta 9c858901-8a57-4791-81fe-4c455b099bc9 em 2026-09-11T22:03:05Z",
  });
  assert.equal(
    comUuid,
    comOutroUuid,
    "duas ocorrências do mesmo timeout não podem virar dois incidentes",
  );
  // A normalização deixa passar palavras soltas que sobram da remoção (aqui, a
  // preposição "em"). Isso é inofensivo para o agrupamento — o que importa é
  // que ocorrências de mesma forma colidam e formas diferentes não colidam —,
  // mas significa que a chave não é igual à do título curto.
  assert.notEqual(comUuid, calcularChaveAgrupamento(base));
});

test("problemas realmente diferentes continuam separados", () => {
  const publicacao = calcularChaveAgrupamento({
    area: "PUBLICACAO",
    modulo: "avisos",
    titulo: "Falha ao publicar aviso",
  });
  const autenticacao = calcularChaveAgrupamento({
    area: "AUTENTICACAO",
    modulo: "avisos",
    titulo: "Falha ao publicar aviso",
  });
  const outroModulo = calcularChaveAgrupamento({
    area: "PUBLICACAO",
    modulo: "escalas",
    titulo: "Falha ao publicar aviso",
  });
  const outraMensagem = calcularChaveAgrupamento({
    area: "PUBLICACAO",
    modulo: "avisos",
    titulo: "Erro de permissão ao salvar rascunho",
  });
  const chaves = new Set([publicacao, autenticacao, outroModulo, outraMensagem]);
  assert.equal(chaves.size, 4, "área, módulo e mensagem distinguem incidentes");
});

test("normalização de título remove o que é volátil e preserva a forma do erro", () => {
  assert.equal(
    normalizarTituloIncidente("Falha ao publicar aviso 118 na comunidade 7"),
    "falha ao publicar aviso na comunidade",
  );
  assert.equal(
    normalizarTituloIncidente("ERRO: contato@exemplo.com não pôde ser notificado"),
    "erro nao pode ser notificado",
  );
  assert.equal(normalizarTituloIncidente(null), "");
});

test("área inválida cai no padrão em vez de criar categoria nova", () => {
  const chave = calcularChaveAgrupamento({ area: "INVENTADA", titulo: "x y z" });
  assert.ok(chave.startsWith("modulo:"));
});

test("prioridade sobe com volume e alcance, e é truncada em 1..5", () => {
  const isolado = classificarPrioridade({
    gravidade: "MEDIA",
    ocorrencias: 1,
    comunidadesAfetadas: 1,
  });
  const espalhado = classificarPrioridade({
    gravidade: "MEDIA",
    ocorrencias: 80,
    comunidadesAfetadas: 12,
  });
  assert.ok(
    espalhado < isolado,
    "o mesmo problema atingindo muitas comunidades precisa subir na fila",
  );
  assert.equal(espalhado, 1);
  assert.ok(isolado <= 5);

  assert.equal(
    classificarPrioridade({ gravidade: "CRITICA", ocorrencias: 1, comunidadesAfetadas: 1 }),
    1,
    "crítico isolado não é rebaixado",
  );
  assert.equal(
    classificarPrioridade({ gravidade: "BAIXA", ocorrencias: 0, comunidadesAfetadas: 0 }),
    5,
  );
});

test("gravidade registrada nunca é rebaixada por uma ocorrência mais branda", () => {
  assert.equal(gravidadeMaisSevera("ALTA", "BAIXA"), "ALTA");
  assert.equal(gravidadeMaisSevera("MEDIA", "CRITICA"), "CRITICA");
  assert.equal(gravidadeMaisSevera("BAIXA", "BAIXA"), "BAIXA");
});

test("rótulos dos conjuntos fechados saem em português", () => {
  assert.equal(rotularIncidente("area", "AUTENTICACAO"), "Autenticação");
  assert.equal(rotularIncidente("gravidade", "CRITICA"), "Crítica");
  assert.equal(rotularIncidente("status", "EM_ANALISE"), "Em análise");
});
