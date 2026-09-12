// Desempenho e saúde do sistema.
//
// Este endpoint só devolve o que a plataforma efetivamente registra hoje:
// falhas e negações da trilha de auditoria, bloqueios e tentativas de login
// dos usuários, e incidentes da central. Métricas de infraestrutura (CPU,
// memória, filas, consultas lentas, disponibilidade) dependem do provedor de
// hospedagem/observabilidade, que não está conectado neste ambiente — em vez
// de forjar números, elas voltam na lista `indisponiveis`, com o motivo, para
// a interface declarar a lacuna.
import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  compararPeriodos,
  completarSerieDiaria,
  detectarAnomalias,
} from "../../../lib/owner-insights.mjs";

type SeriePonto = { chave: string; total: number };

async function owner() {
  const user = await getSessionUser();
  if (!user) {
    return { error: Response.json({ error: "Faça login para continuar." }, { status: 401 }) } as const;
  }
  if (!user.ativo || !user.system_owner) {
    return {
      error: Response.json(
        { error: "Esta área é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}

const INDISPONIVEIS = [
  { indicador: "Tempo de carregamento e latência (p50/p95)", origem: "instrumentação de requisições no runtime de hospedagem" },
  { indicador: "Disponibilidade (uptime)", origem: "monitor externo de disponibilidade" },
  { indicador: "Erros 4xx e 5xx por rota", origem: "logs de acesso do provedor" },
  { indicador: "Consultas lentas e falhas de banco", origem: "métricas do D1" },
  { indicador: "Uso de CPU, memória e filas", origem: "métricas de runtime do provedor" },
  { indicador: "Comparação de desempenho entre versões", origem: "latência por versão, que depende dos itens acima" },
];

export async function GET(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;

  const url = new URL(request.url);
  const dias = Math.min(90, Math.max(7, Number(url.searchParams.get("dias")) || 14));
  const db = getD1();

  const [falhasSerie, falhasPeriodo, porEvento, autenticacao, incidentes, incidentesPorArea] =
    await Promise.all([
      db
        .prepare(
          `SELECT date(criado_em) AS chave, COUNT(*) AS total
           FROM auditoria_piloto
           WHERE resultado IN ('ERRO', 'NEGADO')
             AND date(criado_em) >= date('now', ?)
           GROUP BY date(criado_em) ORDER BY chave`,
        )
        .bind(`-${dias - 1} days`)
        .all<SeriePonto>(),
      db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM auditoria_piloto
              WHERE resultado IN ('ERRO', 'NEGADO')
                AND date(criado_em) >= date('now', ?)) AS atual,
            (SELECT COUNT(*) FROM auditoria_piloto
              WHERE resultado IN ('ERRO', 'NEGADO')
                AND date(criado_em) >= date('now', ?)
                AND date(criado_em) < date('now', ?)) AS anterior,
            (SELECT COUNT(*) FROM auditoria_piloto
              WHERE date(criado_em) >= date('now', ?)) AS total_acoes`,
        )
        .bind(`-${dias - 1} days`, `-${dias * 2 - 1} days`, `-${dias - 1} days`, `-${dias - 1} days`)
        .first<{ atual: number; anterior: number; total_acoes: number }>(),
      db
        .prepare(
          `SELECT evento, resultado, COUNT(*) AS total,
                  MAX(criado_em) AS ultima
           FROM auditoria_piloto
           WHERE resultado IN ('ERRO', 'NEGADO')
             AND date(criado_em) >= date('now', ?)
           GROUP BY evento, resultado
           ORDER BY total DESC LIMIT 15`,
        )
        .bind(`-${dias - 1} days`)
        .all<{ evento: string; resultado: string; total: number; ultima: string }>(),
      db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM usuarios
              WHERE bloqueado_ate IS NOT NULL
                AND datetime(bloqueado_ate) > datetime('now')) AS bloqueados_agora,
            (SELECT COUNT(*) FROM usuarios WHERE tentativas_login > 0) AS contas_com_falha,
            (SELECT COALESCE(SUM(tentativas_login), 0) FROM usuarios) AS tentativas_acumuladas`,
        )
        .first<{ bloqueados_agora: number; contas_com_falha: number; tentativas_acumuladas: number }>(),
      db
        .prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN status NOT IN ('RESOLVIDO', 'IGNORADO') THEN 1 ELSE 0 END), 0) AS abertos,
            COALESCE(SUM(CASE WHEN gravidade = 'CRITICA' AND status NOT IN ('RESOLVIDO', 'IGNORADO') THEN 1 ELSE 0 END), 0) AS criticos,
            COALESCE(SUM(ocorrencias), 0) AS ocorrencias
           FROM incidentes_plataforma`,
        )
        .first<{ abertos: number; criticos: number; ocorrencias: number }>()
        .catch(() => ({ abertos: 0, criticos: 0, ocorrencias: 0 })),
      db
        .prepare(
          `SELECT area, gravidade, COUNT(*) AS total, SUM(ocorrencias) AS ocorrencias
           FROM incidentes_plataforma
           WHERE status NOT IN ('RESOLVIDO', 'IGNORADO')
           GROUP BY area, gravidade ORDER BY ocorrencias DESC LIMIT 20`,
        )
        .all<{ area: string; gravidade: string; total: number; ocorrencias: number }>()
        .catch(() => ({ results: [] as { area: string; gravidade: string; total: number; ocorrencias: number }[] })),
    ]);

  const serie = completarSerieDiaria(falhasSerie.results || [], dias);
  const tendencia = compararPeriodos(
    Number(falhasPeriodo?.atual || 0),
    Number(falhasPeriodo?.anterior || 0),
  );
  const totalAcoes = Number(falhasPeriodo?.total_acoes || 0);

  return Response.json(
    {
      janelaDias: dias,
      falhas: {
        serie,
        tendencia,
        anomalias: detectarAnomalias(serie),
        totalAcoes,
        // Proporção de falhas sobre o total de ações auditadas no período.
        taxa: totalAcoes ? Number(((tendencia.atual / totalAcoes) * 100).toFixed(2)) : 0,
        porEvento: porEvento.results || [],
      },
      autenticacao: autenticacao || {
        bloqueados_agora: 0,
        contas_com_falha: 0,
        tentativas_acumuladas: 0,
      },
      incidentes: incidentes || { abertos: 0, criticos: 0, ocorrencias: 0 },
      incidentesPorArea: incidentesPorArea.results || [],
      indisponiveis: INDISPONIVEIS,
      geradoEm: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
