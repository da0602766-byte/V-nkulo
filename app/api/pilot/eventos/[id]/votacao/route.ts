import { getD1 } from "../../../../../../db";
import { ensureEventVotingTables, parsePollJson } from "../../../../../lib/event-voting";
import { requireTenantPermission } from "../../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireTenantPermission("events.rsvp");
  if ("error" in access) return access.error;
  const eventId = Number((await context.params).id);
  const body = (await request.json().catch(() => ({}))) as { opcao?: unknown };
  const option = Number(body.opcao);
  if (!Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(option) || option < 0) {
    return Response.json({ error: "Opção de votação inválida." }, { status: 400 });
  }
  const db = getD1();
  await ensureEventVotingTables(db);
  const event = await db.prepare(
    `SELECT e.id, e.status, q.opcoes_json
     FROM eventos_comunidade e
     JOIN eventos_enquetes q ON q.evento_id = e.id AND q.comunidade_id = e.comunidade_id
     WHERE e.id = ? AND e.comunidade_id = ?
     LIMIT 1`,
  ).bind(eventId, access.context.comunidadeId).first<{ id: number; status: string; opcoes_json: string }>();
  if (!event || event.status !== "PUBLICADO") {
    return Response.json({ error: "Votação não encontrada ou evento não publicado." }, { status: 404 });
  }
  const options = parsePollJson(event.opcoes_json);
  if (option >= options.length) {
    return Response.json({ error: "Escolha uma opção disponível." }, { status: 400 });
  }
  await db.prepare(
    `INSERT INTO eventos_enquetes_votos (evento_id, comunidade_id, usuario_id, opcao)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(evento_id, usuario_id) DO UPDATE SET opcao = excluded.opcao,
       atualizado_em = CURRENT_TIMESTAMP`,
  ).bind(eventId, access.context.comunidadeId, access.user.id, option).run();
  return Response.json({ ok: true, opcao: option });
}
