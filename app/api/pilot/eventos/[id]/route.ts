import { getD1 } from "../../../../../db";
import { parseEventPayload } from "../../../../lib/event-validation";
import { ensureEventVotingTables } from "../../../../lib/event-voting";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("events.manage");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }
  const payload = (await request.json()) as Record<string, unknown>;
  const db = getD1();
  await ensureEventVotingTables(db);
  const existing = await db
    .prepare(
      `SELECT id, status FROM eventos_comunidade
      WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; status: string }>();
  if (!existing) {
    return Response.json({ error: "Evento não encontrado." }, { status: 404 });
  }

  if (String(payload.acao || "").toUpperCase() === "CANCELAR") {
    if (existing.status === "CANCELADO") {
      return Response.json({ ok: true });
    }
    await db
      .prepare(
        `UPDATE eventos_comunidade
        SET status = 'CANCELADO', atualizado_por = ?,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(access.user.id, id, access.context.comunidadeId)
      .run();
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "EVENTO_V45_CANCELADO",
      "SUCESSO",
      { eventoId: id },
    );
    return Response.json({ ok: true });
  }

  const parsed = parseEventPayload(payload);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  await db
    .prepare(
      `UPDATE eventos_comunidade SET
        titulo = ?, descricao = ?, categoria = ?, inicia_em = ?,
        termina_em = ?, local = ?, publico = ?, status = ?, capacidade = ?,
        atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(
      parsed.titulo,
      parsed.descricao,
      parsed.categoria,
      parsed.iniciaEm,
      parsed.terminaEm,
      parsed.local,
      parsed.publico ? 1 : 0,
      parsed.status,
      parsed.capacidade,
      access.user.id,
      id,
      access.context.comunidadeId,
    )
    .run();
  if (parsed.enquete) {
    await db.prepare(
      `INSERT INTO eventos_enquetes (evento_id, comunidade_id, pergunta, opcoes_json, criado_por)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(evento_id) DO UPDATE SET pergunta = excluded.pergunta,
         opcoes_json = excluded.opcoes_json, atualizado_em = CURRENT_TIMESTAMP`,
    ).bind(
      id,
      access.context.comunidadeId,
      parsed.enquete.pergunta,
      JSON.stringify(parsed.enquete.opcoes),
      access.user.id,
    ).run();
  } else {
    await db.prepare(`DELETE FROM eventos_enquetes_votos WHERE evento_id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId).run();
    await db.prepare(`DELETE FROM eventos_enquetes WHERE evento_id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId).run();
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "EVENTO_V45_ATUALIZADO",
    "SUCESSO",
    {
      eventoId: id,
      status: parsed.status,
      publico: parsed.publico,
    },
  );
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireTenantPermission("events.manage");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }
  const db = getD1();
  await ensureEventVotingTables(db);
  const existing = await db
    .prepare(
      `SELECT id, titulo, status FROM eventos_comunidade
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; titulo: string; status: string }>();
  if (!existing) {
    return Response.json({ error: "Evento não encontrado." }, { status: 404 });
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "EVENTO_EXCLUIDO_DEFINITIVAMENTE",
    "SUCESSO",
    { eventoId: id, titulo: existing.titulo, statusAnterior: existing.status },
  );
  await db.prepare(`DELETE FROM eventos_enquetes_votos WHERE evento_id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId).run();
  await db.prepare(`DELETE FROM eventos_enquetes WHERE evento_id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId).run();
  await db
    .prepare(`DELETE FROM eventos_comunidade WHERE id = ? AND comunidade_id = ?`)
    .bind(id, access.context.comunidadeId)
    .run();
  return Response.json({ deleted: true });
}
