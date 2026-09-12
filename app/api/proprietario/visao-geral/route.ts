// Visão Geral: ponto de decisão e navegação, não um relatório.
//
// Responde às perguntas que o proprietário faz ao abrir o painel (quantas
// comunidades, quantas ativas, quantos usuários, quantos on-line, o sistema
// está saudável, houve aumento de erros, há incidente crítico, há comunidade
// suspensa, há pagamento pendente, qual módulo é mais usado) e devolve os
// destaques já ordenados por urgência. O detalhe fica nas áreas específicas.
//
// Cada destaque vem de um número real; quando não há dado, não há destaque.
import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { compararPeriodos, montarDestaques } from "../../../lib/owner-insights.mjs";
import { COMMUNITY_MODULES, normalizeCommunityModules } from "../../../lib/community-modules";

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

/** Consulta que pode falhar se a tabela ainda não existir no banco local. */
async function opcional<T>(promise: Promise<T>, padrao: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return padrao;
  }
}

export async function GET() {
  const access = await owner();
  if ("error" in access) return access.error;
  const db = getD1();

  const [plataforma, sessoes, erros, incidentes, cobrancas, modulos] = await Promise.all([
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM comunidades) AS comunidades,
          (SELECT COUNT(*) FROM comunidades WHERE status = 'ATIVA') AS comunidades_ativas,
          (SELECT COUNT(*) FROM comunidades WHERE status = 'SUSPENSA') AS comunidades_suspensas,
          (SELECT COUNT(*) FROM usuarios) AS usuarios,
          (SELECT COUNT(*) FROM usuarios WHERE ativo = 1) AS usuarios_ativos,
          (SELECT COUNT(*) FROM usuarios
            WHERE date(criado_em) >= date('now', '-30 days')) AS novos_30d,
          (SELECT COUNT(*) FROM usuarios
            WHERE date(criado_em) >= date('now', '-60 days')
              AND date(criado_em) < date('now', '-30 days')) AS novos_30d_anterior,
          (SELECT COUNT(*) FROM solicitacoes_criacao_comunidade
            WHERE status IN ('PENDENTE', 'EM_ANALISE')) AS solicitacoes_pendentes`,
      )
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(DISTINCT usuario_id) FROM sessoes
            WHERE datetime(expira_em) > datetime('now')) AS online_agora,
          (SELECT COUNT(*) FROM sessoes
            WHERE datetime(expira_em) > datetime('now')) AS sessoes_ativas,
          (SELECT COUNT(DISTINCT usuario_id) FROM sessoes
            WHERE date(criado_em) >= date('now', '-7 days')) AS ativos_7d,
          (SELECT COUNT(DISTINCT usuario_id) FROM sessoes
            WHERE date(criado_em) >= date('now', '-14 days')
              AND date(criado_em) < date('now', '-7 days')) AS ativos_7d_anterior`,
      )
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM auditoria_piloto
            WHERE resultado IN ('ERRO', 'NEGADO')
              AND date(criado_em) >= date('now', '-7 days')) AS erros_7d,
          (SELECT COUNT(*) FROM auditoria_piloto
            WHERE resultado IN ('ERRO', 'NEGADO')
              AND date(criado_em) >= date('now', '-14 days')
              AND date(criado_em) < date('now', '-7 days')) AS erros_7d_anterior`,
      )
      .first<Record<string, number>>(),
    opcional(
      db
        .prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN status NOT IN ('RESOLVIDO','IGNORADO') THEN 1 ELSE 0 END), 0) AS abertos,
            COALESCE(SUM(CASE WHEN gravidade = 'CRITICA' AND status NOT IN ('RESOLVIDO','IGNORADO') THEN 1 ELSE 0 END), 0) AS criticos
           FROM incidentes_plataforma`,
        )
        .first<Record<string, number>>(),
      { abertos: 0, criticos: 0 },
    ),
    opcional(
      db
        .prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN status = 'VENCIDA'
              OR (status = 'PENDENTE' AND date(vence_em) < date('now')) THEN 1 ELSE 0 END), 0) AS vencidas,
            COALESCE(SUM(CASE WHEN status = 'PENDENTE'
              AND date(vence_em) >= date('now') THEN 1 ELSE 0 END), 0) AS pendentes
           FROM cobrancas_assinatura`,
        )
        .first<Record<string, number>>(),
      { vencidas: 0, pendentes: 0 },
    ),
    db
      .prepare(`SELECT ficha_criacao FROM comunidades WHERE status = 'ATIVA'`)
      .all<{ ficha_criacao: string }>()
      .catch(() => ({ results: [] as { ficha_criacao: string }[] })),
  ]);

  // Módulo mais utilizado = módulo habilitado no maior número de comunidades
  // ativas. É adoção, não frequência de uso: sem telemetria de navegação, essa
  // é a leitura honesta disponível.
  const contagemModulos = new Map<string, number>();
  for (const linha of modulos.results || []) {
    let ficha: Record<string, unknown> = {};
    try {
      ficha = JSON.parse(linha.ficha_criacao || "{}") as Record<string, unknown>;
    } catch {
      ficha = {};
    }
    for (const modulo of normalizeCommunityModules(ficha.modules, [])) {
      contagemModulos.set(modulo, (contagemModulos.get(modulo) || 0) + 1);
    }
  }
  const [moduloTopo] = [...contagemModulos.entries()].sort((a, b) => b[1] - a[1]);
  const moduloMaisUsado = moduloTopo
    ? {
        nome:
          COMMUNITY_MODULES.find((item) => item.key === moduloTopo[0])?.label ||
          moduloTopo[0],
        total: moduloTopo[1],
      }
    : null;

  const usuariosAtivos = compararPeriodos(
    Number(sessoes?.ativos_7d || 0),
    Number(sessoes?.ativos_7d_anterior || 0),
  );
  const erroTendencia = compararPeriodos(
    Number(erros?.erros_7d || 0),
    Number(erros?.erros_7d_anterior || 0),
  );
  const crescimento = compararPeriodos(
    Number(plataforma?.novos_30d || 0),
    Number(plataforma?.novos_30d_anterior || 0),
  );

  const destaques = montarDestaques({
    usuariosAtivos,
    erros: erroTendencia,
    incidentesCriticos: Number(incidentes?.criticos || 0),
    comunidadesSuspensas: Number(plataforma?.comunidades_suspensas || 0),
    cobrancasVencidas: Number(cobrancas?.vencidas || 0),
    moduloMaisUsado,
  });

  // "Saudável" é uma leitura dos sinais que temos, não um status de
  // infraestrutura: sem incidente crítico e sem salto de erros.
  const saude =
    Number(incidentes?.criticos || 0) > 0
      ? "CRITICA"
      : erroTendencia.direcao === "ALTA" && erroTendencia.variacao >= 50
        ? "ATENCAO"
        : "ESTAVEL";

  return Response.json(
    {
      plataforma: plataforma || {},
      presenca: sessoes || {},
      tendencias: { usuariosAtivos, erros: erroTendencia, crescimento },
      incidentes: incidentes || { abertos: 0, criticos: 0 },
      cobrancas: cobrancas || { vencidas: 0, pendentes: 0 },
      moduloMaisUsado,
      destaques,
      saude,
      geradoEm: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
