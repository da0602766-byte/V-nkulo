import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("parking.reserve");
  if ("error" in access) return access.error;
  const db = getD1();
  const [config, stats, nextEvent] = await Promise.all([
    db.prepare(`SELECT ativo,nome_modulo,cor_destaque,regras,atualizado_em FROM estacionamento_configuracoes WHERE comunidade_id=?`).bind(access.context.comunidadeId).first<Record<string,unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='OCUPADA' THEN 1 ELSE 0 END) AS ocupadas,SUM(CASE WHEN status='LIVRE' THEN 1 ELSE 0 END) AS livres,SUM(CASE WHEN tipo IN ('RESERVADA','IDOSO','PCD') THEN 1 ELSE 0 END) AS especiais FROM estacionamento_vagas WHERE comunidade_id=? AND ativo=1`).bind(access.context.comunidadeId).first<Record<string,number>>(),
    db.prepare(`SELECT id,titulo,inicia_em,termina_em,escalas_abrem_em,reservas_abrem_em
      FROM eventos_comunidade WHERE comunidade_id=? AND status='PUBLICADO'
        AND datetime(COALESCE(termina_em,inicia_em),'+4 hours')>=datetime('now')
      ORDER BY inicia_em ASC LIMIT 1`).bind(access.context.comunidadeId).first<Record<string,unknown>>(),
  ]);
  if (!config || !Boolean(config.ativo)) return Response.json({ error:"O módulo de estacionamento está desativado nesta comunidade." },{ status:423 });
  const rules = readRules(config.regras);
  const gateEvent = nextEvent || null;
  const reservationsOpenAt = gateEvent?.reservas_abrem_em ? String(gateEvent.reservas_abrem_em) : null;
  const eventAvailable = Boolean(gateEvent);
  const unlocked = eventAvailable && (!reservationsOpenAt || Date.parse(reservationsOpenAt) <= Date.now());
  const eventStartsAt = Date.parse(String(gateEvent?.inicia_em || ""));
  const eventEndsAt = Date.parse(String(gateEvent?.termina_em || gateEvent?.inicia_em || ""));
  const reservationWindowStart = unlocked ? new Date(eventStartsAt - (4 * 60 * 60 * 1000)).toISOString() : "1970-01-01T00:00:00.000Z";
  const reservationWindowEnd = unlocked ? new Date(eventEndsAt + (4 * 60 * 60 * 1000)).toISOString() : "1970-01-01T00:00:00.000Z";
  const spaces = unlocked
    ? await db.prepare(`SELECT v.id,v.codigo,v.tipo,v.status,v.posicao_x,v.posicao_y,
        s.id AS setor_id,s.nome AS setor_nome,s.cor AS setor_cor,s.ordem,
        EXISTS(SELECT 1 FROM estacionamento_reservas r
          WHERE r.comunidade_id=v.comunidade_id AND r.vaga_id=v.id
            AND r.status IN ('PENDENTE','CONFIRMADA','CHECKIN')
            AND datetime(r.inicio_em)<datetime(?) AND datetime(r.fim_em)>datetime(?)) AS reservada
        FROM estacionamento_vagas v
        JOIN estacionamento_setores s ON s.id=v.setor_id AND s.comunidade_id=v.comunidade_id
        WHERE v.comunidade_id=? AND v.ativo=1 AND s.ativo=1
        ORDER BY s.ordem,s.nome,v.posicao_y,v.posicao_x,v.codigo`)
      .bind(reservationWindowEnd,reservationWindowStart,access.context.comunidadeId).all<Record<string,unknown>>()
    : { results: [] as Record<string,unknown>[] };
  const availableSpaces = spaces.results.filter((space) => String(space.status) === "LIVRE" && !Boolean(space.reservada)).length;
  return Response.json({
    config:{ ...config, ...rules, responsavel:null, atualizado_por_nome:null },
    stats:{ total:Number(stats?.total||0), ocupadas:Number(stats?.ocupadas||0), livres:availableSpaces, especiais:Number(stats?.especiais||0) },
    vagas:unlocked ? spaces.results : [],
    movimentacoes:[], ocorrencias:[], availableUsers:[],
    operator:{ id:access.user.id,nome:access.user.nome,email:access.user.email,papel:access.context.papel,origemAcesso:"MEMBRO",escala:null },
    permissions:access.context.permissions,
    reservationGate:{
      unlocked,
      eventAvailable,
      reason: !eventAvailable ? "NO_EVENT" : "WAIT_OPENING",
      eventId: gateEvent ? Number(gateEvent.id) : null,
      eventTitle: gateEvent ? String(gateEvent.titulo) : "",
      eventStartsAt: gateEvent ? String(gateEvent.inicia_em) : null,
      eventEndsAt: gateEvent ? String(gateEvent.termina_em || gateEvent.inicia_em) : null,
      schedulesOpenAt: gateEvent?.escalas_abrem_em ? String(gateEvent.escalas_abrem_em) : null,
      reservationsOpenAt,
    },
  },{ headers:{ "Cache-Control":"no-store" } });
}

function readRules(value: unknown) {
  try {
    const parsed=JSON.parse(String(value||"{}")) as Record<string,unknown>;
    return { responsavelUsuarioId:parsed.responsavelUsuarioId ? Number(parsed.responsavelUsuarioId) : null, instrucoes:String(parsed.instrucoes||"") };
  } catch { return { responsavelUsuarioId:null,instrucoes:"" }; }
}
