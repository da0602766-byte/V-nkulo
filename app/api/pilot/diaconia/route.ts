import { getD1 } from "../../../../db";
import {
  canAccessDiaconiaSchedule,
  canUpdateDiaconiaChecklist,
  closeExpiredDiaconiaSchedules,
  isDiaconiaSchedule,
} from "../../../lib/diaconia-access";
import {
  cleanDiaconiaAction,
  parseChecklistItem,
  parseChecklistUpdate,
  parseDiaconiaReport,
} from "../../../lib/diaconia-validation";
import {
  canManageMinistry,
  canManageSchedule,
} from "../../../lib/ministry-access";
import { notifyUser } from "../../../lib/pilot-notifications";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

type Row = Record<string, unknown>;

export async function GET() {
  const access = await requireTenantPermission("diaconia.view");
  if ("error" in access) return access.error;
  const db = getD1();
  await closeExpiredDiaconiaSchedules(db, access.context.comunidadeId);
  await migrateLegacyChecklist(db, access.context.comunidadeId);
  const canManage = access.context.permissions.includes("diaconia.manage");
  const canDeleteChecklistGlobally =
    access.context.isOwner || canManage;
  const schedules = await db
    .prepare(
      `SELECT s.id, s.ministerio_id, m.nome AS ministerio_nome,
        m.categoria AS ministerio_categoria,
        ministry_leader.nome AS ministerio_lider_nome,
        s.titulo, s.inicia_em, s.termina_em, s.local, s.status,
        s.observacoes,
        CASE WHEN ? = 1 OR s.criado_por = ? OR EXISTS (
          SELECT 1 FROM ministerio_voluntarios lead
          WHERE lead.ministerio_id = s.ministerio_id
            AND lead.comunidade_id = s.comunidade_id
            AND lead.usuario_id = ? AND lead.papel = 'LIDER'
            AND lead.ativo = 1
        ) THEN 1 ELSE 0 END AS can_manage,
        CASE WHEN ? = 1 OR m.responsavel_usuario_id = ? OR EXISTS (
          SELECT 1 FROM ministerio_voluntarios delete_lead
          WHERE delete_lead.ministerio_id = s.ministerio_id
            AND delete_lead.comunidade_id = s.comunidade_id
            AND delete_lead.usuario_id = ? AND delete_lead.papel = 'LIDER'
            AND delete_lead.ativo = 1
        ) THEN 1 ELSE 0 END AS can_delete_checklist
       FROM escalas_ministerio s
       JOIN ministerios_comunidade m
         ON m.id = s.ministerio_id
        AND m.comunidade_id = s.comunidade_id
       LEFT JOIN usuarios ministry_leader
         ON ministry_leader.id = m.responsavel_usuario_id
       WHERE s.comunidade_id = ?
         AND (
           ? = 1 OR s.criado_por = ?
           OR EXISTS (
             SELECT 1 FROM ministerio_voluntarios mv
             WHERE mv.ministerio_id = s.ministerio_id
               AND mv.comunidade_id = s.comunidade_id
               AND mv.usuario_id = ? AND mv.ativo = 1
           )
           OR EXISTS (
             SELECT 1 FROM escala_designacoes d
             WHERE d.escala_id = s.id
               AND d.comunidade_id = s.comunidade_id
               AND d.usuario_id = ? AND d.ativo = 1
           )
         )
       ORDER BY s.inicia_em DESC, s.id DESC
       LIMIT 120`,
    )
    .bind(
      canManage ? 1 : 0,
      access.user.id,
      access.user.id,
      canDeleteChecklistGlobally ? 1 : 0,
      access.user.id,
      access.user.id,
      access.context.comunidadeId,
      canManage ? 1 : 0,
      access.user.id,
      access.user.id,
      access.user.id,
    )
    .all<Row>();
  const ids = schedules.results.map((item) => Number(item.id));
  const placeholders = ids.map(() => "?").join(",");
  const checklist = ids.length
    ? await db
        .prepare(
          `SELECT ci.id, ci.escala_id, ci.designacao_id, ci.tarefa,
            ci.status, ci.substituto_usuario_id,
            ci.substituto_externo_nome, ci.observacao,
            ci.atualizado_em, su.nome AS substituto_nome,
            du.nome AS responsavel_nome
           FROM ministerio_checklist_itens ci
           LEFT JOIN usuarios su ON su.id = ci.substituto_usuario_id
           LEFT JOIN escala_designacoes d ON d.id = ci.designacao_id
           LEFT JOIN usuarios du ON du.id = d.usuario_id
           WHERE ci.comunidade_id = ?
             AND ci.escala_id IN (${placeholders})
           ORDER BY ci.id ASC`,
        )
        .bind(access.context.comunidadeId, ...ids)
        .all<Row>()
    : { results: [] as Row[] };
  const assignments = ids.length
    ? await db
        .prepare(
          `SELECT d.id, d.escala_id, d.usuario_id, u.nome, d.funcao
           FROM escala_designacoes d
           JOIN usuarios u ON u.id = d.usuario_id
           WHERE d.comunidade_id = ? AND d.ativo = 1
             AND d.escala_id IN (${placeholders})
           ORDER BY u.nome ASC`,
        )
        .bind(access.context.comunidadeId, ...ids)
        .all<Row>()
    : { results: [] as Row[] };
  const reports = ids.length
    ? await db
        .prepare(
          `SELECT id, escala_id, resumo, status,
            destinatarios_notificados, encerrado_em
           FROM diaconia_relatorios
           WHERE comunidade_id = ? AND escala_id IN (${placeholders})`,
        )
        .bind(access.context.comunidadeId, ...ids)
        .all<Row>()
    : { results: [] as Row[] };
  const substitutes = await db
    .prepare(
      `SELECT DISTINCT u.id, u.nome
       FROM usuarios u
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO'
         AND u.ativo = 1
       ORDER BY u.nome ASC
       LIMIT 300`,
    )
    .bind(access.context.comunidadeId)
    .all<Row>();

  const checklistBySchedule = groupBySchedule(checklist.results);
  const assignmentsBySchedule = groupBySchedule(assignments.results);
  const reportsBySchedule = new Map(
    reports.results.map((item) => [Number(item.escala_id), item]),
  );
  return Response.json(
    {
      schedules: schedules.results.map((schedule) => ({
        ...schedule,
        checklist: checklistBySchedule.get(Number(schedule.id)) || [],
        assignments: assignmentsBySchedule.get(Number(schedule.id)) || [],
        report: reportsBySchedule.get(Number(schedule.id)) || null,
      })),
      substitutes: substitutes.results,
      canManage,
      externalDelivery: false,
      autoClosure: "ON_NEXT_ACCESS",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("diaconia.view");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, unknown>;
  const action = cleanDiaconiaAction(payload.acao);
  const db = getD1();
  await closeExpiredDiaconiaSchedules(db, access.context.comunidadeId);

  if (action === "EXCLUIR_ITEM") {
    const itemId = Number(payload.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return Response.json({ error: "Checklist inválido." }, { status: 400 });
    }
    const item = await db
      .prepare(
        `SELECT ci.id, ci.escala_id, s.ministerio_id
         FROM ministerio_checklist_itens ci
         JOIN escalas_ministerio s
           ON s.id = ci.escala_id
          AND s.comunidade_id = ci.comunidade_id
         WHERE ci.id = ? AND ci.comunidade_id = ?`,
      )
      .bind(itemId, access.context.comunidadeId)
      .first<{ id: number; escala_id: number; ministerio_id: number }>();
    if (!item) {
      return Response.json({ error: "Checklist não encontrado." }, { status: 404 });
    }
    const canDeleteGlobally =
      access.context.isOwner ||
      access.context.permissions.includes("diaconia.manage");
    if (
      !canDeleteGlobally &&
      !(await canManageMinistry(
        db,
        access.context,
        access.user.id,
        Number(item.ministerio_id),
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    await db
      .prepare(
        `DELETE FROM ministerio_checklist_itens
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(itemId, access.context.comunidadeId)
      .run();
    await audit("DIACONIA_CHECKLIST_EXCLUIDO", {
      escalaId: Number(item.escala_id),
      itemId,
    });
    return Response.json({ deleted: true });
  }

  if (action === "CRIAR_ITEM") {
    const parsed = parseChecklistItem(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    if (
      !(await canManageSchedule(
        db,
        access.context,
        access.user.id,
        parsed.scheduleId,
      )) ||
      !(await isDiaconiaSchedule(
        db,
        access.context.comunidadeId,
        parsed.scheduleId,
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    const schedule = await db
      .prepare(
        `SELECT status FROM escalas_ministerio
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(parsed.scheduleId, access.context.comunidadeId)
      .first<{ status: string }>();
    if (
      !schedule ||
      ["ENCERRADA", "CANCELADA"].includes(schedule.status)
    ) {
      return Response.json(
        { error: "Esta escala não aceita novos itens." },
        { status: 409 },
      );
    }
    if (parsed.assignmentId) {
      const assignment = await db
        .prepare(
          `SELECT id FROM escala_designacoes
           WHERE id = ? AND escala_id = ? AND comunidade_id = ? AND ativo = 1`,
        )
        .bind(
          parsed.assignmentId,
          parsed.scheduleId,
          access.context.comunidadeId,
        )
        .first<{ id: number }>();
      if (!assignment) {
        return Response.json(
          { error: "Responsável não pertence a esta escala." },
          { status: 404 },
        );
      }
    }
    const result = await db
      .prepare(
        `INSERT INTO ministerio_checklist_itens
         (comunidade_id, escala_id, designacao_id, tarefa, atualizado_por)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        access.context.comunidadeId,
        parsed.scheduleId,
        parsed.assignmentId,
        parsed.tarefa,
        access.user.id,
      )
      .run();
    await audit("DIACONIA_CHECKLIST_ITEM_CRIADO", {
      escalaId: parsed.scheduleId,
      itemId: Number(result.meta.last_row_id),
    });
    return Response.json({ id: Number(result.meta.last_row_id) }, { status: 201 });
  }

  if (action === "ATUALIZAR_ITEM") {
    const parsed = parseChecklistUpdate(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const item = await db
      .prepare(
        `SELECT id, escala_id
         FROM ministerio_checklist_itens
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(parsed.itemId, access.context.comunidadeId)
      .first<{ id: number; escala_id: number }>();
    if (!item) {
      return Response.json({ error: "Item não encontrado." }, { status: 404 });
    }
    if (
      !(await canUpdateDiaconiaChecklist(
        db,
        access.context,
        access.user.id,
        Number(item.escala_id),
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    const schedule = await db
      .prepare(
        `SELECT status FROM escalas_ministerio
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(item.escala_id, access.context.comunidadeId)
      .first<{ status: string }>();
    if (!schedule || schedule.status !== "AGUARDANDO_CHECKLIST") {
      return Response.json(
        { error: "O checklist só é liberado após o encerramento da escala." },
        { status: 409 },
      );
    }
    if (parsed.substitutoUsuarioId) {
      const substitute = await db
        .prepare(
          `SELECT u.id
           FROM usuarios u
           JOIN usuario_comunidades uc ON uc.usuario_id = u.id
           WHERE u.id = ? AND u.ativo = 1
             AND uc.comunidade_id = ? AND uc.status = 'ATIVO'
           LIMIT 1`,
        )
        .bind(
          parsed.substitutoUsuarioId,
          access.context.comunidadeId,
        )
        .first<{ id: number }>();
      if (!substitute) {
        return Response.json(
          { error: "O substituto cadastrado não pertence à comunidade." },
          { status: 404 },
        );
      }
    }
    await db
      .prepare(
        `UPDATE ministerio_checklist_itens
         SET status = ?, substituto_usuario_id = ?,
           substituto_externo_nome = ?, observacao = ?,
           atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(
        parsed.status,
        parsed.substitutoUsuarioId,
        parsed.substitutoExternoNome,
        parsed.observacao,
        access.user.id,
        parsed.itemId,
        access.context.comunidadeId,
      )
      .run();
    await audit("DIACONIA_CHECKLIST_ITEM_ATUALIZADO", {
      escalaId: Number(item.escala_id),
      itemId: parsed.itemId,
      status: parsed.status,
    });
    return Response.json({ updated: true });
  }

  if (action === "FINALIZAR_RELATORIO") {
    const parsed = parseDiaconiaReport(payload);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    if (
      !access.context.permissions.includes("diaconia.report") ||
      !(await canManageSchedule(
        db,
        access.context,
        access.user.id,
        parsed.scheduleId,
      )) ||
      !(await canAccessDiaconiaSchedule(
        db,
        access.context,
        access.user.id,
        parsed.scheduleId,
      ))
    ) {
      return Response.json({ error: "Ação não permitida." }, { status: 403 });
    }
    const schedule = await db
      .prepare(
        `SELECT titulo, status FROM escalas_ministerio
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(parsed.scheduleId, access.context.comunidadeId)
      .first<{ titulo: string; status: string }>();
    if (!schedule || schedule.status !== "AGUARDANDO_CHECKLIST") {
      return Response.json(
        { error: "A escala ainda não está pronta para finalizar." },
        { status: 409 },
      );
    }
    const checklist = await db
      .prepare(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) AS pendentes
         FROM ministerio_checklist_itens
         WHERE escala_id = ? AND comunidade_id = ?`,
      )
      .bind(parsed.scheduleId, access.context.comunidadeId)
      .first<{ total: number; pendentes: number }>();
    if (!checklist || Number(checklist.total) === 0) {
      return Response.json(
        { error: "Adicione ao menos um item ao checklist." },
        { status: 409 },
      );
    }
    if (Number(checklist.pendentes) > 0) {
      return Response.json(
        { error: "Conclua todos os itens antes de finalizar." },
        { status: 409 },
      );
    }
    const recipients = await db
      .prepare(
        `SELECT DISTINCT u.id
         FROM usuarios u
         JOIN usuario_comunidades uc ON uc.usuario_id = u.id
         JOIN comunidades c ON c.id = uc.comunidade_id
         LEFT JOIN oficiais_comunidade oc
           ON oc.usuario_comunidade_id = uc.id
         WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO'
           AND u.ativo = 1
           AND (
             uc.papel IN ('PASTOR', 'ADMIN_COMUNIDADE')
             OR c.proprietario_usuario_id = u.id
             OR UPPER(COALESCE(oc.titulo, '')) IN (
               'PASTOR PRINCIPAL', 'LÍDER GERAL', 'LIDER GERAL'
             )
           )`,
      )
      .bind(access.context.comunidadeId)
      .all<{ id: number }>();
    await db.batch([
      db
        .prepare(
          `INSERT INTO diaconia_relatorios
           (comunidade_id, escala_id, resumo, destinatarios_notificados,
            encerrado_por)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(escala_id) DO UPDATE SET
             resumo = excluded.resumo,
             destinatarios_notificados = excluded.destinatarios_notificados,
             encerrado_por = excluded.encerrado_por,
             encerrado_em = CURRENT_TIMESTAMP,
             atualizado_em = CURRENT_TIMESTAMP`,
        )
        .bind(
          access.context.comunidadeId,
          parsed.scheduleId,
          parsed.resumo,
          recipients.results.length,
          access.user.id,
        ),
      db
        .prepare(
          `UPDATE escalas_ministerio
           SET status = 'ENCERRADA', atualizado_por = ?,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(
          access.user.id,
          parsed.scheduleId,
          access.context.comunidadeId,
        ),
    ]);
    await Promise.all(
      recipients.results.map((recipient) =>
        notifyUser(db, {
          userId: Number(recipient.id),
          title: "Relatório de escala finalizado",
          message: `${schedule.titulo} foi encerrada em ${access.context.comunidadeNome}.`,
          entityId: parsed.scheduleId,
          area: "CHECKLISTS",
          createdBy: access.user.email,
        }),
      ),
    );
    await audit("DIACONIA_RELATORIO_FINALIZADO", {
      escalaId: parsed.scheduleId,
      destinatarios: recipients.results.length,
    });
    return Response.json({
      finalized: true,
      recipients: recipients.results.length,
      externalDelivery: false,
    });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });

  async function audit(
    event: string,
    metadata: Record<string, unknown>,
  ) {
    return recordTenantAudit(
      db,
      access.context!,
      access.user!.id,
      event,
      "SUCESSO",
      metadata,
    );
  }
}

function groupBySchedule(rows: Row[]) {
  const grouped = new Map<number, Row[]>();
  for (const row of rows) {
    const id = Number(row.escala_id);
    const items = grouped.get(id) || [];
    items.push(row);
    grouped.set(id, items);
  }
  return grouped;
}

async function migrateLegacyChecklist(
  db: ReturnType<typeof getD1>,
  comunidadeId: number,
) {
  await db
    .prepare(
      `INSERT INTO ministerio_checklist_itens
       (comunidade_id, escala_id, designacao_id, tarefa, status,
        substituto_usuario_id, substituto_externo_nome, observacao,
        atualizado_por, criado_em, atualizado_em)
       SELECT legacy.comunidade_id, legacy.escala_id, legacy.designacao_id,
         legacy.tarefa, legacy.status, legacy.substituto_usuario_id,
         legacy.substituto_externo_nome, legacy.observacao,
         legacy.atualizado_por, legacy.criado_em, legacy.atualizado_em
       FROM diaconia_checklist_itens legacy
       WHERE legacy.comunidade_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM ministerio_checklist_itens current
           WHERE current.comunidade_id = legacy.comunidade_id
             AND current.escala_id = legacy.escala_id
             AND current.tarefa = legacy.tarefa
             AND COALESCE(current.designacao_id, 0) =
               COALESCE(legacy.designacao_id, 0)
         )`,
    )
    .bind(comunidadeId)
    .run();
}
