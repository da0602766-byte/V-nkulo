import assert from "node:assert/strict";
import test from "node:test";

import {
  compararPeriodos,
  completarSerieDiaria,
  detectarAnomalias,
  montarDestaques,
} from "../app/lib/owner-insights.mjs";

test("comparação entre períodos trata variação pequena como estável", () => {
  assert.deepEqual(compararPeriodos(102, 100), {
    atual: 102,
    anterior: 100,
    variacao: 2,
    direcao: "ESTAVEL",
  });
  assert.equal(compararPeriodos(118, 100).direcao, "ALTA");
  assert.equal(compararPeriodos(118, 100).variacao, 18);
  assert.equal(compararPeriodos(70, 100).direcao, "QUEDA");
});

test("comparação entre períodos não divide por zero", () => {
  assert.deepEqual(compararPeriodos(0, 0), {
    atual: 0,
    anterior: 0,
    variacao: 0,
    direcao: "ESTAVEL",
  });
  assert.equal(compararPeriodos(9, 0).variacao, 100);
});

test("série curta não sustenta afirmação de anomalia", () => {
  const serie = [
    { chave: "2026-09-01", total: 1 },
    { chave: "2026-09-02", total: 90 },
    { chave: "2026-09-03", total: 1 },
  ];
  assert.deepEqual(detectarAnomalias(serie), []);
});

test("série estável não gera anomalia e pico isolado gera", () => {
  const estavel = Array.from({ length: 10 }, (_, indice) => ({
    chave: `2026-09-${String(indice + 1).padStart(2, "0")}`,
    total: 5,
  }));
  assert.deepEqual(detectarAnomalias(estavel), []);

  const comPico = estavel.map((ponto, indice) =>
    indice === 7 ? { ...ponto, total: 60 } : ponto,
  );
  const anomalias = detectarAnomalias(comPico);
  assert.equal(anomalias.length, 1);
  assert.equal(anomalias[0].chave, "2026-09-08");
  assert.ok(anomalias[0].desvio > 2);
});

test("série diária preenche os dias sem registro com zero", () => {
  const referencia = new Date("2026-09-12T10:00:00Z");
  const serie = completarSerieDiaria(
    [{ chave: "2026-09-11", total: 4 }],
    3,
    referencia,
  );
  assert.deepEqual(serie, [
    { chave: "2026-09-10", total: 0 },
    { chave: "2026-09-11", total: 4 },
    { chave: "2026-09-12", total: 0 },
  ]);
});

test("destaques só aparecem quando há número que os sustente", () => {
  assert.deepEqual(montarDestaques({}), []);
  assert.deepEqual(
    montarDestaques({ usuariosAtivos: compararPeriodos(101, 100) }),
    [],
    "variação estável não vira destaque",
  );
});

test("destaques ordenam do mais crítico ao informativo", () => {
  const destaques = montarDestaques({
    usuariosAtivos: compararPeriodos(118, 100),
    incidentesCriticos: 2,
    comunidadesSuspensas: 1,
  });
  assert.deepEqual(
    destaques.map((item) => item.nivel),
    ["CRITICO", "ATENCAO", "INFORMACAO"],
  );
  assert.match(destaques[2].titulo, /cresceram \+18%/);
});

test("destaque de origem provável é marcado como correlação, não causa", () => {
  const [destaque] = montarDestaques({ erros: compararPeriodos(90, 30) });
  assert.equal(destaque.nivel, "CRITICO");
  assert.equal(
    destaque.correlacao,
    true,
    "aumento de erros aponta hipótese a investigar, não causa confirmada",
  );
  assert.match(destaque.detalhe, /precisa ser confirmada/);
});

test("destaque de comunidade fora do padrão não afirma inspeção de conteúdo", () => {
  const [destaque] = montarDestaques({
    comunidadesForaDoPadrao: [{ nome: "Comunidade X", desvio: 3.1 }],
  });
  assert.match(destaque.titulo, /Comunidade X/);
  assert.equal(destaque.correlacao, true);
  assert.match(destaque.detalhe, /Nenhum conteúdo privado/);
});
