import { getD1 } from "../../../../../db";
import { parseParkingOccurrence } from "../../../../lib/parking-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";
import { createSystemNotification } from "../../../../lib/system-notifications";

export async function POST(request: Request) {
  const access = await requireTenantPermission("parking.edit");
  if ("error" in access) return access.error;
  const parsed = parseParkingOccurrence(
    (await request.json()) as Record<string, unknown>,
  );
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const db = getD1();
  if (parsed.movimentacaoId) {
    const movement = await db
      .prepare(
        `SELECT id FROM estacionamento_movimentacoes
         WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(parsed.movimentacaoId, access.context.comunidadeId)
      .first<{ id: number }>();
    if (!movement) {
      return Response.json({ error: "Movimentação não encontrada." }, { status: 404 });
    }
  }
  const result = await db
    .prepare(
      `INSERT INTO estacionamento_ocorrencias
       (comunidade_id, movimentacao_id, tipo, descricao, gravidade, criado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      access.context.comunidadeId,
      parsed.movimentacaoId,
      parsed.tipo,
      parsed.descricao,
      parsed.gravidade,
      access.user.id,
    )
    .run();
  const occurrenceId = Number(result.meta.last_row_id);
  const config = await db
    .prepare(
      `SELECT regras FROM estacionamento_configuracoes
       WHERE comunidade_id = ?`,
    )
    .bind(access.context.comunidadeId)
    .first<{ regras: string }>();
  const responsibleId = readResponsibleId(config?.regras);
  if (responsibleId && responsibleId !== access.user.id) {
    await createSystemNotification(db, {
      tipo: parsed.gravidade === "ALTA" ? "IMPORTANTE" : "NOVO",
      titulo: "Nova ocorrência no estacionamento",
      mensagem: `${access.user.nome} registrou uma ocorrência de ${parsed.tipo.toLowerCase()} (${parsed.gravidade.toLowerCase()}).`,
      area: "DIACONIA",
      entidadeId: occurrenceId,
      usuarioId: responsibleId,
      criadoPor: access.user.nome,
    });
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ESTACIONAMENTO_OCORRENCIA_CRIADA",
    "SUCESSO",
    { ocorrenciaId: occurrenceId, movimentacaoId: parsed.movimentacaoId },
  );
  return Response.json({ id: occurrenceId }, { status: 201 });
}

function readResponsibleId(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    const id = Number(parsed.responsavelUsuarioId || 0);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
