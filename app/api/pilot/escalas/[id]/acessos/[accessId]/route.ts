import { getD1 } from "../../../../../../../db";
import { canManageSchedule } from "../../../../../../lib/ministry-access";
import { requireTenantPermission } from "../../../../../../lib/tenant";
import {
  getTemporaryAccessById,
  recordTemporaryAccessAudit,
} from "../../../../../../lib/temporary-access";

type Context = {
  params: Promise<{ id: string; accessId: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const { id, accessId } = await context.params;
  const scheduleId = Number(id);
  const grantId = Number(accessId);
  const body = await safeJson(request);
  if (
    !Number.isInteger(scheduleId) ||
    scheduleId <= 0 ||
    !Number.isInteger(grantId) ||
    grantId <= 0 ||
    String(body?.acao || "").toUpperCase() !== "CANCELAR"
  ) {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }
  const db = getD1();
  if (
    !(await canManageSchedule(
      db,
      access.context,
      access.user.id,
      scheduleId,
    ))
  ) {
    return Response.json(
      { error: "Você não administra esta escala." },
      { status: 403 },
    );
  }
  const grant = await getTemporaryAccessById(db, grantId, { sync: false });
  if (
    !grant ||
    Number(grant.comunidade_id) !== access.context.comunidadeId ||
    Number(grant.escala_id) !== scheduleId
  ) {
    return Response.json(
      { error: "Autorização não encontrada nesta escala." },
      { status: 404 },
    );
  }
  if (["EXPIRADO", "CANCELADO", "NEGADO"].includes(grant.status)) {
    return Response.json({ ok: true, status: grant.status });
  }
  await db
    .prepare(
      `UPDATE acessos_temporarios
       SET status = 'CANCELADO', cancelado_por = ?,
         cancelado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ?
         AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
    )
    .bind(access.user.id, grant.id, access.context.comunidadeId)
    .run();
  await recordTemporaryAccessAudit(
    db,
    grant,
    "ACESSO_TEMPORARIO_CANCELADO",
    "SUCESSO",
    access.user.id,
    { motivo: "CANCELADO_PELO_RESPONSAVEL" },
  );
  return Response.json({ ok: true, status: "CANCELADO" });
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const { id, accessId } = await context.params;
  const scheduleId = Number(id);
  const grantId = Number(accessId);
  if (
    !Number.isInteger(scheduleId) ||
    scheduleId <= 0 ||
    !Number.isInteger(grantId) ||
    grantId <= 0
  ) {
    return Response.json({ error: "Acesso inválido." }, { status: 400 });
  }
  const db = getD1();
  if (!(await canManageSchedule(db, access.context, access.user.id, scheduleId))) {
    return Response.json(
      { error: "Você não administra esta escala." },
      { status: 403 },
    );
  }
  const grant = await getTemporaryAccessById(db, grantId, { sync: false });
  if (
    !grant ||
    Number(grant.comunidade_id) !== access.context.comunidadeId ||
    Number(grant.escala_id) !== scheduleId
  ) {
    return Response.json(
      { error: "Autorização não encontrada nesta escala." },
      { status: 404 },
    );
  }
  await recordTemporaryAccessAudit(
    db,
    grant,
    "ACESSO_TEMPORARIO_HISTORICO_EXCLUIDO",
    "SUCESSO",
    access.user.id,
    { statusAnterior: grant.status, motivo: "EXCLUIDO_DO_HISTORICO" },
  );
  const deletion = await db
    .prepare(
      `DELETE FROM acessos_temporarios
       WHERE id = ? AND comunidade_id = ? AND escala_id = ?`,
    )
    .bind(grant.id, access.context.comunidadeId, scheduleId)
    .run();
  if (!Number(deletion.meta.changes)) {
    return Response.json(
      { error: "O histórico já havia sido excluído." },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, deleted: true });
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
