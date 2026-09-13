// Núcleo puro dos controles globais do proprietário: catálogo de
// configurações versionadas, validação de valor, comparação de versão mínima
// de aplicativo, liberação gradual determinística de feature flag e
// precedência do modo de manutenção.
//
// Fica em .mjs (e não .ts) pela mesma razão que tenant-policy.mjs e
// incident-grouping.mjs: são funções puras, e assim os testes em tests/
// conseguem importá-las direto. O nome precisa ser diferente de qualquer .ts:
// com o mesmo basename o bundler resolve o .mjs no lugar do .ts e o build
// quebra.

/**
 * @typedef {"BOOLEANO" | "TEXTO" | "NUMERO" | "VERSAO" | "LISTA_TEXTO"} TipoValor
 * @typedef {{ chave: string, rotulo: string, descricao: string,
 *             tipo: TipoValor, critica: boolean, padrao: unknown,
 *             escopos: string[] }} ConfiguracaoCatalogo
 */

export const TIPOS_VALOR = Object.freeze([
  "BOOLEANO",
  "TEXTO",
  "NUMERO",
  "VERSAO",
  "LISTA_TEXTO",
]);

export const ESCOPOS_CONFIGURACAO = Object.freeze([
  "GLOBAL",
  "COMUNIDADE",
  "MODULO",
]);

// Os módulos não têm tabela própria no banco. Como `escopo_id` é inteiro, o
// catálogo fixa um id estável por módulo — mudar um id aqui desconecta o
// histórico daquele módulo, então ids só podem ser acrescentados, nunca
// reaproveitados.
export const MODULOS_PLATAFORMA = Object.freeze([
  { id: 1, chave: "AVISOS", rotulo: "Avisos e publicações" },
  { id: 2, chave: "EVENTOS", rotulo: "Eventos e agenda" },
  { id: 3, chave: "ESCALAS", rotulo: "Escalas e ministérios" },
  { id: 4, chave: "CELULAS", rotulo: "Células" },
  { id: 5, chave: "RECEPCAO", rotulo: "Recepção e visitantes" },
  { id: 6, chave: "ESTACIONAMENTO", rotulo: "Estacionamento" },
  { id: 7, chave: "FINANCEIRO", rotulo: "Financeiro e assinaturas" },
  { id: 8, chave: "MIDIA", rotulo: "Mídia e uploads" },
  { id: 9, chave: "NOTIFICACOES", rotulo: "Notificações" },
  { id: 10, chave: "INTEGRACOES", rotulo: "Integrações externas" },
]);

/** @type {readonly ConfiguracaoCatalogo[]} */
export const CHAVES_CONFIGURACAO = Object.freeze([
  Object.freeze({
    chave: "manutencao_modo",
    rotulo: "Modo de manutenção",
    descricao:
      "Coloca a plataforma inteira, uma comunidade ou um módulo em manutenção. Enquanto ativo, o acesso fica restrito e a mensagem abaixo é exibida.",
    tipo: "BOOLEANO",
    critica: true,
    padrao: false,
    escopos: ["GLOBAL", "COMUNIDADE", "MODULO"],
  }),
  Object.freeze({
    chave: "manutencao_motivo",
    rotulo: "Motivo exibido na manutenção",
    descricao:
      "Texto mostrado a quem tenta acessar durante a manutenção. Sem texto, é exibida uma mensagem genérica.",
    tipo: "TEXTO",
    critica: false,
    padrao: "",
    escopos: ["GLOBAL", "COMUNIDADE", "MODULO"],
  }),
  Object.freeze({
    chave: "manutencao_ate",
    rotulo: "Previsão de retorno",
    descricao:
      "Data e hora previstas para o fim da manutenção (texto ISO). Depois desse instante a manutenção deixa de valer sozinha.",
    tipo: "TEXTO",
    critica: false,
    padrao: "",
    escopos: ["GLOBAL", "COMUNIDADE", "MODULO"],
  }),
  Object.freeze({
    chave: "versao_minima_apk",
    rotulo: "Versão mínima do aplicativo (APK)",
    descricao:
      "Aplicativos Android abaixo desta versão são bloqueados e orientados a atualizar. Formato x.y.z.",
    tipo: "VERSAO",
    critica: true,
    padrao: "0.0.0",
    escopos: ["GLOBAL"],
  }),
  Object.freeze({
    chave: "versao_minima_pwa",
    rotulo: "Versão mínima do PWA",
    descricao:
      "Instalações web abaixo desta versão são forçadas a recarregar para pegar a versão nova. Formato x.y.z.",
    tipo: "VERSAO",
    critica: true,
    padrao: "0.0.0",
    escopos: ["GLOBAL"],
  }),
  Object.freeze({
    chave: "bloqueio_emergencial",
    rotulo: "Bloqueio emergencial de recurso",
    descricao:
      "Lista de recursos desligados na marra, sem publicação nova. Use quando um recurso está causando dano e precisa parar agora.",
    tipo: "LISTA_TEXTO",
    critica: true,
    padrao: [],
    escopos: ["GLOBAL", "COMUNIDADE"],
  }),
  Object.freeze({
    chave: "bloqueio_emergencial_motivo",
    rotulo: "Motivo do bloqueio emergencial",
    descricao:
      "Explicação registrada e exibida para quem tentar usar o recurso bloqueado.",
    tipo: "TEXTO",
    critica: false,
    padrao: "",
    escopos: ["GLOBAL", "COMUNIDADE"],
  }),
  Object.freeze({
    chave: "limite_upload_mb",
    rotulo: "Limite de upload por arquivo (MB)",
    descricao:
      "Tamanho máximo aceito em cada envio de mídia. Zero significa usar o limite do plano.",
    tipo: "NUMERO",
    critica: false,
    padrao: 0,
    escopos: ["GLOBAL", "COMUNIDADE"],
  }),
  Object.freeze({
    chave: "aviso_global",
    rotulo: "Aviso global da plataforma",
    descricao:
      "Mensagem exibida no topo para todas as comunidades. Vazio não exibe nada.",
    tipo: "TEXTO",
    critica: false,
    padrao: "",
    escopos: ["GLOBAL"],
  }),
]);

// Flags que a plataforma já consulta hoje (pilot-data.ts). Elas continuam
// gravadas na tabela `feature_flags` existente — este catálogo só dá rótulo em
// pt-BR para a tela do proprietário.
export const FLAGS_CONHECIDAS = Object.freeze([
  Object.freeze({
    chave: "network_module_enabled",
    rotulo: "Módulo de redes de igrejas",
    critica: true,
  }),
  Object.freeze({
    chave: "affiliate_creation_enabled",
    rotulo: "Criação de igrejas afiliadas",
    critica: true,
  }),
  Object.freeze({
    chave: "payments_enabled",
    rotulo: "Pagamentos e cobrança",
    critica: true,
  }),
  Object.freeze({
    chave: "ai_editorial_enabled",
    rotulo: "Assistente editorial com IA",
    critica: false,
  }),
  Object.freeze({
    chave: "ai_auto_publish_enabled",
    rotulo: "Publicação automática da IA",
    critica: true,
  }),
]);

const CATALOGO_POR_CHAVE = new Map(
  CHAVES_CONFIGURACAO.map((item) => [item.chave, item]),
);

/**
 * @param {unknown} chave
 * @returns {ConfiguracaoCatalogo | null}
 */
export function configuracaoPorChave(chave) {
  return CATALOGO_POR_CHAVE.get(String(chave || "").trim()) || null;
}

/**
 * Só o catálogo decide o que é crítico — nenhuma tela pode marcar como comum
 * uma alteração que derruba acesso.
 * @param {unknown} chave
 */
export function ehAlteracaoCritica(chave) {
  return Boolean(configuracaoPorChave(chave)?.critica);
}

/**
 * @param {unknown} chave
 * @param {unknown} escopoTipo
 */
export function escopoPermitido(chave, escopoTipo) {
  const item = configuracaoPorChave(chave);
  if (!item) return false;
  return item.escopos.includes(String(escopoTipo || "").trim().toUpperCase());
}

const VERSAO_SEMANTICA = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;

/**
 * Partes numéricas de uma versão x.y.z, ou null quando o formato não bate.
 * @param {unknown} valor
 * @returns {number[] | null}
 */
export function partesVersao(valor) {
  const texto = String(valor ?? "").trim();
  const partes = VERSAO_SEMANTICA.exec(texto);
  if (!partes) return null;
  return [Number(partes[1]), Number(partes[2]), Number(partes[3])];
}

/** @param {unknown} valor */
export function versaoValida(valor) {
  return partesVersao(valor) !== null;
}

/**
 * Valida e normaliza o valor de uma configuração conforme o tipo do catálogo.
 * @param {unknown} chave
 * @param {unknown} valor
 * @returns {{ valido: boolean, erro: string, valor: unknown }}
 */
export function validarValorConfiguracao(chave, valor) {
  const item = configuracaoPorChave(chave);
  if (!item)
    return { valido: false, erro: "Configuração não reconhecida.", valor: null };

  if (item.tipo === "BOOLEANO") {
    if (typeof valor === "boolean")
      return { valido: true, erro: "", valor };
    const texto = String(valor ?? "").trim().toLowerCase();
    if (["true", "1", "sim", "ativo"].includes(texto))
      return { valido: true, erro: "", valor: true };
    if (["false", "0", "nao", "não", "inativo", ""].includes(texto))
      return { valido: true, erro: "", valor: false };
    return {
      valido: false,
      erro: "Informe ligado ou desligado.",
      valor: null,
    };
  }

  if (item.tipo === "NUMERO") {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || String(valor ?? "").trim() === "")
      return { valido: false, erro: "Informe um número.", valor: null };
    if (numero < 0)
      return {
        valido: false,
        erro: "O número não pode ser negativo.",
        valor: null,
      };
    return { valido: true, erro: "", valor: Math.round(numero) };
  }

  if (item.tipo === "VERSAO") {
    const partes = partesVersao(valor);
    if (!partes)
      return {
        valido: false,
        erro: "Use o formato de versão x.y.z, por exemplo 2.14.0.",
        valor: null,
      };
    return { valido: true, erro: "", valor: partes.join(".") };
  }

  if (item.tipo === "LISTA_TEXTO") {
    const bruto = Array.isArray(valor)
      ? valor
      : String(valor ?? "")
          .split(/[\n,;]/)
          .map((parte) => parte.trim());
    const lista = [];
    for (const entrada of bruto) {
      const texto = String(entrada ?? "").trim().slice(0, 80);
      if (!texto) continue;
      if (!lista.includes(texto)) lista.push(texto);
      if (lista.length > 50)
        return {
          valido: false,
          erro: "A lista aceita no máximo 50 itens.",
          valor: null,
        };
    }
    return { valido: true, erro: "", valor: lista };
  }

  // TEXTO
  if (valor !== null && typeof valor === "object")
    return { valido: false, erro: "Informe um texto.", valor: null };
  const texto = String(valor ?? "").trim();
  if (texto.length > 500)
    return {
      valido: false,
      erro: "O texto aceita no máximo 500 caracteres.",
      valor: null,
    };
  return { valido: true, erro: "", valor: texto };
}

/**
 * Compara a versão do cliente com a versão mínima exigida.
 *
 * Decisões conservadoras, deliberadas e assimétricas:
 * - Mínimo malformado (erro de configuração do proprietário) NUNCA bloqueia:
 *   um valor digitado errado não pode derrubar a base inteira de usuários.
 *   Devolve `indeterminado: true` e `abaixo: false`.
 * - Cliente malformado ou ausente é tratado como ABAIXO do mínimo: um app que
 *   não sabe informar a própria versão é antigo ou adulterado, e forçá-lo a
 *   atualizar é reversível — deixá-lo entrar não é.
 *
 * @param {unknown} versaoCliente
 * @param {unknown} versaoMinima
 * @returns {{ abaixo: boolean, indeterminado: boolean,
 *             comparacao: number, motivo: string }}
 */
export function compararVersaoMinima(versaoCliente, versaoMinima) {
  const minima = partesVersao(versaoMinima);
  if (!minima)
    return {
      abaixo: false,
      indeterminado: true,
      comparacao: 0,
      motivo:
        "Versão mínima não configurada ou em formato inválido — nada é bloqueado.",
    };
  const cliente = partesVersao(versaoCliente);
  if (!cliente)
    return {
      abaixo: true,
      indeterminado: true,
      comparacao: -1,
      motivo:
        "O aplicativo não informou uma versão válida e é tratado como desatualizado.",
    };
  let comparacao = 0;
  for (let indice = 0; indice < 3; indice += 1) {
    if (cliente[indice] !== minima[indice]) {
      comparacao = cliente[indice] < minima[indice] ? -1 : 1;
      break;
    }
  }
  return {
    abaixo: comparacao < 0,
    indeterminado: false,
    comparacao,
    motivo:
      comparacao < 0
        ? `Versão ${cliente.join(".")} é anterior à mínima ${minima.join(".")}.`
        : "Versão em dia.",
  };
}

/**
 * Hash estável (FNV-1a de 32 bits) usado para distribuir comunidades em
 * baldes de 0 a 99. Precisa ser determinístico e independente de horário,
 * ordem de request ou estado do processo — é o que garante que a mesma
 * comunidade não entre e saia do teste a cada carregamento de página.
 * @param {string} texto
 */
export function hashEstavel(texto) {
  let hash = 0x811c9dc5;
  const valor = String(texto ?? "");
  for (let indice = 0; indice < valor.length; indice += 1) {
    hash ^= valor.charCodeAt(indice);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Balde de 0 a 99 de uma comunidade dentro de uma liberação gradual.
 * A semente (normalmente a chave da flag) evita que as mesmas comunidades
 * sejam sempre as cobaias de todo teste novo.
 * @param {unknown} comunidadeId
 * @param {unknown} semente
 */
export function baldeLiberacao(comunidadeId, semente = "") {
  const id = Number(comunidadeId);
  const chave = `${String(semente ?? "")}:${Number.isFinite(id) ? id : String(comunidadeId ?? "")}`;
  return hashEstavel(chave) % 100;
}

function instante(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const normalizado = texto.includes("T") ? texto : `${texto.replace(" ", "T")}Z`;
  const tempo = Date.parse(normalizado);
  return Number.isNaN(tempo) ? null : tempo;
}

function agoraEm(agora) {
  const tempo = instante(agora);
  if (tempo !== null) return tempo;
  if (agora instanceof Date && !Number.isNaN(agora.getTime()))
    return agora.getTime();
  if (typeof agora === "number" && Number.isFinite(agora)) return agora;
  return Date.now();
}

/**
 * Decide se uma feature flag está ativa para uma comunidade, considerando a
 * janela de tempo, a lista explícita de comunidades e o percentual de
 * liberação gradual.
 *
 * Precedência, nesta ordem:
 * 1. flag desligada  -> inativa;
 * 2. fora da janela inicia_em/termina_em -> inativa;
 * 3. comunidade na lista explícita -> ativa (a lista é liberação nominal e
 *    ignora o percentual);
 * 4. percentual definido -> ativa se o balde determinístico da comunidade for
 *    menor que o percentual (0 não libera ninguém, 100 libera todos);
 * 5. sem lista e sem percentual -> ativa, porque a flag vale para todos.
 *
 * @param {{ enabled?: unknown, config?: Record<string, unknown> | string | null,
 *           comunidadeId?: unknown, agora?: unknown,
 *           iniciaEm?: unknown, terminaEm?: unknown }} entrada
 * @returns {{ ativa: boolean, motivo: string, decisao: string,
 *             percentual: number | null, balde: number | null }}
 */
export function avaliarLiberacaoGradual(entrada) {
  const dados = entrada || {};
  let config = dados.config;
  if (typeof config === "string") {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }
  const configuracao = /** @type {Record<string, unknown>} */ (
    config && typeof config === "object" ? config : {}
  );

  if (!(dados.enabled === true || dados.enabled === 1 || dados.enabled === "1"))
    return {
      ativa: false,
      motivo: "Recurso desligado neste escopo.",
      decisao: "DESLIGADA",
      percentual: null,
      balde: null,
    };

  const referencia = agoraEm(dados.agora);
  const inicia = instante(dados.iniciaEm ?? configuracao.inicia_em ?? configuracao.iniciaEm);
  const termina = instante(dados.terminaEm ?? configuracao.termina_em ?? configuracao.terminaEm);
  if (inicia !== null && referencia < inicia)
    return {
      ativa: false,
      motivo: "A liberação ainda não começou.",
      decisao: "ANTES_DA_JANELA",
      percentual: null,
      balde: null,
    };
  if (termina !== null && referencia >= termina)
    return {
      ativa: false,
      motivo: "A janela de liberação já terminou.",
      decisao: "DEPOIS_DA_JANELA",
      percentual: null,
      balde: null,
    };

  const comunidadeId = Number(dados.comunidadeId);
  const listaBruta = Array.isArray(configuracao.comunidades)
    ? configuracao.comunidades
    : [];
  const lista = listaBruta
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
  if (lista.length && Number.isInteger(comunidadeId) && lista.includes(comunidadeId))
    return {
      ativa: true,
      motivo: "Comunidade liberada nominalmente.",
      decisao: "LISTA",
      percentual: null,
      balde: null,
    };

  const percentualBruto = configuracao.percentual;
  const temPercentual =
    percentualBruto !== undefined &&
    percentualBruto !== null &&
    percentualBruto !== "" &&
    Number.isFinite(Number(percentualBruto));
  if (temPercentual) {
    const percentual = Math.min(100, Math.max(0, Math.round(Number(percentualBruto))));
    if (!Number.isInteger(comunidadeId) || comunidadeId <= 0)
      return {
        ativa: percentual >= 100,
        motivo:
          percentual >= 100
            ? "Liberação total."
            : "Sem comunidade para sortear na liberação gradual.",
        decisao: "SEM_COMUNIDADE",
        percentual,
        balde: null,
      };
    const balde = baldeLiberacao(comunidadeId, configuracao.semente ?? configuracao.flag_key ?? "");
    return {
      ativa: balde < percentual,
      motivo:
        balde < percentual
          ? `Comunidade dentro dos ${percentual}% liberados.`
          : `Comunidade fora dos ${percentual}% liberados.`,
      decisao: "PERCENTUAL",
      percentual,
      balde,
    };
  }

  if (lista.length)
    return {
      ativa: false,
      motivo: "A liberação está restrita às comunidades selecionadas.",
      decisao: "FORA_DA_LISTA",
      percentual: null,
      balde: null,
    };

  return {
    ativa: true,
    motivo: "Recurso liberado para todos neste escopo.",
    decisao: "TOTAL",
    percentual: null,
    balde: null,
  };
}

function manutencaoAtiva(entrada, referencia) {
  if (!entrada) return null;
  const ativo =
    entrada.ativa === true ||
    entrada.ativo === true ||
    entrada.ativa === 1 ||
    entrada.ativo === 1 ||
    entrada.emManutencao === true;
  if (!ativo) return null;
  const ate = instante(entrada.ate ?? entrada.manutencao_ate ?? entrada.ateEm);
  // Prazo vencido encerra a manutenção sozinho: o proprietário não fica preso
  // a lembrar de desligar manualmente.
  if (ate !== null && referencia >= ate) return null;
  return {
    motivo: String(entrada.motivo ?? "").trim(),
    ate: ate === null ? null : new Date(ate).toISOString(),
  };
}

/**
 * Precedência do modo de manutenção: GLOBAL vence COMUNIDADE, que vence
 * MODULO. O escopo mais amplo ganha porque uma manutenção global já derruba
 * tudo que está abaixo dela — mostrar o aviso do módulo nesse momento seria
 * informação errada.
 *
 * Manutenção com prazo (`ate`) já vencido não vale mais, em nenhum escopo.
 *
 * @param {{ global?: unknown, comunidade?: unknown, modulo?: unknown,
 *           agora?: unknown }} entrada
 * @returns {{ emManutencao: boolean, escopo: string | null,
 *             motivo: string, ate: string | null }}
 */
export function resolverManutencao(entrada) {
  const dados = entrada || {};
  const referencia = agoraEm(dados.agora);
  const ordem = [
    ["GLOBAL", dados.global],
    ["COMUNIDADE", dados.comunidade],
    ["MODULO", dados.modulo],
  ];
  for (const [escopo, valor] of ordem) {
    const ativa = manutencaoAtiva(valor, referencia);
    if (ativa)
      return {
        emManutencao: true,
        escopo,
        motivo: ativa.motivo,
        ate: ativa.ate,
      };
  }
  return { emManutencao: false, escopo: null, motivo: "", ate: null };
}

/**
 * Limites administrativos de uma comunidade: só números inteiros não
 * negativos entram, e zero significa "sem limite definido".
 * @param {unknown} valor
 * @returns {{ valido: boolean, erro: string, limites: Record<string, number> }}
 */
export function validarLimites(valor) {
  let bruto = valor;
  if (typeof bruto === "string") {
    try {
      bruto = JSON.parse(bruto);
    } catch {
      return {
        valido: false,
        erro: "Limites em formato inválido.",
        limites: {},
      };
    }
  }
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto))
    return { valido: false, erro: "Informe os limites.", limites: {} };
  /** @type {Record<string, number>} */
  const limites = {};
  for (const [chave, entrada] of Object.entries(bruto)) {
    const nome = String(chave).trim().slice(0, 60);
    if (!nome) continue;
    if (entrada === "" || entrada === null || entrada === undefined) continue;
    const numero = Number(entrada);
    if (!Number.isFinite(numero) || numero < 0)
      return {
        valido: false,
        erro: `O limite "${nome}" precisa ser um número igual ou maior que zero.`,
        limites: {},
      };
    limites[nome] = Math.round(numero);
  }
  return { valido: true, erro: "", limites };
}

export const LIMITES_COMUNIDADE = Object.freeze([
  { chave: "membros", rotulo: "Membros ativos" },
  { chave: "publicacoes", rotulo: "Publicações" },
  { chave: "eventos", rotulo: "Eventos" },
  { chave: "armazenamento_mb", rotulo: "Armazenamento (MB)" },
]);

export const STATUS_COMUNIDADE = Object.freeze([
  "ATIVA",
  "MANUTENCAO",
  "SUSPENSA",
  "ARQUIVADA",
]);

export const ROTULOS_STATUS_COMUNIDADE = Object.freeze({
  ATIVA: "Ativa",
  MANUTENCAO: "Em manutenção",
  SUSPENSA: "Bloqueada",
  ARQUIVADA: "Arquivada",
});

/**
 * Consumo em relação ao limite, para a tabela administrativa.
 * Limite zero (ou ausente) significa sem limite: devolve percentual nulo em
 * vez de uma divisão por zero maquiada de 100%.
 * @param {unknown} consumo
 * @param {unknown} limite
 */
export function situacaoLimite(consumo, limite) {
  const usado = Math.max(0, Number(consumo) || 0);
  const teto = Math.max(0, Number(limite) || 0);
  if (!teto) return { usado, teto: 0, percentual: null, nivel: "SEM_LIMITE" };
  const percentual = Math.round((usado / teto) * 100);
  const nivel =
    percentual >= 100 ? "ESTOURADO" : percentual >= 80 ? "ATENCAO" : "NORMAL";
  return { usado, teto, percentual, nivel };
}
