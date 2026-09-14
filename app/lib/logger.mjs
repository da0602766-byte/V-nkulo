// Registro estruturado de eventos operacionais.
//
// Antes disso o sistema tinha meia dúzia de `console.log`/`console.error`
// soltos, sem formato comum: no painel de logs do ambiente hospedado cada
// linha saía de um jeito e não dava para filtrar por evento, por comunidade
// nem por severidade. Aqui toda linha é um JSON de uma linha só, com os
// mesmos campos, o que torna o log pesquisável sem depender de serviço
// externo nenhum.
//
// Regra inegociável: **log não é lugar de dado pessoal nem de segredo**. O
// projeto guarda o mínimo possível (ver ESTADO_DO_PROJETO.md) e o log não
// pode ser a porta dos fundos por onde e-mail, senha ou token vazam para o
// console. Por isso `redigirContexto` roda em tudo que passa por aqui.

/** Severidades aceitas, da menos para a mais grave. */
export const NIVEIS = ["debug", "info", "warn", "error"];

/**
 * Campos que nunca podem aparecer no log, mesmo que alguém os passe por
 * engano. A comparação é por nome normalizado (sem maiúsculas, sem acento,
 * sem separador), então `senha_hash`, `senhaHash` e `SENHA HASH` caem todos
 * na mesma regra.
 */
const CAMPOS_SENSIVEIS = new Set([
  "senha",
  "senhanova",
  "senhatemporaria",
  "senhahash",
  "senhasalt",
  "password",
  "token",
  "tokenhash",
  "refreshtoken",
  "accesstoken",
  "idtoken",
  "authorization",
  "cookie",
  "secret",
  "clientsecret",
  "authsecret",
  "apikey",
  "email",
  "telefone",
  "cpf",
  "endereco",
  "ip",
]);

const SUBSTITUTO = "[redigido]";
const PROFUNDIDADE_MAXIMA = 4;
const TEXTO_MAXIMO = 500;

/**
 * Remove de um objeto de contexto tudo que for sensível, recursivamente.
 *
 * Função pura — é ela que os testes exercitam.
 *
 * @param {unknown} valor
 * @param {number} [profundidade]
 * @returns {unknown}
 */
export function redigirContexto(valor, profundidade = 0) {
  if (valor === null || valor === undefined) return valor;
  if (profundidade >= PROFUNDIDADE_MAXIMA) return "[profundo demais]";

  if (typeof valor === "string") {
    return valor.length > TEXTO_MAXIMO
      ? `${valor.slice(0, TEXTO_MAXIMO)}…`
      : valor;
  }
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (typeof valor === "bigint") return Number(valor);
  if (valor instanceof Date) return valor.toISOString();
  if (valor instanceof Error) {
    return {
      nome: valor.name,
      mensagem: valor.message,
      // A pilha ajuda a achar o ponto da falha e não carrega dado do usuário.
      pilha: typeof valor.stack === "string" ? valor.stack.split("\n").slice(0, 5) : undefined,
    };
  }
  if (Array.isArray(valor)) {
    return valor.slice(0, 20).map((item) => redigirContexto(item, profundidade + 1));
  }
  if (typeof valor === "object") {
    const saida = {};
    for (const [chave, item] of Object.entries(valor)) {
      saida[chave] = ehCampoSensivel(chave)
        ? SUBSTITUTO
        : redigirContexto(item, profundidade + 1);
    }
    return saida;
  }
  // Funções, símbolos e afins não têm representação útil no log.
  return `[${typeof valor}]`;
}

/**
 * @param {string} nome
 * @returns {boolean}
 */
export function ehCampoSensivel(nome) {
  const normalizado = String(nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
  return CAMPOS_SENSIVEIS.has(normalizado);
}

/**
 * Monta a linha do log sem escrevê-la. Separado de `registrar` para que os
 * testes possam conferir o formato sem capturar o console.
 *
 * @param {object} entrada
 * @param {string} entrada.nivel
 * @param {string} entrada.evento
 * @param {Record<string, unknown>} [entrada.contexto]
 * @param {string} [entrada.momento]
 * @returns {Record<string, unknown>}
 */
export function montarLinha({ nivel, evento, contexto = {}, momento }) {
  const severidade = NIVEIS.includes(nivel) ? nivel : "info";
  return {
    momento: momento || new Date().toISOString(),
    nivel: severidade,
    evento: String(evento || "evento_sem_nome"),
    ...redigirContexto(contexto),
  };
}

/**
 * Escreve uma linha estruturada. `warn` e `error` vão para `console.error`
 * para que o ambiente hospedado os separe do fluxo normal.
 *
 * Nunca lança: um erro ao registrar o log não pode derrubar a requisição que
 * estava sendo registrada.
 *
 * @param {string} nivel
 * @param {string} evento
 * @param {Record<string, unknown>} [contexto]
 */
export function registrar(nivel, evento, contexto = {}) {
  try {
    const linha = montarLinha({ nivel, evento, contexto });
    const serializado = JSON.stringify(linha);
    if (linha.nivel === "error" || linha.nivel === "warn") {
      console.error(serializado);
    } else {
      console.log(serializado);
    }
  } catch {
    // Contexto impossível de serializar (referência circular, por exemplo).
    try {
      console.error(
        JSON.stringify({
          momento: new Date().toISOString(),
          nivel: "error",
          evento: "log_nao_serializavel",
          eventoOriginal: String(evento),
        }),
      );
    } catch {
      // Desistir em silêncio é melhor que estourar dentro do logger.
    }
  }
}

export const log = {
  /** @param {string} evento @param {Record<string, unknown>} [contexto] */
  debug: (evento, contexto) => registrar("debug", evento, contexto),
  /** @param {string} evento @param {Record<string, unknown>} [contexto] */
  info: (evento, contexto) => registrar("info", evento, contexto),
  /** @param {string} evento @param {Record<string, unknown>} [contexto] */
  warn: (evento, contexto) => registrar("warn", evento, contexto),
  /** @param {string} evento @param {Record<string, unknown>} [contexto] */
  error: (evento, contexto) => registrar("error", evento, contexto),
};
