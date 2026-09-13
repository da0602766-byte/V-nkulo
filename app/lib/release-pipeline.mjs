// Núcleo puro da governança de publicação (release).
//
// ATENÇÃO AO ESCOPO: "pipeline" aqui é o REGISTRO e a GOVERNANÇA do processo de
// publicação — quem aprovou, o que rodou, quanto demorou, o que falhou e o que
// precisa ser revertido. Este código NÃO executa build, NÃO roda testes e NÃO
// faz deploy de verdade: a execução acontece no CI/hospedagem, que reporta cada
// etapa pela API `/api/proprietario/publicacoes`. Nada aqui inventa log,
// resultado de teste ou métrica de saúde — o que não foi reportado aparece como
// não reportado, nunca como sucesso presumido.
//
// A regra central que este módulo protege: publicação em PRODUCAO só avança com
// aprovação explícita registrada. Nenhum caminho automático publica sem ela.
//
// Fica em .mjs (e não .ts) pela mesma razão que tenant-policy.mjs e
// incident-grouping.mjs: são funções puras, e assim os testes em tests/
// conseguem importá-las direto. O nome precisa ser diferente de qualquer .ts
// existente: com o mesmo basename o bundler resolve o .mjs no lugar do .ts e o
// build quebra.

/**
 * @typedef {{ chave: string, rotulo: string, ordem: number, critica: boolean,
 *             descricao: string }} EtapaPipeline
 * @typedef {{ etapa: string, status?: string, duracaoMs?: number,
 *             iniciadoEm?: string | null, concluidoEm?: string | null,
 *             resultado?: string, logs?: string }} EtapaRegistrada
 * @typedef {{ permitido: boolean, motivo: string }} Permissao
 * @typedef {{ saudavel: boolean, gravidade: "SAUDAVEL" | "ATENCAO" | "CRITICA" | "DESCONHECIDA",
 *             exigeRollback: boolean, motivo: string,
 *             falhas: { chave: string, rotulo: string, critica: boolean, detalhe: string }[],
 *             verificadas: number, taxaErro: number | null,
 *             limiteErro: number }} AvaliacaoSaude
 */

/**
 * Sequência fixa do pipeline de publicação. A ordem é a mesma sempre: mudar a
 * sequência é mudar a governança, não uma configuração de tela.
 *
 * `critica: true` marca a etapa cujo fracasso compromete a publicação — é o que
 * alimenta a decisão de reversão automática.
 * @type {EtapaPipeline[]}
 */
export const ETAPAS_PIPELINE = [
  {
    chave: "COMMIT",
    rotulo: "Commit",
    ordem: 1,
    critica: false,
    descricao: "Código enviado e identificado por commit, branch e autor.",
  },
  {
    chave: "VALIDACAO",
    rotulo: "Validação",
    ordem: 2,
    critica: true,
    descricao: "Verificações estáticas reportadas pelo CI (tipos, lint).",
  },
  {
    chave: "BUILD",
    rotulo: "Build",
    ordem: 3,
    critica: true,
    descricao: "Compilação reportada pelo CI.",
  },
  {
    chave: "TESTES",
    rotulo: "Testes",
    ordem: 4,
    critica: true,
    descricao: "Suíte automatizada reportada pelo CI.",
  },
  {
    chave: "PREVIA",
    rotulo: "Prévia",
    ordem: 5,
    critica: false,
    descricao: "Ambiente de prévia publicado para conferência.",
  },
  {
    chave: "APROVACAO",
    rotulo: "Aprovação",
    ordem: 6,
    critica: true,
    descricao: "Decisão humana registrada antes de ir ao ar.",
  },
  {
    chave: "PUBLICACAO",
    rotulo: "Publicação",
    ordem: 7,
    critica: true,
    descricao: "Liberação para o ambiente de destino.",
  },
  {
    chave: "HEALTH_CHECK",
    rotulo: "Verificação de saúde",
    ordem: 8,
    critica: true,
    descricao: "Checagens pós-publicação reportadas pela hospedagem.",
  },
  {
    chave: "CONCLUIDO",
    rotulo: "Concluído",
    ordem: 9,
    critica: false,
    descricao: "Publicação encerrada e registrada no histórico.",
  },
];

/** Chaves do pipeline, na ordem. @type {string[]} */
export const CHAVES_ETAPAS = ETAPAS_PIPELINE.map((etapa) => etapa.chave);

export const AMBIENTES_PUBLICACAO = ["PRODUCAO", "PREVIA", "HOMOLOGACAO"];

export const STATUS_PUBLICACAO = [
  "PENDENTE",
  "EM_ANDAMENTO",
  "AGUARDANDO_APROVACAO",
  "PUBLICADO",
  "FALHOU",
  "REVERTIDO",
  "CANCELADO",
];

export const STATUS_ETAPA = [
  "PENDENTE",
  "EM_ANDAMENTO",
  "SUCESSO",
  "FALHA",
  "PULADA",
];

export const STATUS_APROVACAO = ["PENDENTE", "APROVADO", "RECUSADO"];

const ROTULOS_AMBIENTE = {
  PRODUCAO: "Produção",
  PREVIA: "Prévia",
  HOMOLOGACAO: "Homologação",
};

const ROTULOS_STATUS_PUBLICACAO = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  PUBLICADO: "Publicado",
  FALHOU: "Falhou",
  REVERTIDO: "Revertido",
  CANCELADO: "Cancelado",
};

const ROTULOS_STATUS_ETAPA = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  SUCESSO: "Sucesso",
  FALHA: "Falha",
  PULADA: "Pulada",
};

const ROTULOS_APROVACAO = {
  PENDENTE: "Aguardando decisão",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};

/** Estados finais: uma publicação nestes estados não avança mais. */
const ESTADOS_ENCERRADOS = ["PUBLICADO", "REVERTIDO", "CANCELADO"];

const texto = (valor) => String(valor ?? "").trim();
const chave = (valor) => texto(valor).toUpperCase();

/**
 * @param {unknown} valor
 * @returns {EtapaPipeline | null}
 */
export function etapaPorChave(valor) {
  const alvo = chave(valor);
  return ETAPAS_PIPELINE.find((etapa) => etapa.chave === alvo) || null;
}

/**
 * Rótulo em português de qualquer conjunto fechado deste módulo.
 * @param {"etapa" | "ambiente" | "status" | "statusEtapa" | "aprovacao"} tipo
 * @param {unknown} valor
 */
export function rotularPublicacao(tipo, valor) {
  const alvo = chave(valor);
  if (tipo === "etapa") return etapaPorChave(alvo)?.rotulo || alvo;
  if (tipo === "ambiente") return ROTULOS_AMBIENTE[alvo] || alvo;
  if (tipo === "status") return ROTULOS_STATUS_PUBLICACAO[alvo] || alvo;
  if (tipo === "statusEtapa") return ROTULOS_STATUS_ETAPA[alvo] || alvo;
  return ROTULOS_APROVACAO[alvo] || alvo;
}

export function normalizarAmbiente(valor) {
  const alvo = chave(valor);
  return AMBIENTES_PUBLICACAO.includes(alvo) ? alvo : "PRODUCAO";
}

export function normalizarStatusPublicacao(valor) {
  const alvo = chave(valor);
  return STATUS_PUBLICACAO.includes(alvo) ? alvo : "PENDENTE";
}

export function normalizarStatusEtapa(valor) {
  const alvo = chave(valor);
  return STATUS_ETAPA.includes(alvo) ? alvo : "PENDENTE";
}

export function normalizarAprovacao(valor) {
  const alvo = chave(valor);
  return STATUS_APROVACAO.includes(alvo) ? alvo : "PENDENTE";
}

/**
 * Próxima etapa da sequência fixa, ou null no fim do pipeline.
 *
 * Etapa desconhecida também devolve null, e não a primeira etapa: num pipeline
 * de publicação, tratar um valor inesperado como "começa do COMMIT" reiniciaria
 * a trilha em silêncio. Mesma postura de `podeAvancar`, que recusa etapa fora
 * da sequência em vez de adivinhar.
 * @param {unknown} etapaAtual
 * @returns {EtapaPipeline | null}
 */
export function proximaEtapa(etapaAtual) {
  const atual = etapaPorChave(etapaAtual);
  if (!atual) return null;
  return ETAPAS_PIPELINE.find((etapa) => etapa.ordem === atual.ordem + 1) || null;
}

/**
 * Etapa anterior da sequência fixa, ou null no início do pipeline.
 * @param {unknown} etapaAtual
 * @returns {EtapaPipeline | null}
 */
export function etapaAnterior(etapaAtual) {
  const atual = etapaPorChave(etapaAtual);
  if (!atual) return null;
  return ETAPAS_PIPELINE.find((etapa) => etapa.ordem === atual.ordem - 1) || null;
}

/**
 * Lista inicial das etapas de uma publicação recém-registrada — todas
 * PENDENTES, sem duração e sem log. Nada é dado como executado.
 * @returns {{ etapa: string, ordem: number, status: "PENDENTE" }[]}
 */
export function etapasIniciais() {
  return ETAPAS_PIPELINE.map((etapa) => ({
    etapa: etapa.chave,
    ordem: etapa.ordem,
    status: /** @type {"PENDENTE"} */ ("PENDENTE"),
  }));
}

/**
 * REGRA CENTRAL DA GOVERNANÇA.
 *
 * Diz se uma etapa pode ser iniciada agora. O ponto inegociável: a etapa
 * PUBLICACAO em ambiente PRODUCAO só começa com `aprovacaoStatus` igual a
 * "APROVADO". Não existe publicação automática em produção sem aprovação
 * registrada — nem quando todas as etapas anteriores passaram.
 *
 * @param {{ etapa?: unknown, status?: unknown, aprovacaoStatus?: unknown,
 *           ambiente?: unknown }} entrada
 * @returns {Permissao}
 */
export function podeAvancar(entrada) {
  const dados = entrada || {};
  const alvo = etapaPorChave(dados.etapa);
  if (!alvo)
    return {
      permitido: false,
      motivo: "Etapa desconhecida: não faz parte do pipeline de publicação.",
    };

  const status = normalizarStatusPublicacao(dados.status);
  const ambiente = normalizarAmbiente(dados.ambiente);
  const aprovacao = normalizarAprovacao(dados.aprovacaoStatus);

  if (ESTADOS_ENCERRADOS.includes(status))
    return {
      permitido: false,
      motivo: `Publicação ${rotularPublicacao("status", status).toLowerCase()}: nenhuma etapa pode ser iniciada.`,
    };

  if (status === "FALHOU" && alvo.chave !== "HEALTH_CHECK")
    return {
      permitido: false,
      motivo:
        "Publicação com falha registrada: corrija e registre uma nova publicação.",
    };

  // Aprovação recusada encerra o caminho até o ar em qualquer ambiente.
  if (aprovacao === "RECUSADO" && alvo.ordem >= 7)
    return {
      permitido: false,
      motivo: "Aprovação recusada: esta publicação não pode ir ao ar.",
    };

  if (alvo.chave === "PUBLICACAO" && ambiente === "PRODUCAO" && aprovacao !== "APROVADO")
    return {
      permitido: false,
      motivo:
        "Publicação em produção exige aprovação explícita registrada antes de ir ao ar.",
    };

  if (alvo.chave === "PUBLICACAO")
    return {
      permitido: true,
      motivo:
        ambiente === "PRODUCAO"
          ? "Aprovação registrada: publicação liberada."
          : `Ambiente ${rotularPublicacao("ambiente", ambiente).toLowerCase()} não exige aprovação para publicar.`,
    };

  return { permitido: true, motivo: `Etapa ${alvo.rotulo} liberada.` };
}

/** Limite padrão de taxa de erro pós-publicação (em %). */
export const LIMITE_TAXA_ERRO = 5;

/**
 * Avalia o resultado do health check reportado pela hospedagem.
 *
 * Espera `{ verificacoes: [{ chave, rotulo, ok, critica, detalhe }],
 * taxaErro, limiteErro }`. Sem verificação reportada a resposta é
 * DESCONHECIDA — ausência de dado não vira "saudável".
 *
 * Falha crítica (verificação marcada como crítica reprovada, ou taxa de erro
 * acima do limite) exige reversão automática.
 *
 * @param {unknown} resultado
 * @returns {AvaliacaoSaude}
 */
export function avaliarHealthCheck(resultado) {
  const dados = /** @type {Record<string, any>} */ (
    resultado && typeof resultado === "object" ? resultado : {}
  );
  const lista = Array.isArray(dados.verificacoes) ? dados.verificacoes : [];
  const limiteErro = Number.isFinite(Number(dados.limiteErro))
    ? Number(dados.limiteErro)
    : LIMITE_TAXA_ERRO;
  const taxaErro = Number.isFinite(Number(dados.taxaErro))
    ? Number(dados.taxaErro)
    : null;

  const verificacoes = lista.map((item) => {
    const registro = item && typeof item === "object" ? item : {};
    return {
      chave: texto(registro.chave) || texto(registro.rotulo) || "verificacao",
      rotulo: texto(registro.rotulo) || texto(registro.chave) || "Verificação",
      critica: registro.critica === true,
      ok: registro.ok === true,
      detalhe: texto(registro.detalhe),
    };
  });

  const falhas = verificacoes
    .filter((item) => !item.ok)
    .map((item) => ({
      chave: item.chave,
      rotulo: item.rotulo,
      critica: item.critica,
      detalhe: item.detalhe,
    }));
  const falhasCriticas = falhas.filter((item) => item.critica);
  const taxaEstourada = taxaErro !== null && taxaErro > limiteErro;

  if (verificacoes.length === 0 && taxaErro === null)
    return {
      saudavel: false,
      gravidade: "DESCONHECIDA",
      exigeRollback: false,
      motivo:
        "Nenhuma verificação de saúde reportada — a hospedagem ainda não enviou o resultado.",
      falhas: [],
      verificadas: 0,
      taxaErro: null,
      limiteErro,
    };

  if (falhasCriticas.length > 0 || taxaEstourada)
    return {
      saudavel: false,
      gravidade: "CRITICA",
      exigeRollback: true,
      motivo: taxaEstourada
        ? `Taxa de erro de ${taxaErro}% acima do limite de ${limiteErro}%.`
        : `Verificação crítica reprovada: ${falhasCriticas
            .map((item) => item.rotulo)
            .join(", ")}.`,
      falhas,
      verificadas: verificacoes.length,
      taxaErro,
      limiteErro,
    };

  if (falhas.length > 0)
    return {
      saudavel: false,
      gravidade: "ATENCAO",
      exigeRollback: false,
      motivo: `Verificação não crítica reprovada: ${falhas
        .map((item) => item.rotulo)
        .join(", ")}.`,
      falhas,
      verificadas: verificacoes.length,
      taxaErro,
      limiteErro,
    };

  return {
    saudavel: true,
    gravidade: "SAUDAVEL",
    exigeRollback: false,
    motivo: "Todas as verificações reportadas passaram.",
    falhas: [],
    verificadas: verificacoes.length,
    taxaErro,
    limiteErro,
  };
}

const ORDEM_PUBLICACAO =
  ETAPAS_PIPELINE.find((etapa) => etapa.chave === "PUBLICACAO")?.ordem || 7;

/**
 * Decide a reversão automática: verdadeiro quando uma etapa crítica falhou
 * DEPOIS de a publicação começar (PUBLICACAO ou HEALTH_CHECK), ou quando o
 * health check reprovou de forma crítica. Falha antes da publicação não gera
 * reversão — não há nada no ar para reverter.
 *
 * @param {{ etapas?: EtapaRegistrada[], healthCheck?: unknown }} entrada
 * @returns {boolean}
 */
export function deveReverterAutomaticamente(entrada) {
  const dados = entrada || {};
  const etapas = Array.isArray(dados.etapas) ? dados.etapas : [];

  const falhaCriticaPosPublicacao = etapas.some((registro) => {
    const definicao = etapaPorChave(registro?.etapa);
    if (!definicao) return false;
    return (
      definicao.critica &&
      definicao.ordem >= ORDEM_PUBLICACAO &&
      normalizarStatusEtapa(registro?.status) === "FALHA"
    );
  });
  if (falhaCriticaPosPublicacao) return true;

  // Só faz sentido reverter pelo health check se a publicação chegou ao ar.
  const publicou = etapas.some(
    (registro) =>
      chave(registro?.etapa) === "PUBLICACAO" &&
      normalizarStatusEtapa(registro?.status) === "SUCESSO",
  );
  if (!publicou) return false;
  return avaliarHealthCheck(dados.healthCheck).exigeRollback;
}

/**
 * Resumo do andamento: quantas etapas concluíram, duração somada do que foi
 * reportado e a primeira etapa que falhou (a que explica a parada).
 *
 * A duração é a soma do que o CI reportou — etapa sem duração reportada entra
 * como zero e é contada em `semDuracao`, para a tela não dar a impressão de
 * que o tempo total é completo quando não é.
 *
 * @param {EtapaRegistrada[]} etapas
 */
export function resumirPipeline(etapas) {
  const lista = (Array.isArray(etapas) ? etapas : [])
    .map((registro) => {
      const definicao = etapaPorChave(registro?.etapa);
      if (!definicao) return null;
      const duracaoMs = Number(registro?.duracaoMs) || 0;
      return {
        etapa: definicao.chave,
        rotulo: definicao.rotulo,
        ordem: definicao.ordem,
        critica: definicao.critica,
        status: normalizarStatusEtapa(registro?.status),
        duracaoMs: duracaoMs > 0 ? duracaoMs : 0,
      };
    })
    .filter((registro) => registro !== null)
    .sort((a, b) => a.ordem - b.ordem);

  const total = ETAPAS_PIPELINE.length;
  const concluidas = lista.filter((item) => item.status === "SUCESSO").length;
  const puladas = lista.filter((item) => item.status === "PULADA").length;
  const falhas = lista.filter((item) => item.status === "FALHA");
  const emAndamento = lista.find((item) => item.status === "EM_ANDAMENTO") || null;
  const duracaoMs = lista.reduce((soma, item) => soma + item.duracaoMs, 0);
  const reportadas = lista.filter((item) => item.status !== "PENDENTE");

  return {
    total,
    registradas: lista.length,
    concluidas,
    puladas,
    falhadas: falhas.length,
    pendentes: total - concluidas - puladas - falhas.length,
    progresso: total === 0 ? 0 : Math.round(((concluidas + puladas) / total) * 100),
    duracaoMs,
    semDuracao: reportadas.filter((item) => item.duracaoMs === 0).length,
    emAndamento: emAndamento ? emAndamento.etapa : null,
    primeiraFalha: falhas.length > 0 ? falhas[0].etapa : null,
    primeiraFalhaRotulo: falhas.length > 0 ? falhas[0].rotulo : "",
    concluido: concluidas + puladas === total,
  };
}

/**
 * Comparação de versões semânticas simples ("1.4.2", "v2.0.0", "1.4.2-beta.1").
 * Devolve -1 quando `a` é anterior a `b`, 1 quando é posterior e 0 quando são
 * equivalentes. Pré-lançamento é sempre anterior à versão final de mesmo
 * número, como manda o semver.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {-1 | 0 | 1}
 */
export function compararVersoes(a, b) {
  const partir = (valor) => {
    const bruto = texto(valor).replace(/^v/i, "");
    const [nucleo, ...resto] = bruto.split("-");
    const numeros = nucleo
      .split(".")
      .map((parte) => Number.parseInt(parte, 10))
      .map((numero) => (Number.isFinite(numero) ? numero : 0));
    while (numeros.length < 3) numeros.push(0);
    return { numeros, pre: resto.join("-") };
  };

  const primeira = partir(a);
  const segunda = partir(b);
  const tamanho = Math.max(primeira.numeros.length, segunda.numeros.length);
  for (let indice = 0; indice < tamanho; indice += 1) {
    const esquerda = primeira.numeros[indice] || 0;
    const direita = segunda.numeros[indice] || 0;
    if (esquerda !== direita) return esquerda > direita ? 1 : -1;
  }
  if (primeira.pre === segunda.pre) return 0;
  if (!primeira.pre) return 1;
  if (!segunda.pre) return -1;
  return primeira.pre > segunda.pre ? 1 : -1;
}

/**
 * Texto curto de duração, em português, para a trilha do pipeline.
 * @param {unknown} valor duração em milissegundos
 */
export function formatarDuracao(valor) {
  const ms = Number(valor) || 0;
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  if (minutos < 60) return resto ? `${minutos} min ${resto} s` : `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas} h ${minutos % 60} min`;
}
