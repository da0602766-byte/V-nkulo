import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";

type NumericRow = Record<string, number | string | null>;

export async function GET() {
  const access = await requireTenantPermission("pastoral.panel.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const communityId = access.context.comunidadeId;
  const community = await db
    .prepare("SELECT proprietario_usuario_id FROM comunidades WHERE id = ? AND status = 'ATIVA'")
    .bind(communityId)
    .first<{ proprietario_usuario_id: number | null }>();
  const isCreator = Number(community?.proprietario_usuario_id) === Number(access.user.id);
  const grant = isCreator
    ? { ativo: 1 }
    : await db
        .prepare("SELECT ativo FROM acessos_painel_pastoral WHERE comunidade_id = ? AND usuario_id = ? LIMIT 1")
        .bind(communityId, access.user.id)
        .first<{ ativo: number }>();
  const canViewCharts = isCreator || Boolean(grant?.ativo);
  const pastors = await db
    .prepare(
      `SELECT u.id AS usuario_id, u.nome, u.email,
        CASE WHEN a.ativo = 1 THEN 1 ELSE 0 END AS acesso_concedido
       FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id AND u.ativo = 1
       LEFT JOIN acessos_painel_pastoral a
         ON a.comunidade_id = uc.comunidade_id AND a.usuario_id = u.id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND uc.papel = 'PASTOR'
       ORDER BY u.nome`,
    )
    .bind(communityId)
    .all<Record<string, unknown>>();

  if (!canViewCharts) {
    return Response.json({ canViewCharts: false, canManageAccess: false, pastors: [] }, noStore());
  }

  const [metrics, members, visitors, posts, events, cellReports] = await Promise.all([
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM usuario_comunidades WHERE comunidade_id = ? AND status = 'ATIVO') AS membros,
          (SELECT COUNT(*) FROM visitantes WHERE comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1) AS visitantes,
          (SELECT COUNT(*) FROM publicacoes_piloto WHERE comunidade_id = ? AND status = 'PUBLICADA' AND datetime(criado_em) >= datetime('now', '-30 days')) AS publicacoes_30d,
          (SELECT COUNT(*) FROM eventos_comunidade WHERE comunidade_id = ? AND status = 'PUBLICADO' AND datetime(inicia_em) >= datetime('now')) AS proximos_eventos,
          (SELECT COUNT(*) FROM ministerios_comunidade WHERE comunidade_id = ? AND status = 'ATIVO') AS ministerios,
          (SELECT COUNT(*) FROM celulas WHERE comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1) AS celulas`,
      )
      .bind(communityId, communityId, communityId, communityId, communityId, communityId)
      .first<NumericRow>(),
    monthly(db, "usuario_comunidades", "criado_em", communityId, "status = 'ATIVO'"),
    monthly(db, "visitantes", "criado_em", communityId, "ativo = 1 AND escopo_confirmado = 1"),
    monthly(db, "publicacoes_piloto", "criado_em", communityId, "status = 'PUBLICADA'"),
    monthly(db, "eventos_comunidade", "criado_em", communityId, "status = 'PUBLICADO'"),
    db.prepare(
      `SELECT r.id, r.data_reuniao, r.aconteceu, r.presentes, r.visitantes,
        r.observacoes, r.criado_em, c.nome AS celula_nome,
        COALESCE(u.nome, 'Liderança da célula') AS enviado_por_nome
       FROM celula_relatorios r JOIN celulas c ON c.id = r.celula_id
       LEFT JOIN usuarios u ON u.id = r.enviado_por_usuario_id
       WHERE r.comunidade_id = ? ORDER BY r.data_reuniao DESC, r.id DESC LIMIT 30`,
    ).bind(communityId).all(),
  ]);

  return Response.json(
    {
      canViewCharts: true,
      canManageAccess: isCreator,
      metrics: normalizeMetrics(metrics),
      series: mergeSeries(members, visitors, posts, events),
      pastors: isCreator ? pastors.results : [],
      cellReports: cellReports.results,
    },
    noStore(),
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("pastoral.panel.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const communityId = access.context.comunidadeId;
  const community = await db
    .prepare("SELECT proprietario_usuario_id FROM comunidades WHERE id = ? AND status = 'ATIVA'")
    .bind(communityId)
    .first<{ proprietario_usuario_id: number | null }>();
  if (Number(community?.proprietario_usuario_id) !== Number(access.user.id)) {
    return Response.json({ error: "Somente quem criou a comunidade pode liberar estes gráficos." }, { status: 403 });
  }
  const payload = await request.json().catch(() => null) as { userId?: unknown; enabled?: unknown } | null;
  const userId = Number(payload?.userId);
  const enabled = payload?.enabled === true;
  if (!Number.isInteger(userId) || userId <= 0) {
    return Response.json({ error: "Pastor inválido." }, { status: 400 });
  }
  const pastor = await db
    .prepare("SELECT 1 FROM usuario_comunidades WHERE comunidade_id = ? AND usuario_id = ? AND papel = 'PASTOR' AND status = 'ATIVO' LIMIT 1")
    .bind(communityId, userId)
    .first();
  if (!pastor) return Response.json({ error: "A pessoa precisa ser pastor ativo desta comunidade." }, { status: 400 });
  await db
    .prepare(
      `INSERT INTO acessos_painel_pastoral
        (comunidade_id, usuario_id, concedido_por, ativo, atualizado_em)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(comunidade_id, usuario_id) DO UPDATE SET
         concedido_por = excluded.concedido_por,
         ativo = excluded.ativo,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(communityId, userId, access.user.id, enabled ? 1 : 0)
    .run();
  await db
    .prepare("INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados) VALUES (?, ?, 'ACESSO_PAINEL_PASTORAL_ATUALIZADO', 'SUCESSO', ?)")
    .bind(communityId, access.user.id, JSON.stringify({ pastorUsuarioId: userId, enabled }))
    .run();
  return Response.json({ ok: true, enabled });
}

function noStore() {
  return { headers: { "Cache-Control": "no-store" } };
}

async function monthly(db: ReturnType<typeof getD1>, table: string, dateColumn: string, communityId: number, predicate: string) {
  const result = await db
    .prepare(
      `SELECT substr(${dateColumn}, 1, 7) AS mes, COUNT(*) AS total
       FROM ${table}
       WHERE comunidade_id = ? AND ${predicate}
         AND datetime(${dateColumn}) >= datetime('now', 'start of month', '-5 months')
       GROUP BY substr(${dateColumn}, 1, 7)`,
    )
    .bind(communityId)
    .all<{ mes: string; total: number }>();
  return result.results;
}

function normalizeMetrics(row: NumericRow | null) {
  return {
    members: Number(row?.membros || 0),
    visitors: Number(row?.visitantes || 0),
    posts30d: Number(row?.publicacoes_30d || 0),
    upcomingEvents: Number(row?.proximos_eventos || 0),
    ministries: Number(row?.ministerios || 0),
    cells: Number(row?.celulas || 0),
  };
}

function mergeSeries(
  members: { mes: string; total: number }[],
  visitors: { mes: string; total: number }[],
  posts: { mes: string; total: number }[],
  events: { mes: string; total: number }[],
) {
  const sources = { members, visitors, posts, events };
  return Array.from({ length: 6 }, (_, offset) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - offset));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      month,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
      members: Number(sources.members.find((item) => item.mes === month)?.total || 0),
      visitors: Number(sources.visitors.find((item) => item.mes === month)?.total || 0),
      posts: Number(sources.posts.find((item) => item.mes === month)?.total || 0),
      events: Number(sources.events.find((item) => item.mes === month)?.total || 0),
    };
  });
}
