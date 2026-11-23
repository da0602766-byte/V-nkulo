import { getD1 } from "../../../../../db";
import { closeParkingReports } from "../../../../lib/parking-report-closure";
import { readParkingShiftStats } from "../../../../lib/parking-shift-stats";
import { scheduleWebPushDelivery } from "../../../../lib/push-delivery-queue";
import { requireTenantPermission } from "../../../../lib/tenant";

const headers = { "Cache-Control": "private, no-store" };

async function reportAccess() {
  const access = await requireTenantPermission("reports.view");
  if ("error" in access) return access;
  if (access.context.communityAccess === "FEED_ONLY" ||
      !access.context.modules.includes("parking") ||
      !access.context.permissions.some(permission => permission === "parking.reserve" || permission === "parking.view")) {
    return { error: Response.json({ error: "Os relatórios de estacionamento não estão disponíveis para seu acesso." }, { status: 403, headers }) } as const;
  }
  return access;
}

export async function GET(request: Request) {
  const access = await reportAccess();
  if ("error" in access) return access.error;
  const db = getD1();
  const { comunidadeId, papel, permissions } = access.context;
  const params = new URL(request.url).searchParams;
  const id = params.has("id") ? Number(params.get("id")) : null;
  if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) {
    return Response.json({ error: "Relatório inválido." }, { status: 400, headers });
  }
  if (id === null) await closeParkingReports(db, comunidadeId);
  const canConfigure = permissions.includes("parking.configure");
  const rows = await db.prepare(`SELECT r.*,e.titulo,e.inicia_em,e.termina_em,u.nome AS membro_nome,
      CASE WHEN ?=1 OR m.responsavel_usuario_id=? THEN 1 ELSE 0 END AS pode_revisar,
      CASE WHEN r.usuario_id=? THEN 1 ELSE 0 END AS proprio
    FROM estacionamento_relatorios_escala r
    JOIN escalas_ministerio e ON e.id=r.escala_id AND e.comunidade_id=r.comunidade_id
    JOIN ministerios_comunidade m ON m.id=e.ministerio_id AND m.comunidade_id=r.comunidade_id
    JOIN usuarios u ON u.id=r.usuario_id
    WHERE r.comunidade_id=? AND (? IS NULL OR r.id=?)
      AND (?=1 OR m.responsavel_usuario_id=? OR r.usuario_id=? OR (?='PASTOR' AND r.status='ENVIADO_PASTOR'))
    ORDER BY r.atualizado_em DESC,r.id DESC LIMIT 60`)
    .bind(+canConfigure,access.user.id,access.user.id,comunidadeId,id,id,+canConfigure,access.user.id,access.user.id,papel).all<{ pode_revisar: number }>();
  return Response.json({ relatorios: rows.results, canReview: rows.results.some(row => Boolean(row.pode_revisar)) }, { headers });
}

export async function PATCH(request: Request) {
  const access = await reportAccess();
  if ("error" in access) return access.error;
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = Number(payload?.id);
  const action = String(payload?.acao || "").toUpperCase();
  if (!Number.isSafeInteger(id) || id <= 0 || !["ENVIAR", "CORRIGIR", "CONFIRMAR"].includes(action)) {
    return Response.json({ error: "Informe o relatório e uma ação válida." }, { status: 400, headers });
  }
  const db = getD1();
  const { comunidadeId, permissions } = access.context;
  const row = await db.prepare(`SELECT r.usuario_id,r.status,e.inicia_em,e.termina_em,m.responsavel_usuario_id
    FROM estacionamento_relatorios_escala r
    JOIN escalas_ministerio e ON e.id=r.escala_id AND e.comunidade_id=r.comunidade_id
    JOIN ministerios_comunidade m ON m.id=e.ministerio_id AND m.comunidade_id=r.comunidade_id
    WHERE r.id=? AND r.comunidade_id=?`).bind(id,comunidadeId)
    .first<{ usuario_id: number; status: string; inicia_em: string; termina_em: string; responsavel_usuario_id: number | null }>();
  if (!row) return Response.json({ error: "Relatório não encontrado." }, { status: 404, headers });
  const canReview = permissions.includes("parking.configure") || Number(row.responsavel_usuario_id) === access.user.id;
  if (action === "ENVIAR" ? Number(row.usuario_id) !== access.user.id : !canReview) {
    return Response.json({ error: "Você não pode executar esta etapa." }, { status: 403, headers });
  }

  const conflict = () => Response.json({ error: "Este relatório já mudou de etapa. Atualize a lista para consultar seu estado." }, { status: 409, headers });
  if (action === "ENVIAR") {
    const resumo = String(payload?.resumo ?? "").trim().slice(0,1200);
    if (row.status === "CORRECAO_SOLICITADA" && !resumo) {
      return Response.json({ error: "Informe o resumo corrigido." }, { status: 400, headers });
    }
    const stats = await readParkingShiftStats(db,comunidadeId,row.inicia_em,row.termina_em);
    const result = await db.prepare(`UPDATE estacionamento_relatorios_escala
      SET resumo=?,entradas=?,saidas=?,ocorrencias=?,status='AGUARDANDO_LIDER',atualizado_em=CURRENT_TIMESTAMP
      WHERE id=? AND comunidade_id=? AND status IN ('AGUARDANDO_MEMBRO','CORRECAO_SOLICITADA')`)
      .bind(resumo,stats.entradas,stats.saidas,stats.ocorrencias,id,comunidadeId).run();
    return result.meta.changes ? Response.json({ ok: true }, { headers }) : conflict();
  }

  const correction = action === "CORRIGIR";
  const reason = correction ? String(payload?.motivo ?? "").trim().slice(0,1200) : "";
  if (correction && !reason) {
    return Response.json({ error: "Informe o que precisa ser corrigido." }, { status: 400, headers });
  }
  const destination = `/painel?view=estacionamento&relatorio=${id}`;
  const [updated] = await db.batch([
    db.prepare(`UPDATE estacionamento_relatorios_escala
      SET status=?,motivo_correcao=?,revisado_por=?,enviado_pastor_em=${correction ? "NULL" : "CURRENT_TIMESTAMP"},atualizado_em=CURRENT_TIMESTAMP
      WHERE id=? AND comunidade_id=? AND status='AGUARDANDO_LIDER'`)
      .bind(correction ? "CORRECAO_SOLICITADA" : "ENVIADO_PASTOR",reason,access.user.id,id,comunidadeId),
    db.prepare(`INSERT INTO notificacoes_sistema
      (tipo,titulo,mensagem,area,entidade_id,usuario_id,comunidade_id,destino_rota,criado_por)
      SELECT 'IMPORTANTE',?,?,'ESCALAS',?,u.id,uc.comunidade_id,?,?
      FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id AND u.ativo=1
      WHERE uc.comunidade_id=? AND uc.status='ATIVO'
        AND ${correction ? "u.id=?" : "uc.papel IN ('PASTOR','ADMIN_COMUNIDADE') AND u.id<>?"} AND changes()=1`)
      .bind(correction ? "Correção de relatório de estacionamento" : "Relatório de estacionamento revisado",
        correction ? "Abra o relatório para consultar a correção solicitada." : "O fechamento do plantão está disponível para consulta.",
        id,destination,access.user.email,comunidadeId,correction ? row.usuario_id : access.user.id),
  ]);
  if (!updated.meta.changes) return conflict();
  scheduleWebPushDelivery(db);
  return Response.json({ ok: true }, { headers });
}
