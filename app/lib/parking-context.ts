import type { getD1 } from "../../db";

type Database = ReturnType<typeof getD1>;
type ParkingEvent = { id: number; titulo: string; inicia_em: string; termina_em: string | null; reservas_abrem_em: string | null; escalas_abrem_em: string | null; status: string; local: string };

/** Shared tenant projection: never returns another member's identity. */
export async function readParkingContext(db: Database, communityId: number, userId: number, url: URL) {
  const events = await db.prepare(`SELECT id,titulo,inicia_em,termina_em,reservas_abrem_em,escalas_abrem_em,status,local
    FROM eventos_comunidade WHERE comunidade_id=? AND status='PUBLICADO'
      AND datetime(COALESCE(termina_em,inicia_em),'+4 hours')>=datetime('now') ORDER BY inicia_em,id`)
    .bind(communityId).all<ParkingEvent>();
  const requestedId = Number(url.searchParams.get("eventoId"));
  const event = requestedId ? events.results.find(item => item.id === requestedId) : null;
  if (requestedId && !event) return { error: "A atividade não está mais disponível.", status: 409 } as const;
  const startInput = url.searchParams.get("inicioEm");
  const endInput = url.searchParams.get("fimEm");
  const eventStart = event ? Date.parse(event.inicia_em) : Date.now();
  const eventEnd = event ? Date.parse(event.termina_em || "") || eventStart + 2 * 60 * 60_000 : eventStart;
  const start = startInput ? Date.parse(startInput) : event ? eventStart - 45 * 60_000 : eventStart;
  const end = endInput ? Date.parse(endInput) : event ? eventEnd + 30 * 60_000 : eventStart + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { error: "Informe uma janela de uso válida.", status: 400 } as const;
  const startsAt = new Date(start).toISOString();
  const endsAt = new Date(end).toISOString();
  const spaces = await db.prepare(`WITH reservations AS (
    SELECT r.vaga_id,
      MAX(CASE WHEN r.status IN ('PENDENTE','CONFIRMADA') THEN 1 ELSE 0 END) AS reservada,
      MAX(CASE WHEN r.usuario_id=? AND (r.status IN ('PENDENTE','CONFIRMADA') OR EXISTS(SELECT 1 FROM estacionamento_movimentacoes m WHERE m.comunidade_id=r.comunidade_id AND m.vaga_id=r.vaga_id AND m.status='NO_LOCAL' AND m.observacoes='Entrada liberada por QR da reserva '||r.id||'.')) THEN 1 ELSE 0 END) AS minha_reserva
    FROM estacionamento_reservas r WHERE r.comunidade_id=? AND r.status IN ('PENDENTE','CONFIRMADA','CHECKIN')
      AND datetime(r.inicio_em)<datetime(?) AND datetime(r.fim_em)>datetime(?) GROUP BY r.vaga_id
    ) SELECT v.id,v.codigo,v.tipo,v.status,v.posicao_x,v.posicao_y,v.atualizado_em,
    s.id AS setor_id,s.nome AS setor_nome,s.cor AS setor_cor,s.ordem,
    COALESCE(r.reservada,0) AS reservada,COALESCE(r.minha_reserva,0) AS minha_reserva
    FROM estacionamento_vagas v JOIN estacionamento_setores s ON s.id=v.setor_id AND s.comunidade_id=v.comunidade_id
    LEFT JOIN reservations r ON r.vaga_id=v.id
    WHERE v.comunidade_id=? AND v.ativo=1 AND s.ativo=1 ORDER BY s.ordem,s.nome,v.posicao_y,v.posicao_x,v.codigo,v.id`)
    .bind(userId,communityId,endsAt,startsAt,communityId).all<Record<string, unknown>>();
  const vagas = spaces.results;
  const openAt = event?.reservas_abrem_em || null;
  const unlocked = Boolean(event) && (!openAt || Date.parse(openAt) <= Date.now());
  return {
    vagas,
    stats: {
      total: vagas.length,
      livres: vagas.filter(v => v.status === "LIVRE" && !v.reservada).length,
      ocupadas: vagas.filter(v => v.status === "OCUPADA").length,
      reservadas: vagas.filter(v => v.status === "LIVRE" && v.reservada).length,
      indisponiveis: vagas.filter(v => !["LIVRE", "OCUPADA"].includes(String(v.status))).length,
      especiais: vagas.filter(v => v.tipo !== "COMUM").length,
    },
    eventos: events.results, serverTime: new Date().toISOString(),
    context: { eventoId: event?.id || null, inicioEm: startsAt, fimEm: endsAt },
    reservationGate: {
      unlocked, eventAvailable: Boolean(events.results.length),
      reason: !events.results.length ? "NO_EVENT" : !event ? "SELECT_EVENT" : unlocked ? "OPEN" : "WAIT_OPENING",
      eventId: event?.id || null, eventTitle: event?.titulo || "",
      eventStartsAt: event?.inicia_em || null, eventEndsAt: event?.termina_em || null,
      schedulesOpenAt: event?.escalas_abrem_em || null, reservationsOpenAt: openAt,
    },
  };
}
