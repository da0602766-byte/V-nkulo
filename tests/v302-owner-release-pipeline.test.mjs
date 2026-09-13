import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAVES_ETAPAS,
  ETAPAS_PIPELINE,
  avaliarHealthCheck,
  compararVersoes,
  deveReverterAutomaticamente,
  etapaAnterior,
  etapasIniciais,
  podeAvancar,
  proximaEtapa,
  resumirPipeline,
} from "../app/lib/release-pipeline.mjs";

test("o pipeline tem a sequência pedida, na ordem", () => {
  assert.deepEqual(CHAVES_ETAPAS, [
    "COMMIT",
    "VALIDACAO",
    "BUILD",
    "TESTES",
    "PREVIA",
    "APROVACAO",
    "PUBLICACAO",
    "HEALTH_CHECK",
    "CONCLUIDO",
  ]);
  assert.deepEqual(
    ETAPAS_PIPELINE.map((etapa) => etapa.ordem),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("a navegação entre etapas respeita a ordem e as pontas", () => {
  // As duas devolvem a definição completa da etapa, não só a chave.
  assert.equal(proximaEtapa("BUILD").chave, "TESTES");
  assert.equal(proximaEtapa("BUILD").ordem, 4);
  assert.equal(etapaAnterior("BUILD").chave, "VALIDACAO");
  assert.equal(proximaEtapa("CONCLUIDO"), null);
  assert.equal(etapaAnterior("COMMIT"), null);
  assert.equal(proximaEtapa("INEXISTENTE"), null);
});

test("as etapas iniciais nascem todas pendentes e sem duração", () => {
  const etapas = etapasIniciais();
  assert.equal(etapas.length, ETAPAS_PIPELINE.length);
  assert.ok(etapas.every((etapa) => etapa.status === "PENDENTE"));
  assert.ok(etapas.every((etapa) => !etapa.duracaoMs));
});

// A regra central do requisito: produção não vai ao ar sem aprovação.
test("publicar em produção sem aprovação é recusado", () => {
  const decisao = podeAvancar({
    etapa: "PUBLICACAO",
    status: "EM_ANDAMENTO",
    ambiente: "PRODUCAO",
    aprovacaoStatus: "PENDENTE",
  });
  assert.equal(decisao.permitido, false);
  assert.match(decisao.motivo, /aprovação explícita/i);
});

test("publicar em produção com aprovação registrada é liberado", () => {
  const decisao = podeAvancar({
    etapa: "PUBLICACAO",
    status: "EM_ANDAMENTO",
    ambiente: "PRODUCAO",
    aprovacaoStatus: "APROVADO",
  });
  assert.equal(decisao.permitido, true);
});

test("aprovação recusada impede ir ao ar, inclusive fora de produção", () => {
  for (const ambiente of ["PRODUCAO", "PREVIA", "HOMOLOGACAO"]) {
    const decisao = podeAvancar({
      etapa: "PUBLICACAO",
      status: "EM_ANDAMENTO",
      ambiente,
      aprovacaoStatus: "RECUSADO",
    });
    assert.equal(decisao.permitido, false, `ambiente ${ambiente}`);
    assert.match(decisao.motivo, /recusada/i);
  }
});

test("ambiente que não é produção publica sem exigir aprovação", () => {
  const decisao = podeAvancar({
    etapa: "PUBLICACAO",
    status: "EM_ANDAMENTO",
    ambiente: "PREVIA",
    aprovacaoStatus: "PENDENTE",
  });
  assert.equal(decisao.permitido, true);
});

test("publicação encerrada ou revertida não reabre etapa", () => {
  for (const status of ["PUBLICADO", "REVERTIDO", "CANCELADO"]) {
    const decisao = podeAvancar({
      etapa: "BUILD",
      status,
      ambiente: "PRODUCAO",
      aprovacaoStatus: "APROVADO",
    });
    assert.equal(decisao.permitido, false, `status ${status}`);
  }
});

test("etapa desconhecida é recusada em vez de tratada como válida", () => {
  const decisao = podeAvancar({ etapa: "DEPLOY_MAGICO", ambiente: "PRODUCAO" });
  assert.equal(decisao.permitido, false);
  assert.match(decisao.motivo, /desconhecida/i);
});

test("health check sem verificação reportada não vira saudável", () => {
  const avaliacao = avaliarHealthCheck({});
  assert.notEqual(avaliacao.gravidade, "OK");
  assert.equal(avaliacao.saudavel, false);
  assert.equal(avaliacao.exigeRollback, false);
});

test("health check com verificação crítica reprovada exige reversão", () => {
  const avaliacao = avaliarHealthCheck({
    verificacoes: [
      { chave: "banco", rotulo: "Banco", ok: false, critica: true },
      { chave: "home", rotulo: "Home", ok: true },
    ],
  });
  assert.equal(avaliacao.saudavel, false);
  assert.equal(avaliacao.exigeRollback, true);
});

test("taxa de erro acima do limite exige reversão", () => {
  const avaliacao = avaliarHealthCheck({
    verificacoes: [{ chave: "home", ok: true }],
    taxaErro: 40,
    limiteErro: 5,
  });
  assert.equal(avaliacao.exigeRollback, true);
});

test("health check aprovado não pede reversão", () => {
  const avaliacao = avaliarHealthCheck({
    verificacoes: [
      { chave: "banco", ok: true, critica: true },
      { chave: "home", ok: true },
    ],
    taxaErro: 0,
  });
  assert.equal(avaliacao.saudavel, true);
  assert.equal(avaliacao.exigeRollback, false);
});

test("health check ruim antes de publicar não dispara reversão", () => {
  // Nada foi ao ar, então não há o que reverter.
  const reverter = deveReverterAutomaticamente({
    etapas: [{ etapa: "BUILD", status: "SUCESSO" }],
    healthCheck: { verificacoes: [{ chave: "banco", ok: false, critica: true }] },
  });
  assert.equal(reverter, false);
});

test("health check crítico depois de publicar dispara reversão automática", () => {
  const reverter = deveReverterAutomaticamente({
    etapas: [
      { etapa: "PUBLICACAO", status: "SUCESSO" },
      { etapa: "HEALTH_CHECK", status: "SUCESSO" },
    ],
    healthCheck: { verificacoes: [{ chave: "banco", ok: false, critica: true }] },
  });
  assert.equal(reverter, true);
});

test("resumo aponta a primeira falha e não finge duração completa", () => {
  const resumo = resumirPipeline([
    { etapa: "COMMIT", status: "SUCESSO", duracaoMs: 1000 },
    { etapa: "VALIDACAO", status: "SUCESSO", duracaoMs: 0 },
    { etapa: "BUILD", status: "FALHA", duracaoMs: 2000 },
    { etapa: "TESTES", status: "FALHA", duracaoMs: 500 },
  ]);
  assert.equal(resumo.total, ETAPAS_PIPELINE.length);
  assert.equal(resumo.concluidas, 2);
  assert.equal(resumo.falhadas, 2);
  assert.equal(resumo.primeiraFalha, "BUILD");
  assert.equal(resumo.duracaoMs, 3500);
  assert.equal(resumo.semDuracao, 1, "etapa sem duração reportada é contada");
  assert.equal(resumo.concluido, false);
});

test("resumo de pipeline vazio não inventa progresso", () => {
  const resumo = resumirPipeline([]);
  assert.equal(resumo.registradas, 0);
  assert.equal(resumo.progresso, 0);
  assert.equal(resumo.primeiraFalha, null);
  assert.equal(resumo.concluido, false);
});

test("comparação de versões ordena corretamente", () => {
  assert.ok(compararVersoes("1.2.0", "1.10.0") < 0);
  assert.ok(compararVersoes("2.0.0", "1.9.9") > 0);
  assert.equal(compararVersoes("1.0.0", "1.0.0"), 0);
});
