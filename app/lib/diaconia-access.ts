import type { getD1 } from "../../db";
import type { TenantContext } from "./tenant";
import { canManageSchedule } from "./ministry-access";

type D1Database = ReturnType<typeof getD1>;

export async function closeExpiredDiaconiaSchedules(
  db: D1Database,
  comunidadeId: number,
) {
  await db
    .prepare(
      `UPDATE escalas_ministerio
       SET status = 'AGUARDANDO_CHECKLIST',
         atualizado_em = CURRENT_TIMESTAMP
       WHERE comunidade_id = ? AND status = 'PUBLICADA'
         AND termina_em <= ?`,
    )
    .bind(comunidadeId, new Date().toISOString())
    .run();
}

export async function canAccessDiaconiaSchedule(
  db: D1Database,
  context: TenantContext,
  userId: number,
  scheduleId: number,
) {
  if (context.permissions.includes("diaconia.manage")) {
    return isDiaconiaSchedule(db, context.comunidadeId, scheduleId);
  }
  const schedule = await db
    .prepare(
      `SELECT s.id
       FROM escalas_ministerio s
       WHERE s.id = ? AND s.comunidade_id = ?
         AND (
           s.criado_por = ?
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
       LIMIT 1`,
    )
    .bind(scheduleId, context.comunidadeId, userId, userId, userId)
    .first<{ id: number }>();
  return Boolean(schedule);
}

export async function canUpdateDiaconiaChecklist(
  db: D1Database,
  context: TenantContext,
  userId: number,
  scheduleId: number,
) {
  if (context.permissions.includes("diaconia.manage")) {
    return canManageSchedule(db, context, userId, scheduleId);
  }
  const assignment = await db
    .prepare(
      `SELECT d.id
       FROM escala_designacoes d
       JOIN escalas_ministerio s
         ON s.id = d.escala_id
        AND s.comunidade_id = d.comunidade_id
       WHERE d.escala_id = ? AND d.comunidade_id = ?
         AND d.usuario_id = ? AND d.ativo = 1
       LIMIT 1`,
    )
    .bind(scheduleId, context.comunidadeId, userId)
    .first<{ id: number }>();
  return Boolean(assignment);
}

export async function isDiaconiaSchedule(
  db: D1Database,
  comunidadeId: number,
  scheduleId: number,
) {
  const schedule = await db
    .prepare(
      `SELECT s.id
       FROM escalas_ministerio s
       WHERE s.id = ? AND s.comunidade_id = ?
       LIMIT 1`,
    )
    .bind(scheduleId, comunidadeId)
    .first<{ id: number }>();
  return Boolean(schedule);
}
