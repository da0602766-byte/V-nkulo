import { getD1 } from "../../../../../../db";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireTenantPermission("events.rsvp");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  const payload = (await request.json()) as { status?: string };
  const status = String(payload.status || "").toUpperCase();
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !["CONFIRMADO", "CANCELADO"].includes(status)
  ) {
    return Response.json({ error: "Confirmação inválida." }, { status: 400 });
  }

  const db = getD1();
  const event = await db
    .prepare(
      `SELECT e.id, e.capacidade,
        SUM(CASE WHEN ce.status = 'CONFIRMADO' THEN 1 ELSE 0 END) AS confirmacoes,
        MAX(CASE WHEN ce.usuario_id = ? THEN ce.status ELSE NULL END) AS minha_confirmacao
      FROM eventos_comunidade e
      LEFT JOIN confirmacoes_evento ce
        ON ce.evento_id = e.id
       AND ce.comunidade_id = e.comunidade_id
      WHERE e.id = ? AND e.comunidade_id = ? AND e.status = 'PUBLICADO'
      GROUP BY e.id`,
    )
    .bind(access.user.id, id, access.context.comunidadeId)
    .first<{
      id: number;
      capacidade: number | null;
      confirmacoes: number;
      minha_confirmacao: string | null;
    }>();
  if (!event) {
    return Response.json(
      { error: "Evento publicado não encontrado." },
      { status: 404 },
    );
  }
  if (
    status === "CONFIRMADO" &&
    event.minha_confirmacao !== "CONFIRMADO" &&
    event.capacidade &&
    Number(event.confirmacoes) >= Number(event.capacidade)
  ) {
    return Response.json(
      { error: "A capacidade deste evento foi atingida." },
      { status: 409 },
    );
  }

  await db
    .prepare(
      `INSERT INTO confirmacoes_evento
      (evento_id, comunidade_id, usuario_id, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(evento_id, usuario_id) DO UPDATE SET
        status = excluded.status,
        comunidade_id = excluded.comunidade_id,
        atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(id, access.context.comunidadeId, access.user.id, status)
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "CONFIRMACAO_EVENTO_V45_ALTERADA",
    "SUCESSO",
    { eventoId: id, status },
  );
  return Response.json({ ok: true, status });
}
