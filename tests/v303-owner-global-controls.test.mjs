import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAVES_CONFIGURACAO,
  avaliarLiberacaoGradual,
  baldeLiberacao,
  compararVersaoMinima,
  configuracaoPorChave,
  ehAlteracaoCritica,
  resolverManutencao,
  situacaoLimite,
  validarLimites,
  validarValorConfiguracao,
} from "../app/lib/global-controls.mjs";

test("o catálogo cobre manutenção, versão mínima e bloqueio emergencial", () => {
  const chaves = CHAVES_CONFIGURACAO.map((item) => item.chave);
  for (const esperada of [
    "manutencao_modo",
    "versao_minima_apk",
    "versao_minima_pwa",
    "bloqueio_emergencial",
  ]) {
    assert.ok(chaves.includes(esperada), `faltou a chave ${esperada}`);
    assert.equal(
      ehAlteracaoCritica(esperada),
      true,
      `${esperada} precisa ser tratada como alteração crítica`,
    );
  }
  assert.equal(ehAlteracaoCritica("aviso_global"), false);
  assert.equal(ehAlteracaoCritica("chave_que_nao_existe"), false);
  assert.equal(configuracaoPorChave("chave_que_nao_existe"), null);
});

test("versão mínima só aceita formato semântico x.y.z", () => {
  const valida = validarValorConfiguracao("versao_minima_apk", "2.14.0");
  assert.equal(valida.valido, true);
  assert.equal(valida.valor, "2.14.0");

  for (const invalida of ["2.14", "v2.14.0", "2.14.0-beta", "", "abc", "2.14.0.1"]) {
    const resultado = validarValorConfiguracao("versao_minima_apk", invalida);
    assert.equal(
      resultado.valido,
      false,
      `"${invalida}" não pode ser aceita como versão mínima`,
    );
    assert.ok(resultado.erro.length > 0);
  }
});

test("validação normaliza booleano, número e lista, e recusa negativo", () => {
  assert.deepEqual(validarValorConfiguracao("manutencao_modo", "sim"), {
    valido: true,
    erro: "",
    valor: true,
  });
  assert.equal(validarValorConfiguracao("manutencao_modo", "0").valor, false);
  assert.equal(validarValorConfiguracao("limite_upload_mb", "25").valor, 25);
  assert.equal(validarValorConfiguracao("limite_upload_mb", -1).valido, false);
  assert.equal(validarValorConfiguracao("limite_upload_mb", "").valido, false);
  assert.deepEqual(
    validarValorConfiguracao("bloqueio_emergencial", "uploads, notificacoes, uploads")
      .valor,
    ["uploads", "notificacoes"],
  );
  assert.equal(
    validarValorConfiguracao("chave_inexistente", "x").valido,
    false,
    "chave fora do catálogo não pode ser gravada",
  );
});

test("comparação de versão mínima bloqueia cliente antigo e libera cliente em dia", () => {
  assert.equal(compararVersaoMinima("2.13.9", "2.14.0").abaixo, true);
  assert.equal(compararVersaoMinima("2.14.0", "2.14.0").abaixo, false);
  assert.equal(compararVersaoMinima("2.14.1", "2.14.0").abaixo, false);
  assert.equal(compararVersaoMinima("3.0.0", "2.14.0").abaixo, false);
  // Comparação numérica, não alfabética: 2.9.0 é anterior a 2.10.0.
  assert.equal(compararVersaoMinima("2.9.0", "2.10.0").abaixo, true);
});

test("versão malformada tem tratamento conservador e assimétrico", () => {
  // Mínimo malformado é erro de configuração: não pode derrubar a base toda.
  const minimoInvalido = compararVersaoMinima("2.14.0", "versao-errada");
  assert.equal(minimoInvalido.abaixo, false);
  assert.equal(minimoInvalido.indeterminado, true);
  const semMinimo = compararVersaoMinima("2.14.0", "");
  assert.equal(semMinimo.abaixo, false);
  assert.equal(semMinimo.indeterminado, true);

  // Cliente que não sabe informar a própria versão é tratado como antigo.
  const clienteInvalido = compararVersaoMinima("desconhecida", "2.14.0");
  assert.equal(clienteInvalido.abaixo, true);
  assert.equal(clienteInvalido.indeterminado, true);
  assert.equal(compararVersaoMinima(null, "2.14.0").abaixo, true);
});

test("liberação gradual por percentual é determinística por comunidade", () => {
  const base = {
    enabled: true,
    config: { percentual: 40, semente: "novo_feed" },
    agora: "2026-09-12T10:00:00Z",
  };
  for (const comunidadeId of [1, 7, 42, 137, 9001]) {
    const primeira = avaliarLiberacaoGradual({ ...base, comunidadeId });
    for (let repeticao = 0; repeticao < 20; repeticao += 1) {
      const outra = avaliarLiberacaoGradual({
        ...base,
        comunidadeId,
        // O horário muda a cada request; a decisão não pode mudar com ele.
        agora: `2026-09-12T${String(10 + (repeticao % 12)).padStart(2, "0")}:31:00Z`,
      });
      assert.equal(
        outra.ativa,
        primeira.ativa,
        `a comunidade ${comunidadeId} entrou e saiu do teste entre requests`,
      );
      assert.equal(outra.balde, primeira.balde);
    }
  }
  assert.equal(baldeLiberacao(42, "novo_feed"), baldeLiberacao(42, "novo_feed"));
  assert.ok(baldeLiberacao(42, "novo_feed") >= 0);
  assert.ok(baldeLiberacao(42, "novo_feed") < 100);
});

test("percentual 0 não libera ninguém e 100 libera todos", () => {
  const comunidades = Array.from({ length: 200 }, (_, indice) => indice + 1);
  for (const comunidadeId of comunidades) {
    assert.equal(
      avaliarLiberacaoGradual({
        enabled: true,
        config: { percentual: 0, semente: "x" },
        comunidadeId,
      }).ativa,
      false,
      `percentual 0 liberou a comunidade ${comunidadeId}`,
    );
    assert.equal(
      avaliarLiberacaoGradual({
        enabled: true,
        config: { percentual: 100, semente: "x" },
        comunidadeId,
      }).ativa,
      true,
      `percentual 100 deixou a comunidade ${comunidadeId} de fora`,
    );
  }
  // Com 50% a distribuição precisa dividir a base, não cair toda de um lado.
  const liberadas = comunidades.filter(
    (comunidadeId) =>
      avaliarLiberacaoGradual({
        enabled: true,
        config: { percentual: 50, semente: "x" },
        comunidadeId,
      }).ativa,
  ).length;
  assert.ok(
    liberadas > 60 && liberadas < 140,
    `distribuição desequilibrada: ${liberadas} de 200`,
  );
});

test("lista de comunidades libera nominalmente e restringe quem está fora", () => {
  const config = { comunidades: [7, 9] };
  assert.equal(
    avaliarLiberacaoGradual({ enabled: true, config, comunidadeId: 7 }).ativa,
    true,
  );
  const fora = avaliarLiberacaoGradual({ enabled: true, config, comunidadeId: 8 });
  assert.equal(fora.ativa, false);
  assert.equal(fora.decisao, "FORA_DA_LISTA");
  // Lista + percentual: quem está na lista entra mesmo com percentual 0.
  assert.equal(
    avaliarLiberacaoGradual({
      enabled: true,
      config: { comunidades: [7], percentual: 0 },
      comunidadeId: 7,
    }).ativa,
    true,
  );
});

test("flag desligada e janela de tempo mandam mais que o percentual", () => {
  assert.equal(
    avaliarLiberacaoGradual({
      enabled: false,
      config: { percentual: 100 },
      comunidadeId: 3,
    }).ativa,
    false,
  );
  const janela = {
    enabled: true,
    comunidadeId: 3,
    config: { percentual: 100 },
    iniciaEm: "2026-09-10T00:00:00Z",
    terminaEm: "2026-09-20T00:00:00Z",
  };
  assert.equal(
    avaliarLiberacaoGradual({ ...janela, agora: "2026-09-09T23:59:00Z" }).ativa,
    false,
  );
  assert.equal(
    avaliarLiberacaoGradual({ ...janela, agora: "2026-09-12T10:00:00Z" }).ativa,
    true,
  );
  assert.equal(
    avaliarLiberacaoGradual({ ...janela, agora: "2026-09-21T00:00:00Z" }).ativa,
    false,
  );
  assert.equal(
    avaliarLiberacaoGradual({ ...janela, agora: "2026-09-09T23:59:00Z" }).decisao,
    "ANTES_DA_JANELA",
  );
  assert.equal(
    avaliarLiberacaoGradual({ ...janela, agora: "2026-09-21T00:00:00Z" }).decisao,
    "DEPOIS_DA_JANELA",
  );
  // Sem lista e sem percentual, a flag ligada vale para todos.
  assert.equal(
    avaliarLiberacaoGradual({ enabled: true, config: {}, comunidadeId: 3 }).ativa,
    true,
  );
  // config_json gravado como texto no banco é aceito do mesmo jeito.
  assert.equal(
    avaliarLiberacaoGradual({
      enabled: 1,
      config: '{"percentual":100}',
      comunidadeId: 3,
    }).ativa,
    true,
  );
});

test("manutenção global vence comunidade, que vence módulo", () => {
  const agora = "2026-09-12T10:00:00Z";
  const global = { ativa: true, motivo: "Migração do banco" };
  const comunidade = { ativa: true, motivo: "Ajuste da igreja" };
  const modulo = { ativa: true, motivo: "Escalas fora do ar" };

  const tudo = resolverManutencao({ global, comunidade, modulo, agora });
  assert.equal(tudo.escopo, "GLOBAL");
  assert.equal(tudo.motivo, "Migração do banco");

  const semGlobal = resolverManutencao({ comunidade, modulo, agora });
  assert.equal(semGlobal.escopo, "COMUNIDADE");
  assert.equal(semGlobal.motivo, "Ajuste da igreja");

  const soModulo = resolverManutencao({ modulo, agora });
  assert.equal(soModulo.escopo, "MODULO");
  assert.equal(soModulo.emManutencao, true);

  const nenhuma = resolverManutencao({
    global: { ativa: false },
    comunidade: null,
    agora,
  });
  assert.deepEqual(nenhuma, {
    emManutencao: false,
    escopo: null,
    motivo: "",
    ate: null,
  });
});

test("manutenção com prazo vencido deixa de valer sozinha", () => {
  const agora = "2026-09-12T10:00:00Z";
  const vencida = { ativa: true, motivo: "Janela da madrugada", ate: "2026-09-12T06:00:00Z" };
  const valida = { ativa: true, motivo: "Ajuste da igreja", ate: "2026-09-12T23:00:00Z" };

  assert.equal(
    resolverManutencao({ global: vencida, comunidade: valida, agora }).escopo,
    "COMUNIDADE",
    "manutenção global vencida não pode continuar mascarando a da comunidade",
  );
  assert.equal(
    resolverManutencao({ global: vencida, agora }).emManutencao,
    false,
  );
  assert.equal(
    resolverManutencao({ global: valida, agora }).ate,
    "2026-09-12T23:00:00.000Z",
  );
});

test("limites aceitam apenas números não negativos", () => {
  const ok = validarLimites({ membros: "120", eventos: 30, armazenamento_mb: 0 });
  assert.equal(ok.valido, true);
  assert.deepEqual(ok.limites, { membros: 120, eventos: 30, armazenamento_mb: 0 });
  assert.equal(validarLimites({ membros: -1 }).valido, false);
  assert.equal(validarLimites({ membros: "muitos" }).valido, false);
  assert.equal(validarLimites("não é json").valido, false);
  assert.equal(validarLimites(null).valido, false);
});

test("consumo contra limite não inventa percentual quando não há limite", () => {
  assert.deepEqual(situacaoLimite(40, 0), {
    usado: 40,
    teto: 0,
    percentual: null,
    nivel: "SEM_LIMITE",
  });
  assert.equal(situacaoLimite(40, 100).nivel, "NORMAL");
  assert.equal(situacaoLimite(85, 100).nivel, "ATENCAO");
  assert.equal(situacaoLimite(120, 100).nivel, "ESTOURADO");
  assert.equal(situacaoLimite(120, 100).percentual, 120);
});
