// Indicadores de pessoas da plataforma.
//
// Tudo aqui é agregado: contagens, coortes e distribuição. Nenhuma consulta
// devolve conteúdo produzido dentro de uma comunidade — o isolamento não é
// afetado por este painel.
//
// "Último acesso" e as coortes de retenção saem de `sessoes.criado_em`, que é
// o registro real de entrada. Não há evento de logout, então "tempo de uso"
// não é derivável e não é exibido.
import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { compararPeriodos } from "../../../lib/owner-insights.mjs";

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

/** Consulta que depende de tabela criada em migração recente. */
async function opcional<T>(promise: Promise<T>, padrao: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return padrao;
  }
}

const PERFIS = ["ACOMPANHANTE", "MEMBRO", "LIDER", "PASTOR", "ADMIN_COMUNIDADE"];

export async function GET(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;

  const url = new URL(request.url);
  const dias = Math.min(365, Math.max(7, Number(url.searchParams.get("dias")) || 30));
  const comunidadeId = Math.max(0, Number(url.searchParams.get("comunidade")) || 0);
  const perfil = String(url.searchParams.get("perfil") || "").trim().toUpperCase();
  const planoId = Math.max(0, Number(url.searchParams.get("plano")) || 0);
  const db = getD1();

  // Recorte opcional: quando há filtro de comunidade, plano ou perfil, as
  // contagens passam a considerar só as contas que caem nesse recorte.
  const filtros: string[] = [];
  const valores: unknown[] = [];
  if (comunidadeId) {
    filtros.push(
      `u.id IN (SELECT usuario_id FROM usuario_comunidades WHERE comunidade_id = ?)`,
    );
    valores.push(comunidadeId);
  }
  if (planoId) {
    filtros.push(
      `u.id IN (SELECT uc.usuario_id FROM usuario_comunidades uc
         JOIN assinaturas_comunidade a ON a.comunidade_id = uc.comunidade_id
         WHERE a.plano_id = ? AND a.status <> 'CANCELADA')`,
    );
    valores.push(planoId);
  }
  if (PERFIS.includes(perfil)) {
    filtros.push(`u.perfil = ?`);
    valores.push(perfil);
  }
  const onde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

  const [totais, novos, porComunidade, evolucao, coortes, excluidas] = await Promise.all([
    db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN u.ativo = 1 THEN 1 ELSE 0 END), 0) AS ativos,
          COALESCE(SUM(CASE WHEN u.ativo = 0 THEN 1 ELSE 0 END), 0) AS inativos,
          COALESCE(SUM(CASE WHEN u.bloqueado_ate IS NOT NULL
            AND datetime(u.bloqueado_ate) > datetime('now') THEN 1 ELSE 0 END), 0) AS bloqueados,
          COALESCE(SUM(u.tentativas_login), 0) AS tentativas_login,
          COALESCE(SUM(CASE WHEN EXISTS (
            SELECT 1 FROM sessoes s WHERE s.usuario_id = u.id
              AND datetime(s.expira_em) > datetime('now')) THEN 1 ELSE 0 END), 0) AS online_agora,
          COALESCE(SUM(CASE WHEN EXISTS (
            SELECT 1 FROM sessoes s WHERE s.usuario_id = u.id
              AND date(s.criado_em) >= date('now', '-30 days')) THEN 1 ELSE 0 END), 0) AS acessaram_30d,
          COALESCE(SUM(CASE WHEN u.ativo = 1 AND NOT EXISTS (
            SELECT 1 FROM sessoes s WHERE s.usuario_id = u.id
              AND date(s.criado_em) >= date('now', '-60 days')) THEN 1 ELSE 0 END), 0) AS sem_acesso_60d
         FROM usuarios u ${onde}`,
      )
      .bind(...valores)
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN date(u.criado_em) >= date('now', ?) THEN 1 ELSE 0 END), 0) AS atual,
          COALESCE(SUM(CASE WHEN date(u.criado_em) >= date('now', ?)
            AND date(u.criado_em) < date('now', ?) THEN 1 ELSE 0 END), 0) AS anterior
         FROM usuarios u ${onde}`,
      )
      .bind(`-${dias} days`, `-${dias * 2} days`, `-${dias} days`, ...valores)
      .first<{ atual: number; anterior: number }>(),
    db
      .prepare(
        `SELECT c.id, c.nome, c.status,
                COUNT(uc.usuario_id) AS membros,
                COALESCE(SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM sessoes s WHERE s.usuario_id = uc.usuario_id
                    AND date(s.criado_em) >= date('now', '-30 days')) THEN 1 ELSE 0 END), 0) AS ativos_30d
         FROM comunidades c
         LEFT JOIN usuario_comunidades uc ON uc.comunidade_id = c.id AND uc.status = 'ATIVO'
         GROUP BY c.id, c.nome, c.status
         ORDER BY membros DESC LIMIT 50`,
      )
      .all<{ id: number; nome: string; status: string; membros: number; ativos_30d: number }>(),
    db
      .prepare(
        `SELECT strftime('%Y-%m', u.criado_em) AS chave, COUNT(*) AS total
         FROM usuarios u ${onde ? `${onde} AND` : "WHERE"}
           date(u.criado_em) >= date('now', '-12 months')
         GROUP BY chave ORDER BY chave`,
      )
      .bind(...valores)
      .all<{ chave: string; total: number }>(),
    // Retenção por coorte: de quem se cadastrou em cada mês, quantos voltaram
    // a acessar nos últimos 30 dias. É retenção atual da coorte, não retenção
    // em D+30 — o registro de sessões não guarda histórico suficiente para a
    // segunda leitura, e inventar a diferença seria mentir sobre o método.
    db
      .prepare(
        `SELECT strftime('%Y-%m', u.criado_em) AS chave,
                COUNT(*) AS cadastrados,
                COALESCE(SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM sessoes s WHERE s.usuario_id = u.id
                    AND date(s.criado_em) >= date('now', '-30 days')) THEN 1 ELSE 0 END), 0) AS retornaram
         FROM usuarios u ${onde ? `${onde} AND` : "WHERE"}
           date(u.criado_em) >= date('now', '-6 months')
         GROUP BY chave ORDER BY chave`,
      )
      .bind(...valores)
      .all<{ chave: string; cadastrados: number; retornaram: number }>(),
    opcional(
      db
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN restaurado_em IS NULL AND purgado_em IS NULL
                    AND restauravel_ate IS NOT NULL
                    AND datetime(restauravel_ate) > datetime('now') THEN 1 ELSE 0 END), 0) AS restauraveis
           FROM contas_excluidas`,
        )
        .first<{ total: number; restauraveis: number }>(),
      { total: 0, restauraveis: 0 },
    ),
  ]);

  const ativos = Number(totais?.ativos || 0);
  const acessaram = Number(totais?.acessaram_30d || 0);

  return Response.json(
    {
      janelaDias: dias,
      filtros: { comunidadeId, planoId, perfil: PERFIS.includes(perfil) ? perfil : "" },
      totais: totais || {},
      novos: compararPeriodos(Number(novos?.atual || 0), Number(novos?.anterior || 0)),
      // Proporção das contas ativas que efetivamente acessaram nos últimos 30
      // dias, e o inverso (abandono aparente).
      engajamento: {
        acessaram30d: acessaram,
        taxaAtividade: ativos ? Number(((acessaram / ativos) * 100).toFixed(1)) : 0,
        semAcesso60d: Number(totais?.sem_acesso_60d || 0),
        taxaAbandono: ativos
          ? Number(((Number(totais?.sem_acesso_60d || 0) / ativos) * 100).toFixed(1))
          : 0,
      },
      porComunidade: porComunidade.results || [],
      evolucao: evolucao.results || [],
      coortes: (coortes.results || []).map((linha) => ({
        ...linha,
        taxa: linha.cadastrados
          ? Number(((linha.retornaram / linha.cadastrados) * 100).toFixed(1))
          : 0,
      })),
      contasExcluidas: excluidas || { total: 0, restauraveis: 0 },
      perfis: PERFIS,
      geradoEm: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
