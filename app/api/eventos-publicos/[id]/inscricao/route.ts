import { getD1 } from "../../../../../db";
import { getSessionUser } from "../../../../lib/local-auth";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Entre na sua conta para se inscrever." }, { status: 401 });
  }

  const eventId = Number((await context.params).id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }

  const db = getD1();
  const event = await db.prepare(
    `SELECT e.id, e.comunidade_id, e.capacidade,
      SUM(CASE WHEN ce.status = 'CONFIRMADO' THEN 1 ELSE 0 END) AS confirmacoes,
      MAX(CASE WHEN ce.usuario_id = ? THEN ce.status ELSE NULL END) AS minha_confirmacao
    FROM eventos_comunidade e
    LEFT JOIN confirmacoes_evento ce
      ON ce.evento_id = e.id AND ce.comunidade_id = e.comunidade_id
    WHERE e.id = ? AND e.publico = 1 AND e.status = 'PUBLICADO'
    GROUP BY e.id`,
  ).bind(user.id, eventId).first<{
    id: number;
    comunidade_id: number;
    capacidade: number | null;
    confirmacoes: number;
    minha_confirmacao: string | null;
  }>();

  if (!event) {
    return Response.json({ error: "Este evento público não está mais disponível." }, { status: 404 });
  }
  if (
    event.minha_confirmacao !== "CONFIRMADO" &&
    event.capacidade &&
    Number(event.confirmacoes) >= Number(event.capacidade)
  ) {
    return Response.json({ error: "A capacidade deste evento foi atingida." }, { status: 409 });
  }

  const membership = await db.prepare(
    `SELECT 1 AS active
    FROM usuario_comunidades
    WHERE usuario_id = ? AND comunidade_id = ? AND status = 'ATIVO'
    LIMIT 1`,
  ).bind(user.id, event.comunidade_id).first<{ active: number }>();

  await db.prepare(
    `INSERT INTO confirmacoes_evento
      (evento_id, comunidade_id, usuario_id, status)
    VALUES (?, ?, ?, 'CONFIRMADO')
    ON CONFLICT(evento_id, usuario_id) DO UPDATE SET
      status = 'CONFIRMADO',
      comunidade_id = excluded.comunidade_id,
      atualizado_em = CURRENT_TIMESTAMP`,
  ).bind(eventId, event.comunidade_id, user.id).run();

  return Response.json({ ok: true, external: !membership });
}
