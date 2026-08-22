import { getD1 } from "../../../../db";
import { parseEventPayload } from "../../../lib/event-validation";
import { ensureEventVotingTables, parsePollJson } from "../../../lib/event-voting";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const MAX_EVENTS = 100;

export async function GET() {
  const access = await requireTenantPermission("events.view");
  if ("error" in access) return access.error;
  const canManage = access.context.permissions.includes("events.manage");
  const db = getD1();
  await ensureEventVotingTables(db);
  const result = await db
    .prepare(
      `SELECT e.id, e.titulo, e.descricao, e.categoria, e.inicia_em,
        e.termina_em, e.local, e.publico, e.status, e.capacidade,
        e.criado_por, e.criado_em, e.atualizado_em,
        SUM(CASE WHEN ce.status = 'CONFIRMADO' THEN 1 ELSE 0 END) AS confirmacoes,
        MAX(CASE WHEN ce.usuario_id = ? THEN ce.status ELSE NULL END) AS minha_confirmacao,
        CASE WHEN e.criado_por = ? OR ? = 1 THEN 1 ELSE 0 END AS can_view_registrants,
        CASE WHEN e.criado_por = ? OR ? = 1 THEN COALESCE((
          SELECT json_group_array(json_object(
            'usuario_id', inscricao.usuario_id,
            'nome', pessoa.nome,
            'status', inscricao.status,
            'atualizado_em', inscricao.atualizado_em,
            'is_member', CASE WHEN EXISTS (
              SELECT 1 FROM usuario_comunidades vinculo
              WHERE vinculo.usuario_id = inscricao.usuario_id
                AND vinculo.comunidade_id = e.comunidade_id
                AND vinculo.status = 'ATIVO'
            ) THEN 1 ELSE 0 END
          ))
          FROM confirmacoes_evento inscricao
          JOIN usuarios pessoa ON pessoa.id = inscricao.usuario_id
          WHERE inscricao.evento_id = e.id
            AND inscricao.comunidade_id = e.comunidade_id
            AND inscricao.status = 'CONFIRMADO'
        ), '[]') ELSE '[]' END AS inscritos
      FROM eventos_comunidade e
      LEFT JOIN confirmacoes_evento ce
        ON ce.evento_id = e.id
       AND ce.comunidade_id = e.comunidade_id
      WHERE e.comunidade_id = ?
        AND (e.status = 'PUBLICADO' OR ? = 1)
      GROUP BY e.id
      ORDER BY e.inicia_em ASC, e.id ASC
      LIMIT ?`,
    )
    .bind(
      access.user.id,
      access.user.id,
      canManage ? 1 : 0,
      access.user.id,
      canManage ? 1 : 0,
      access.context.comunidadeId,
      canManage ? 1 : 0,
      MAX_EVENTS,
    )
    .all<Record<string, unknown>>();
  const pollRows = await db.prepare(
    `SELECT q.evento_id, q.pergunta, q.opcoes_json,
      MAX(CASE WHEN v.usuario_id = ? THEN v.opcao ELSE NULL END) AS minha_opcao,
      COUNT(v.id) AS total_votos
     FROM eventos_enquetes q
     LEFT JOIN eventos_enquetes_votos v
       ON v.evento_id = q.evento_id AND v.comunidade_id = q.comunidade_id
     WHERE q.comunidade_id = ?
     GROUP BY q.evento_id, q.pergunta, q.opcoes_json`,
  ).bind(access.user.id, access.context.comunidadeId).all<Record<string, unknown>>();
  const voteRows = await db.prepare(
    `SELECT evento_id, opcao, COUNT(*) AS total
     FROM eventos_enquetes_votos
     WHERE comunidade_id = ?
     GROUP BY evento_id, opcao`,
  ).bind(access.context.comunidadeId).all<Record<string, unknown>>();
  const votesByEvent = new Map<number, Map<number, number>>();
  for (const row of voteRows.results) {
    const eventId = Number(row.evento_id);
    const eventVotes = votesByEvent.get(eventId) || new Map<number, number>();
    eventVotes.set(Number(row.opcao), Number(row.total || 0));
    votesByEvent.set(eventId, eventVotes);
  }
  const polls = new Map<number, { pergunta: string; opcoes: Array<{ id: number; label: string; votos: number }>; minha_opcao: number | null; total_votos: number }>();
  for (const row of pollRows.results) {
    const eventId = Number(row.evento_id);
    const counts = votesByEvent.get(eventId) || new Map<number, number>();
    polls.set(eventId, {
      pergunta: String(row.pergunta || ""),
      opcoes: parsePollJson(row.opcoes_json).map((label, index) => ({ id: index, label, votos: counts.get(index) || 0 })),
      minha_opcao: row.minha_opcao == null ? null : Number(row.minha_opcao),
      total_votos: Number(row.total_votos || 0),
    });
  }
  return Response.json(
    {
      eventos: result.results.map((event) => ({
        ...event,
        enquete: polls.get(Number(event.id)) || null,
        inscritos: parseRegistrants(event.inscritos),
      })),
      canManage,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function parseRegistrants(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.slice(0, 1000) : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("events.manage");
  if ("error" in access) return access.error;
  const parsed = parseEventPayload(await request.json());
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const db = getD1();
  const result = await db
    .prepare(
      `INSERT INTO eventos_comunidade
      (comunidade_id, titulo, descricao, categoria, inicia_em, termina_em,
       local, publico, status, capacidade, criado_por, atualizado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      access.context.comunidadeId,
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
      access.user.id,
    )
    .run();
  const eventId = Number(result.meta.last_row_id);
  if (parsed.enquete) {
    await db.prepare(
      `INSERT INTO eventos_enquetes (evento_id, comunidade_id, pergunta, opcoes_json, criado_por)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(evento_id) DO UPDATE SET pergunta = excluded.pergunta,
         opcoes_json = excluded.opcoes_json, atualizado_em = CURRENT_TIMESTAMP`,
    ).bind(
      eventId,
      access.context.comunidadeId,
      parsed.enquete.pergunta,
      JSON.stringify(parsed.enquete.opcoes),
      access.user.id,
    ).run();
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "EVENTO_V45_CRIADO",
    "SUCESSO",
    {
      eventoId: eventId,
      status: parsed.status,
      publico: parsed.publico,
    },
  );
  return Response.json({ id: eventId }, { status: 201 });
}
