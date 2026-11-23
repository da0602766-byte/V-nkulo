import type { TenantContext } from "./tenant";
import type { ReportArchiveResult, ReportArchiveRow, ReportFilters, VisitorCohort } from "./management-reports";

const pageSize = 20;
type ReportAccess = Pick<TenantContext, "comunidadeId" | "userId" | "papel" | "permissions" | "modules" | "isCommunityOwner">;

export async function readManagementReports(db: D1Database, context: ReportAccess, filters: ReportFilters, exportLimit?: number): Promise<ReportArchiveResult> {
  const { comunidadeId, userId, papel, permissions } = context;
  const cellModule = filters.area !== "parking" && permissions.includes("cells.view");
  const parkingModule = filters.area !== "cells" && context.modules.includes("parking") && permissions.some(p => p === "parking.view" || p === "parking.reserve");
  const pastoralGrant = cellModule && papel === "PASTOR" && permissions.includes("pastoral.panel.view") &&
    await db.prepare("SELECT 1 FROM acessos_painel_pastoral WHERE comunidade_id=? AND usuario_id=? AND ativo=1").bind(comunidadeId,userId).first();
  const allCells = +(context.isCommunityOwner || Boolean(pastoralGrant));
  const size = exportLimit ?? pageSize;
  const emptyMetrics = { expected: 0, received: 0, overdue: 0, reviewing: 0, correcting: 0, attendance: 0, meetings: 0 };
  const base = { page: filters.page, pageSize: size, period: { from: filters.from, to: filters.to } };
  if (!cellModule && !parkingModule) return { ...base, rows: [], total: 0, metrics: emptyMetrics };

  const cells = `SELECT c.id,c.nome,c.lider_usuario_id,COALESCE(u.nome,c.responsavel,'') AS responsavel
    FROM celulas c LEFT JOIN usuarios u ON u.id=c.lider_usuario_id
    WHERE c.comunidade_id=? AND c.escopo_confirmado=1 AND (?=1 OR c.lider_usuario_id=? OR c.vice_lider_usuario_id=?)`;
  const expected = `SELECT a.celula_id,date(datetime(a.inicia_em,'-3 hours')) AS day
    FROM celula_agenda a JOIN visible_cells c ON c.id=a.celula_id
    WHERE a.comunidade_id=? AND datetime(a.termina_em)<=CURRENT_TIMESTAMP AND date(datetime(a.inicia_em,'-3 hours')) BETWEEN ? AND ?
    GROUP BY a.celula_id,day`;
  const cellRows = `SELECT r.id,c.id AS groupId,'cells' AS area,c.nome AS groupName,c.nome AS title,r.data_reuniao AS day,
      COALESCE(u.nome,c.responsavel) AS responsible,'RECEBIDO' AS status,(e.celula_id IS NOT NULL) AS expected,
      r.observacoes AS notes,r.presentes AS firstCount,r.visitantes AS secondCount,NULL AS thirdCount,r.aconteceu AS happened
    FROM celula_relatorios r JOIN visible_cells c ON c.id=r.celula_id
    LEFT JOIN usuarios u ON u.id=r.enviado_por_usuario_id
    LEFT JOIN expected_cells e ON e.celula_id=r.celula_id AND e.day=r.data_reuniao
    WHERE r.comunidade_id=? AND r.data_reuniao BETWEEN ? AND ?
    UNION ALL
    SELECT 0,c.id,'cells',c.nome,c.nome,e.day,c.responsavel,'PENDENTE',1,'',NULL,NULL,NULL,NULL
    FROM expected_cells e JOIN visible_cells c ON c.id=e.celula_id
    WHERE NOT EXISTS(SELECT 1 FROM celula_relatorios r WHERE r.comunidade_id=? AND r.celula_id=e.celula_id AND r.data_reuniao=e.day)`;
  const parkingRows = `SELECT r.id,m.id AS groupId,'parking' AS area,m.nome AS groupName,e.titulo AS title,
      date(datetime(e.termina_em,'-3 hours')) AS day,COALESCE(u.nome,'') AS responsible,
      CASE WHEN r.status='AGUARDANDO_MEMBRO' THEN 'PENDENTE' ELSE r.status END AS status,1 AS expected,
      r.resumo AS notes,r.entradas AS firstCount,r.saidas AS secondCount,r.ocorrencias AS thirdCount,NULL AS happened
    FROM estacionamento_relatorios_escala r
    JOIN escalas_ministerio e ON e.id=r.escala_id AND e.comunidade_id=r.comunidade_id
    JOIN ministerios_comunidade m ON m.id=e.ministerio_id AND m.comunidade_id=r.comunidade_id
    JOIN usuarios u ON u.id=r.usuario_id
    WHERE r.comunidade_id=? AND date(datetime(e.termina_em,'-3 hours')) BETWEEN ? AND ?
      AND (?=1 OR m.responsavel_usuario_id=? OR r.usuario_id=? OR (?='PASTOR' AND r.status='ENVIADO_PASTOR'))`;

  const prefix = `WITH ${cellModule ? `visible_cells AS (${cells}), expected_cells AS (${expected}),` : ""}
    archive AS (${[...(cellModule ? [cellRows] : []), ...(parkingModule ? [parkingRows] : [])].join(" UNION ALL ")}),
    filtered AS (SELECT * FROM archive WHERE (?='' OR instr(lower(groupName),lower(?))>0 OR instr(lower(title),lower(?))>0))`;
  const args = [
    ...(cellModule ? [comunidadeId,allCells,userId,userId,comunidadeId,filters.from,filters.to,comunidadeId,filters.from,filters.to,comunidadeId] : []),
    ...(parkingModule ? [comunidadeId,filters.from,filters.to,+permissions.includes("parking.configure"),userId,userId,papel] : []),
    filters.group,filters.group,filters.group,
  ];
  const rowFilter = `(?='' OR status=?)${filters.queue ? " AND status IN ('PENDENTE','AGUARDANDO_LIDER','CORRECAO_SOLICITADA')" : ""}`;
  const [counts,data] = await Promise.all([
    db.prepare(`${prefix} SELECT COUNT(CASE WHEN ${rowFilter} THEN 1 END) AS total,
      COALESCE(SUM(expected),0) AS expected,
      COUNT(CASE WHEN expected=1 AND status<>'PENDENTE' THEN 1 END) AS received,
      COUNT(CASE WHEN status='PENDENTE' THEN 1 END) AS overdue,
      COUNT(CASE WHEN status='AGUARDANDO_LIDER' THEN 1 END) AS reviewing,
      COUNT(CASE WHEN status='CORRECAO_SOLICITADA' THEN 1 END) AS correcting,
      COALESCE(SUM(CASE WHEN happened=1 THEN firstCount ELSE 0 END),0) AS attendance,
      COUNT(CASE WHEN happened=1 THEN 1 END) AS meetings FROM filtered`)
      .bind(...args,filters.status,filters.status).first<ReportArchiveResult["metrics"] & { total: number }>(),
    db.prepare(`${prefix} SELECT * FROM filtered WHERE ${rowFilter}
      ORDER BY day DESC,area ASC,groupId ASC,id DESC LIMIT ? OFFSET ?`)
      .bind(...args,filters.status,filters.status,size,(filters.page-1)*size).all<ReportArchiveRow>(),
  ]);
  const { total = 0, ...metrics } = counts || {};
  return { ...base, rows: data.results, total, metrics: { ...emptyMetrics, ...metrics } };
}

export async function readVisitorCohort(db: D1Database, communityId: number, { from,to }: ReportFilters): Promise<VisitorCohort> {
  const row = await db.prepare(`SELECT COUNT(*) AS registered,COUNT(CASE WHEN status='INTEGRADO' THEN 1 END) AS integrated
    FROM visitantes WHERE comunidade_id=? AND escopo_confirmado=1 AND ativo=1 AND tipo_pessoa='VISITANTE' AND data_entrada BETWEEN ? AND ?`)
    .bind(communityId,from,to).first<VisitorCohort>();
  return row ?? { registered: 0, integrated: 0 };
}
