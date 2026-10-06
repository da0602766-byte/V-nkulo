import type { getD1 } from "../../db";

/** Place directly after a conditional write in a D1 batch; failed/replayed writes produce no audit. */
export function parkingAuditStatement(db: ReturnType<typeof getD1>, communityId: number, userId: number, event: string, metadata: Record<string, unknown>, insertedIdKey?: string) {
  return db.prepare(`INSERT INTO auditoria_piloto (comunidade_id,usuario_id,evento,resultado,metadados)
    SELECT ?,?,?,'SUCESSO',CASE WHEN ?='' THEN ? ELSE json_set(?, ?,last_insert_rowid()) END WHERE changes()=1`)
    .bind(communityId,userId,event,insertedIdKey||"",JSON.stringify(metadata),JSON.stringify(metadata),'$.'+(insertedIdKey||'id'));
}
