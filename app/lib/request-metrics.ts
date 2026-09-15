import {
  agrupar,
  classeDoStatus,
  janelaDaHora,
  normalizarRota,
  resumir,
} from "./request-metrics-policy.mjs";

type Evento = { janela: string; rota: string; classe: string };

/**
 * Buffer do isolate. Gravar uma linha por requisição custaria uma escrita em
 * D1 a cada acesso; acumular e descarregar em lote troca isso por uma escrita
 * a cada dezenas de requisições.
 *
 * O custo dessa escolha é perder o buffer quando o isolate morre. É aceitável:
 * isto é um indicador de tendência para quem opera, não contabilidade. A
 * auditoria, que precisa ser exata, continua sendo gravada na hora, em
 * `auditoria_piloto`.
 */
let buffer: Evento[] = [];
let proximoDescarregamentoEm = 0;

const LIMITE_BUFFER = 40;
const INTERVALO_DESCARGA_MS = 60_000;
/** Sete dias respondem "piorou esta semana?" sem virar histórico permanente. */
const RETENCAO_DIAS = 7;

/**
 * Registra uma requisição concluída. Nunca lança e nunca espera pelo banco.
 */
export function registrarRequisicao(caminho: string, status: number, agoraMs = Date.now()) {
  // Só as rotas de API entram: acesso a página e a asset não dizem nada sobre
  // saúde de backend e inundariam a tabela.
  if (!caminho.startsWith("/api/")) return;
  buffer.push({
    janela: janelaDaHora(agoraMs),
    rota: normalizarRota(caminho),
    classe: classeDoStatus(status),
  });
}

/** Há buffer suficiente (ou tempo suficiente) para valer uma escrita? */
export function precisaDescarregar(agoraMs = Date.now()) {
  if (buffer.length === 0) return false;
  if (buffer.length >= LIMITE_BUFFER) return true;
  return agoraMs >= proximoDescarregamentoEm;
}

/**
 * Grava o buffer acumulado. Chamada pelo Worker dentro de `waitUntil`, então
 * roda depois da resposta já ter saído.
 */
export async function descarregarMetricas(db: D1Database, agoraMs = Date.now()) {
  if (buffer.length === 0) return;
  const pendentes = buffer;
  buffer = [];
  proximoDescarregamentoEm = agoraMs + INTERVALO_DESCARGA_MS;

  try {
    for (const linha of agrupar(pendentes)) {
      await db
        .prepare(
          `INSERT INTO metricas_requisicao (janela, rota, classe, total, atualizado_em)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(janela, rota, classe) DO UPDATE SET
             total = metricas_requisicao.total + excluded.total,
             atualizado_em = excluded.atualizado_em`,
        )
        .bind(
          linha.janela,
          linha.rota,
          linha.classe,
          linha.total,
          new Date(agoraMs).toISOString(),
        )
        .run();
    }
    await limparAntigas(db, agoraMs);
  } catch {
    // Perder contagem não pode afetar a requisição que já foi respondida.
  }
}

export type ResumoMetricas = ReturnType<typeof resumir> & { horas: number };

/**
 * Lê o agregado das últimas `horas` para o painel do proprietário.
 */
export async function lerResumoMetricas(
  db: D1Database,
  horas = 24,
): Promise<ResumoMetricas> {
  const desde = janelaDaHora(Date.now() - horas * 3600 * 1000);
  const linhas = await db
    .prepare(
      `SELECT rota, classe, SUM(total) AS total
       FROM metricas_requisicao
       WHERE janela >= ?
       GROUP BY rota, classe`,
    )
    .bind(desde)
    .all<{ rota: string; classe: string; total: number }>();
  return { ...resumir(linhas.results || []), horas };
}

/**
 * Série por hora, para o painel mostrar quando a taxa mudou.
 */
export async function lerSerieMetricas(db: D1Database, horas = 24) {
  const desde = janelaDaHora(Date.now() - horas * 3600 * 1000);
  const linhas = await db
    .prepare(
      `SELECT janela, classe, SUM(total) AS total
       FROM metricas_requisicao
       WHERE janela >= ?
       GROUP BY janela, classe
       ORDER BY janela ASC`,
    )
    .bind(desde)
    .all<{ janela: string; classe: string; total: number }>();

  const porJanela = new Map<string, Record<string, number>>();
  for (const linha of linhas.results || []) {
    const atual = porJanela.get(linha.janela) || { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
    atual[linha.classe] = (atual[linha.classe] || 0) + Number(linha.total || 0);
    porJanela.set(linha.janela, atual);
  }
  return [...porJanela.entries()].map(([janela, classes]) => ({ janela, ...classes }));
}

async function limparAntigas(db: D1Database, agoraMs: number) {
  const corte = janelaDaHora(agoraMs - RETENCAO_DIAS * 24 * 3600 * 1000);
  await db.prepare("DELETE FROM metricas_requisicao WHERE janela < ?").bind(corte).run();
}
