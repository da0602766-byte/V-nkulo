import type { getD1 } from "../../db";
import type { TenantContext } from "./tenant";

type D1Database = ReturnType<typeof getD1>;

export const AUDIT_RETENTION_DAYS = 14;
export const OWNER_AUDIT_VISIBLE_LIMIT = 20;

export async function purgeExpiredAudit(db: D1Database) {
  return db
    .prepare(
      `DELETE FROM auditoria_piloto
       WHERE datetime(criado_em) < datetime('now', '-${AUDIT_RETENTION_DAYS} days')`,
    )
    .run();
}

export async function recordTenantAudit(
  db: D1Database,
  context: TenantContext,
  userId: number,
  event: string,
  result: "SUCESSO" | "NEGADO" | "ERRO",
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await db.batch([
    db
      .prepare(
        `DELETE FROM auditoria_piloto
         WHERE datetime(criado_em) < datetime('now', '-${AUDIT_RETENTION_DAYS} days')`,
      ),
    db
      .prepare(
        `INSERT INTO auditoria_piloto
        (comunidade_id, usuario_id, evento, resultado, metadados)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        context.comunidadeId,
        userId,
        event,
        result,
        JSON.stringify(metadata),
      ),
  ]);
}
