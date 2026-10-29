import { getD1 } from "../../../../../db";
import { parkingAuditStatement } from "../../../../lib/parking-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: Context) {
  const access = await requireTenantPermission("parking.exit");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Movimentação inválida." }, { status: 400 });
  }
  const db = getD1();
  const movement = await db
    .prepare(
      `SELECT id, vaga_id, status FROM estacionamento_movimentacoes
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; vaga_id: number | null; status: string }>();
  if (!movement) {
    return Response.json({ error: "Movimentação não encontrada." }, { status: 404 });
  }
  if (movement.status !== "NO_LOCAL") {
    return Response.json({ ok: true, alreadyCompleted: true, message: "A saída já foi registrada." });
  }
  const statements = [
    db
      .prepare(
        `UPDATE estacionamento_movimentacoes
         SET status = 'ENCERRADA', saida_em = CURRENT_TIMESTAMP,
           atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND comunidade_id = ? AND status = 'NO_LOCAL'`,
      )
      .bind(access.user.id, id, access.context.comunidadeId),
    parkingAuditStatement(db,access.context.comunidadeId,access.user.id,"ESTACIONAMENTO_SAIDA_REGISTRADA",{movimentacaoId:id,vagaId:movement.vaga_id}),
  ];
  if (movement.vaga_id) {
    statements.push(
      db
        .prepare(
          `UPDATE estacionamento_vagas
           SET status = 'LIVRE', atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ? AND status='OCUPADA' AND changes()=1
             AND NOT EXISTS(SELECT 1 FROM estacionamento_movimentacoes m WHERE m.vaga_id=estacionamento_vagas.id AND m.comunidade_id=estacionamento_vagas.comunidade_id AND m.status='NO_LOCAL')`,
        )
        .bind(movement.vaga_id, access.context.comunidadeId),
    );
  }
  const [updated] = await db.batch(statements);
  if (!updated.meta.changes) return Response.json({ ok: true, alreadyCompleted: true, message: "A saída já foi registrada." });
  return Response.json({ ok: true });
}
