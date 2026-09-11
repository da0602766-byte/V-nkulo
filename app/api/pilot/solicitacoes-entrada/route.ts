import { getD1 } from "../../../../db";
import {
  cleanupResolvedJoinRequests,
  JOIN_REQUEST_RETENTION_DAYS,
} from "../../../lib/join-request-retention";
import { requireTenantPermission } from "../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("membership.requests.manage");
  if ("error" in access) return access.error;
  const db = getD1();
  await cleanupResolvedJoinRequests(db, access.context.comunidadeId);
  const result = await db
    .prepare(
      `SELECT s.id, s.usuario_id, u.nome, u.email, s.mensagem, s.status,
        s.solicitado_em, s.analisado_em
      FROM solicitacoes_entrada_comunidade s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.comunidade_id = ?
      ORDER BY CASE s.status WHEN 'PENDENTE' THEN 0 ELSE 1 END,
        s.solicitado_em DESC
      LIMIT 100`,
    )
    .bind(access.context.comunidadeId)
    .all<Record<string, unknown>>();
  return Response.json(
    {
      solicitacoes: result.results,
      retention: {
        days: JOIN_REQUEST_RETENTION_DAYS,
        appliesTo: ["APROVADA", "RECUSADA"],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
