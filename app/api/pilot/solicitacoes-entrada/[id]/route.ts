import { getD1 } from "../../../../../db";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";
import { notifyUser } from "../../../../lib/pilot-notifications";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("membership.requests.manage");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }
  const payload = (await request.json()) as { acao?: unknown };
  const acao = String(payload.acao || "").toUpperCase();
  if (!["APROVAR", "RECUSAR"].includes(acao)) {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }
  const db = getD1();
  const entry = await db
    .prepare(
      `SELECT id, usuario_id, status
      FROM solicitacoes_entrada_comunidade
      WHERE id = ? AND comunidade_id = ? LIMIT 1`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; usuario_id: number; status: string }>();
  if (!entry) {
    return Response.json(
      { error: "Solicitação não encontrada." },
      { status: 404 },
    );
  }
  if (entry.status !== "PENDENTE") {
    return Response.json(
      { error: "Esta solicitação já foi analisada." },
      { status: 409 },
    );
  }
  if (Number(entry.usuario_id) === access.user.id) {
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "SOLICITACAO_ENTRADA_V45_AUTORREVISAO",
      "NEGADO",
      { solicitacaoId: id },
    );
    return Response.json(
      { error: "O solicitante não pode analisar a própria solicitação." },
      { status: 403 },
    );
  }
  const nextStatus = acao === "APROVAR" ? "APROVADA" : "RECUSADA";
  const statements = [];
  if (acao === "APROVAR") {
    statements.push(
      db
        .prepare(
          `INSERT INTO usuario_comunidades
          (usuario_id, comunidade_id, papel, status)
          VALUES (?, ?, 'MEMBRO', 'ATIVO')
          ON CONFLICT(usuario_id, comunidade_id) DO UPDATE SET
            papel = 'MEMBRO', status = 'ATIVO'`,
        )
        .bind(entry.usuario_id, access.context.comunidadeId),
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE solicitacoes_entrada_comunidade
        SET status = ?, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND comunidade_id = ? AND status = 'PENDENTE'`,
      )
      .bind(nextStatus, access.user.id, id, access.context.comunidadeId),
  );
  await db.batch(statements);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    acao === "APROVAR"
      ? "SOLICITACAO_ENTRADA_V45_APROVADA"
      : "SOLICITACAO_ENTRADA_V45_RECUSADA",
    "SUCESSO",
    { solicitacaoId: id, usuarioId: Number(entry.usuario_id) },
  );
  await notifyUser(db, {
    userId: Number(entry.usuario_id),
    title:
      acao === "APROVAR"
        ? "Entrada na comunidade aprovada"
        : "Solicitação de entrada analisada",
    message:
      acao === "APROVAR"
        ? `Seu acesso a ${access.context.comunidadeNome} foi aprovado.`
        : `Sua solicitação para ${access.context.comunidadeNome} não foi aprovada desta vez.`,
    entityId: id,
    createdBy: access.user.email,
  });
  return Response.json({ ok: true, status: nextStatus });
}
