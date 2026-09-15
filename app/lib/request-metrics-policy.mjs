// Regras puras da contagem de requisições: como nomear a janela, como
// normalizar a rota e como resumir o que foi contado.
//
// Separado de request-metrics.ts pelo mesmo motivo dos outros `-policy.mjs`:
// é aqui que mora a decisão que precisa de teste, e o teste roda sem banco.

/** Classes de status contadas, em ordem de exibição. */
export const CLASSES = ["2xx", "3xx", "4xx", "5xx"];

/**
 * Janela de agregação: a hora UTC em que a requisição caiu.
 *
 * Hora é o grão certo aqui: minuto multiplicaria as linhas por 60 para uma
 * pergunta ("a taxa de erro subiu hoje?") que não precisa dessa resolução.
 *
 * @param {number} agoraMs
 * @returns {string} "YYYY-MM-DDTHH"
 */
export function janelaDaHora(agoraMs) {
  return new Date(agoraMs).toISOString().slice(0, 13);
}

/**
 * Classe do status HTTP.
 *
 * @param {number} status
 * @returns {string}
 */
export function classeDoStatus(status) {
  const numero = Number(status) || 0;
  if (numero >= 500) return "5xx";
  if (numero >= 400) return "4xx";
  if (numero >= 300) return "3xx";
  return "2xx";
}

/**
 * Normaliza o caminho para virar chave de agregação.
 *
 * Sem isso, `/api/pilot/eventos/41` e `/api/pilot/eventos/42` seriam linhas
 * diferentes: a tabela cresceria sem limite e, pior, registraria quais
 * registros foram acessados — um rastro de navegação que este projeto não
 * guarda. Trocar o identificador por `:id` resolve as duas coisas.
 *
 * @param {string} caminho
 * @returns {string}
 */
export function normalizarRota(caminho) {
  const limpo = String(caminho || "/").split("?")[0];
  const segmentos = limpo.split("/").filter(Boolean);
  const normalizados = segmentos.map((segmento) => {
    if (/^\d+$/.test(segmento)) return ":id";
    // Token, UUID, slug com hash: qualquer coisa longa demais para ser nome de
    // rota é identificador.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segmento)) {
      return ":id";
    }
    if (segmento.length > 24) return ":id";
    if (/\d/.test(segmento) && /[a-z]/i.test(segmento) && segmento.length > 12) {
      return ":id";
    }
    return segmento;
  });
  return `/${normalizados.join("/")}`.slice(0, 120);
}

/**
 * Soma as contagens de um mesmo par rota+classe, para o Worker gravar uma
 * linha por combinação em vez de uma por requisição.
 *
 * @param {Array<{ janela: string, rota: string, classe: string }>} eventos
 * @returns {Array<{ janela: string, rota: string, classe: string, total: number }>}
 */
export function agrupar(eventos) {
  const mapa = new Map();
  for (const evento of eventos) {
    const chave = `${evento.janela}|${evento.rota}|${evento.classe}`;
    const atual = mapa.get(chave);
    if (atual) {
      atual.total += 1;
    } else {
      mapa.set(chave, { ...evento, total: 1 });
    }
  }
  return [...mapa.values()];
}

/**
 * Monta o resumo lido pelo painel: totais por classe, taxa de erro e as rotas
 * que mais falharam.
 *
 * @param {Array<{ rota: string, classe: string, total: number }>} linhas
 * @param {number} [limiteRotas]
 */
export function resumir(linhas, limiteRotas = 10) {
  const porClasse = Object.fromEntries(CLASSES.map((classe) => [classe, 0]));
  const porRota = new Map();

  for (const linha of linhas) {
    const classe = CLASSES.includes(linha.classe) ? linha.classe : "2xx";
    const total = Number(linha.total) || 0;
    porClasse[classe] += total;
    const atual = porRota.get(linha.rota) || {
      rota: linha.rota,
      total: 0,
      erros: 0,
      falhas: 0,
    };
    atual.total += total;
    if (classe === "4xx" || classe === "5xx") atual.erros += total;
    if (classe === "5xx") atual.falhas += total;
    porRota.set(linha.rota, atual);
  }

  const total = CLASSES.reduce((soma, classe) => soma + porClasse[classe], 0);
  const erros = porClasse["4xx"] + porClasse["5xx"];

  return {
    total,
    porClasse,
    // Arredondado em uma casa: o painel mostra tendência, não medição exata.
    taxaErro: total > 0 ? Math.round((erros / total) * 1000) / 10 : 0,
    taxaFalha: total > 0 ? Math.round((porClasse["5xx"] / total) * 1000) / 10 : 0,
    rotas: [...porRota.values()]
      // Falhas de servidor primeiro: são as que exigem ação de quem opera.
      .sort((a, b) => b.falhas - a.falhas || b.erros - a.erros || b.total - a.total)
      .slice(0, limiteRotas),
  };
}
