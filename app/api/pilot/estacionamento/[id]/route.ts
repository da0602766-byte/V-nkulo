import { getD1 } from "../../../../../db";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
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
    return Response.json({ error: "A saída já foi registrada." }, { status: 409 });
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
  ];
  if (movement.vaga_id) {
    statements.push(
      db
        .prepare(
          `UPDATE estacionamento_vagas
           SET status = 'LIVRE', atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?`,
        )
        .bind(movement.vaga_id, access.context.comunidadeId),
    );
  }
  await db.batch(statements);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ESTACIONAMENTO_SAIDA_REGISTRADA",
    "SUCESSO",
    { movimentacaoId: id, vagaId: movement.vaga_id },
  );
  return Response.json({ ok: true });
}
