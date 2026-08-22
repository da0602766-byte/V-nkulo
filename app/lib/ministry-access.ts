import type { getD1 } from "../../db";
import type { TenantContext } from "./tenant";

type D1Database = ReturnType<typeof getD1>;

export function hasGlobalMinistryManagement(context: TenantContext) {
  return (
    context.isOwner ||
    context.communityAccess === "OWNER" ||
    context.papel === "PASTOR" ||
    context.papel === "ADMIN_COMUNIDADE" ||
    context.papel === "SUPERADMIN"
  );
}

export async function canViewMinistry(
  db: D1Database,
  context: TenantContext,
  userId: number,
  ministryId: number,
) {
  const globalManager = hasGlobalMinistryManagement(context);
  const ministry = await db
    .prepare(
      `SELECT m.id
       FROM ministerios_comunidade m
       WHERE m.id = ? AND m.comunidade_id = ? AND m.status = 'ATIVO'
         AND (
           ? = 1
           OR m.responsavel_usuario_id = ?
           OR EXISTS (
             SELECT 1 FROM ministerio_voluntarios own_membership
             WHERE own_membership.ministerio_id = m.id
               AND own_membership.comunidade_id = m.comunidade_id
               AND own_membership.usuario_id = ?
               AND own_membership.ativo = 1
           )
           OR EXISTS (
             SELECT 1
             FROM escala_designacoes own_assignment
             JOIN escalas_ministerio own_schedule
               ON own_schedule.id = own_assignment.escala_id
              AND own_schedule.comunidade_id = own_assignment.comunidade_id
             WHERE own_schedule.ministerio_id = m.id
               AND own_assignment.comunidade_id = m.comunidade_id
               AND own_assignment.usuario_id = ?
               AND own_assignment.ativo = 1
               AND own_schedule.status = 'PUBLICADA'
           )
         )`,
    )
    .bind(
      ministryId,
      context.comunidadeId,
      globalManager ? 1 : 0,
      userId,
      userId,
      userId,
    )
    .first<{ id: number }>();
  return Boolean(ministry);
}

export async function canManageMinistry(
  db: D1Database,
  context: TenantContext,
  userId: number,
  ministryId: number,
) {
  if (hasGlobalMinistryManagement(context)) {
    const ministry = await db
      .prepare(
        `SELECT id FROM ministerios_comunidade
        WHERE id = ? AND comunidade_id = ? AND status = 'ATIVO'`,
      )
      .bind(ministryId, context.comunidadeId)
      .first<{ id: number }>();
    return Boolean(ministry);
  }
  const leadership = await db
    .prepare(
      `SELECT m.id
       FROM ministerios_comunidade m
       WHERE m.id = ? AND m.comunidade_id = ? AND m.status = 'ATIVO'
         AND (
           m.responsavel_usuario_id = ?
           OR EXISTS (
             SELECT 1 FROM ministerio_voluntarios own_leadership
             WHERE own_leadership.ministerio_id = m.id
               AND own_leadership.comunidade_id = m.comunidade_id
               AND own_leadership.usuario_id = ?
               AND own_leadership.papel = 'LIDER'
               AND own_leadership.ativo = 1
           )
         )`,
    )
    .bind(ministryId, context.comunidadeId, userId, userId)
    .first<{ id: number }>();
  return Boolean(leadership);
}

export async function canManageSchedule(
  db: D1Database,
  context: TenantContext,
  userId: number,
  scheduleId: number,
) {
  const schedule = await db
    .prepare(
      `SELECT ministerio_id, criado_por
      FROM escalas_ministerio
      WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(scheduleId, context.comunidadeId)
    .first<{ ministerio_id: number; criado_por: number | null }>();
  if (!schedule) return false;
  if (Number(schedule.criado_por) === userId) return true;
  return canManageMinistry(
    db,
    context,
    userId,
    Number(schedule.ministerio_id),
  );
}

export async function canViewSchedule(
  db: D1Database,
  context: TenantContext,
  userId: number,
  scheduleId: number,
) {
  if (await canManageSchedule(db, context, userId, scheduleId)) return true;
  const assignment = await db
    .prepare(
      `SELECT d.id
       FROM escala_designacoes d
       JOIN escalas_ministerio s
         ON s.id = d.escala_id
        AND s.comunidade_id = d.comunidade_id
       WHERE d.escala_id = ? AND d.comunidade_id = ?
         AND d.usuario_id = ? AND d.ativo = 1
         AND s.status = 'PUBLICADA'
       LIMIT 1`,
    )
    .bind(scheduleId, context.comunidadeId, userId)
    .first<{ id: number }>();
  return Boolean(assignment);
}

export async function hasScheduleConflict(
  db: D1Database,
  {
    comunidadeId,
    usuarioId,
    iniciaEm,
    terminaEm,
    excludeScheduleId = 0,
  }: {
    comunidadeId: number;
    usuarioId: number;
    iniciaEm: string;
    terminaEm: string;
    excludeScheduleId?: number;
  },
) {
  const conflict = await db
    .prepare(
      `SELECT s.id
      FROM escala_designacoes d
      JOIN escalas_ministerio s
        ON s.id = d.escala_id
       AND s.comunidade_id = d.comunidade_id
      WHERE d.comunidade_id = ?
        AND d.usuario_id = ?
        AND d.ativo = 1
        AND d.status NOT IN ('INDISPONIVEL','SUBSTITUICAO_SOLICITADA','AUSENTE')
        AND s.status != 'CANCELADA'
        AND s.id != ?
        AND s.inicia_em < ?
        AND s.termina_em > ?
      LIMIT 1`,
    )
    .bind(
      comunidadeId,
      usuarioId,
      excludeScheduleId,
      terminaEm,
      iniciaEm,
    )
    .first<{ id: number }>();
  return Boolean(conflict);
}
