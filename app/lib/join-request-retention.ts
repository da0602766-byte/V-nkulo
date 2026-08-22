import { getD1 } from "../../db";

type D1Database = ReturnType<typeof getD1>;

export const JOIN_REQUEST_RETENTION_DAYS = 7;

/**
 * Remove somente decisões já concluídas. Solicitações pendentes continuam
 * disponíveis para análise até uma decisão explícita da comunidade.
 */
export async function cleanupResolvedJoinRequests(
  db: D1Database,
  communityId: number,
) {
  await db
    .prepare(
      `DELETE FROM solicitacoes_entrada_comunidade
      WHERE comunidade_id = ?
        AND status IN ('APROVADA', 'RECUSADA')
        AND analisado_em IS NOT NULL
        AND datetime(analisado_em) <= datetime('now', '-7 days')`,
    )
    .bind(communityId)
    .run();
}
