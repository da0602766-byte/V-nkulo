import { parkingAuditStatement } from "../../../../lib/parking-audit";
import { getD1 } from "../../../../../db";
import { maskDocument, normalizeBrazilianPhone, onlyDigits, validateCpfCnpj } from "../../../../lib/brazilian-validation";
import { notifyUser } from "../../../../lib/pilot-notifications";
import { requireTenantPermission } from "../../../../lib/tenant";
import { recordTenantAudit } from "../../../../lib/tenant-audit";

function normalizeReservationCode(value: unknown) {
  const match = String(value || "").trim().toUpperCase().match(/VK-[A-F0-9]{8,32}/);
  return match?.[0] || "";
}

export async function GET(request: Request) {
  const access = await requireTenantPermission("parking.reserve");
  if ("error" in access) return access.error;
  const personalView = new URL(request.url).searchParams.get("scope") === "mine";
  const canManage = !personalView && ["parking.entry", "parking.exit", "parking.edit", "parking.configure"]
    .some((permission) => access.context.permissions.includes(permission));
  const db = getD1();
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const pageSize = Math.min(80, Math.max(1, Math.floor(Number(params.get("pageSize")) || 40)));
  const query = params.get("q")?.trim().slice(0,120) || "";
  const statusFilter = params.get("status") || "";
  const sector = Number(params.get("setorId")) || 0;
  const event = Number(params.get("eventoId")) || 0;
  const type = params.get("tipo") || "";
  const conditions = `r.comunidade_id = ? AND (? = 1 OR r.usuario_id = ?)
    AND (?='' OR r.nome_completo LIKE ? OR r.placa_veiculo LIKE ? OR v.codigo LIKE ? OR CAST(r.id AS TEXT)=?)
    AND (?='' OR r.status=?) AND (?=0 OR v.setor_id=?) AND (?=0 OR r.evento_id=?) AND (?='' OR v.tipo=?)`;
  const bindings = [access.context.comunidadeId, canManage ? 1 : 0, access.user.id, query, '%'+query+'%', '%'+query+'%', '%'+query+'%', query,
    statusFilter,statusFilter,sector,sector,event,event,type,type];
  const joins = `FROM estacionamento_reservas r
    JOIN estacionamento_vagas v ON v.id=r.vaga_id AND v.comunidade_id=r.comunidade_id
    JOIN estacionamento_setores s ON s.id=v.setor_id AND s.comunidade_id=r.comunidade_id`;
  const [rows,total] = await Promise.all([
    db.prepare(`SELECT r.id,r.usuario_id,r.vaga_id,r.evento_id,r.evento_titulo,r.nome_completo,r.email,r.telefone,
      r.placa_veiculo,r.tipo_veiculo,r.modelo_veiculo,r.cor_veiculo,r.documento_mascarado,r.inicio_em,r.fim_em,r.codigo,r.status,r.checkin_em,
      v.codigo AS vaga_codigo,v.tipo AS vaga_tipo,s.id AS setor_id,s.nome AS setor_nome,
      (SELECT m.saida_em FROM estacionamento_movimentacoes m WHERE m.comunidade_id=r.comunidade_id AND m.vaga_id=r.vaga_id
        AND m.observacoes='Entrada liberada por QR da reserva '||r.id||'.' ORDER BY m.id DESC LIMIT 1) AS saida_em
      ${joins} WHERE ${conditions}
      ORDER BY CASE r.status WHEN 'PENDENTE' THEN 0 WHEN 'CONFIRMADA' THEN 1 ELSE 2 END,r.inicio_em DESC,r.id DESC LIMIT ? OFFSET ?`)
      .bind(...bindings,pageSize,(page-1)*pageSize).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total ${joins} WHERE ${conditions}`).bind(...bindings).first<{total:number}>(),
  ]);
  const reservations = rows.results.map(({ usuario_id: ownerId, ...row }) => ({ ...row, codigo: Number(ownerId)===access.user.id ? row.codigo : "" }));
  return Response.json({ reservas: reservations, canManage, page, pageSize, total: Number(total?.total || 0) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("parking.reserve");
  if ("error" in access) return access.error;
  const payload = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const vagaId = Number(payload.vagaId);
  const nome = String(payload.nomeCompleto || "").trim().slice(0, 140);
  const email = String(payload.email || "").trim().toLowerCase().slice(0, 180);
  const document = onlyDigits(payload.documento, 14);
  const phone = normalizeBrazilianPhone(payload.telefone);
  const vehiclePlate = String(payload.placaVeiculo || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const vehicleType = String(payload.tipoVeiculo || "CARRO").trim().toUpperCase();
  const vehicleModel = String(payload.modeloVeiculo || "").trim().slice(0, 80);
  const vehicleColor = String(payload.corVeiculo || "").trim().slice(0, 40);
  const eventId = Number(payload.eventoId) || null;
  if (!eventId) return Response.json({ error: "Selecione uma atividade publicada para reservar." }, { status: 400 });
  const start = new Date(String(payload.inicioEm || ""));
  const end = new Date(String(payload.fimEm || ""));
  const validEmail = /^\S+@\S+\.\S+$/.test(email);
  const validDocument = validateCpfCnpj(document);
  const db = getD1();
  const linkedCpf = await db.prepare(`SELECT cpf_hash, finais FROM identidades_cpf WHERE usuario_id=? LIMIT 1`).bind(access.user.id).first<{ cpf_hash: string; finais: string }>();
  if (!vagaId || nome.length < 5 || (!validEmail && !validDocument && !linkedCpf) || !phone || vehiclePlate.length < 6 || !["CARRO", "MOTO", "VAN", "OUTRO"].includes(vehicleType) || vehicleModel.length < 2 || !vehicleColor || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return Response.json({ error: "Revise os dados do usuário, veículo, contato e período da reserva." }, { status: 400 });
  }
  let eventTitle = "";
  if (eventId) {
    const linkedEvent = await db.prepare(
      `SELECT id, titulo, reservas_abrem_em FROM eventos_comunidade
       WHERE id = ? AND comunidade_id = ? AND status = 'PUBLICADO' LIMIT 1`,
    ).bind(eventId, access.context.comunidadeId).first<{ id: number; titulo: string; reservas_abrem_em: string | null }>();
    if (!linkedEvent) {
      return Response.json({ error: "O evento ou culto escolhido não está mais disponível." }, { status: 409 });
    }
    if (linkedEvent.reservas_abrem_em && Date.parse(linkedEvent.reservas_abrem_em) > Date.now()) return Response.json({ error: "As reservas desta atividade ainda não abriram." }, { status: 409 });
    eventTitle = linkedEvent.titulo;
  }
  const config = await db.prepare("SELECT ativo FROM estacionamento_configuracoes WHERE comunidade_id=?").bind(access.context.comunidadeId).first<{ativo:number}>();
  if (!config?.ativo) return Response.json({ error: "O módulo está desativado nesta comunidade." }, { status: 423 });
  const identityKey = validDocument ? document : linkedCpf?.cpf_hash ? `CPF:${linkedCpf.cpf_hash}` : email;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${access.context.comunidadeId}:${identityKey}`));
  const documentHash = [...new Uint8Array(hashBuffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const requestId = String(payload.requestId || crypto.randomUUID());
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return Response.json({ error: "Identificador da solicitação inválido." }, { status: 400 });
  const keyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${access.context.comunidadeId}:${access.user.id}:${requestId}`));
  const code = 'VK-' + [...new Uint8Array(keyHash)].map(value => value.toString(16).padStart(2,'0')).join('').slice(0, 24).toUpperCase();
  const tenantId = access.context.comunidadeId, requesterId = access.user.id;
  async function recovered() {
    const existing = await db.prepare("SELECT * FROM estacionamento_reservas WHERE comunidade_id=? AND usuario_id=? AND codigo=?").bind(tenantId,requesterId,code).first<Record<string,unknown>>();
    if (!existing) return null;
    const same = Number(existing.vaga_id)===vagaId && (Number(existing.evento_id)||null)===eventId && existing.nome_completo===nome
      && existing.email===(validEmail?email:"") && existing.telefone===phone && existing.placa_veiculo===vehiclePlate
      && existing.tipo_veiculo===vehicleType && existing.modelo_veiculo===vehicleModel && existing.cor_veiculo===vehicleColor
      && existing.documento_hash===documentHash && existing.inicio_em===start.toISOString() && existing.fim_em===end.toISOString();
    return same ? Response.json({ id:existing.id,codigo:code,status:existing.status,recovered:true }) : Response.json({ error:"Esta solicitação já foi usada com outros dados." },{status:409});
  }
  const previous = await recovered();
  if (previous) return previous;
  const insert = db.prepare(`INSERT INTO estacionamento_reservas
    (comunidade_id,vaga_id,usuario_id,evento_id,evento_titulo,nome_completo,email,telefone,placa_veiculo,tipo_veiculo,modelo_veiculo,cor_veiculo,documento_hash,documento_mascarado,inicio_em,fim_em,codigo)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE EXISTS(SELECT 1 FROM estacionamento_vagas v JOIN estacionamento_setores s ON s.id=v.setor_id AND s.comunidade_id=v.comunidade_id
      WHERE v.id=? AND v.comunidade_id=? AND v.ativo=1 AND s.ativo=1 AND v.status='LIVRE')
    AND NOT EXISTS(SELECT 1 FROM estacionamento_reservas WHERE comunidade_id=? AND vaga_id=? AND status IN ('PENDENTE','CONFIRMADA')
      AND datetime(inicio_em)<datetime(?) AND datetime(fim_em)>datetime(?))
    AND NOT EXISTS(SELECT 1 FROM estacionamento_movimentacoes WHERE comunidade_id=? AND vaga_id=? AND status='NO_LOCAL')
    AND NOT EXISTS(SELECT 1 FROM estacionamento_reservas WHERE comunidade_id=? AND codigo=?)
    AND EXISTS(SELECT 1 FROM estacionamento_configuracoes WHERE comunidade_id=? AND ativo=1)
    AND EXISTS(SELECT 1 FROM eventos_comunidade WHERE id=? AND comunidade_id=? AND status='PUBLICADO' AND (reservas_abrem_em IS NULL OR datetime(reservas_abrem_em)<=datetime('now')))`).bind(access.context.comunidadeId,vagaId,access.user.id,eventId,eventTitle,nome,validEmail?email:"",phone,vehiclePlate,vehicleType,vehicleModel,vehicleColor,documentHash,validDocument?maskDocument(document):linkedCpf?.finais ? `***.***.***-${linkedCpf.finais}` : "Não informado",start.toISOString(),end.toISOString(),code,vagaId,access.context.comunidadeId,access.context.comunidadeId,vagaId,end.toISOString(),start.toISOString(),access.context.comunidadeId,vagaId,access.context.comunidadeId,code,access.context.comunidadeId,eventId,access.context.comunidadeId);
  const [result] = await db.batch([insert,parkingAuditStatement(db,tenantId,requesterId,"ESTACIONAMENTO_RESERVA_CRIADA",{vagaId},"reservaId")]);
  if (!result.meta.changes) return (await recovered()) || Response.json({ error: "Esta vaga acabou de ficar indisponível. Escolha outra vaga." }, { status: 409 });
  const managers = await db.prepare(`SELECT DISTINCT m.responsavel_usuario_id AS id FROM ministerios_comunidade m WHERE m.comunidade_id = ? AND m.status = 'ATIVO' AND m.categoria = 'ESTACIONAMENTO' AND m.responsavel_usuario_id IS NOT NULL`).bind(access.context.comunidadeId).all<{ id: number }>();
  const notificationResults = await Promise.allSettled(managers.results.map((manager) => notifyUser(db,{ userId:Number(manager.id), title:"Nova reserva de estacionamento", message:`${nome} solicitou a vaga${eventTitle ? ` para “${eventTitle}”` : ""} em ${start.toLocaleString("pt-BR")}.`, entityId:Number(result.meta.last_row_id), destination:"/painel?view=estacionamento", createdBy:access.user.email })));
  if (notificationResults.some(item=>item.status==="rejected")) await recordTenantAudit(db,access.context,access.user.id,"ESTACIONAMENTO_NOTIFICACAO_FALHOU","ERRO",{reservaId:Number(result.meta.last_row_id)}).catch(()=>console.warn("Falha ao registrar a notificação de estacionamento na auditoria."));
  return Response.json({ id: Number(result.meta.last_row_id), codigo: code, status: "PENDENTE", notificationWarning: notificationResults.some(item => item.status === "rejected") }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = Number(payload.id);
  const action = String(payload.acao || "").toUpperCase();
  const access = await requireTenantPermission(action === "CANCELAR_PROPRIA" ? "parking.reserve" : action === "CHECKIN" ? "parking.entry" : "parking.edit");
  if ("error" in access) return access.error;
  const code = normalizeReservationCode(payload.codigo);
  const db = getD1();
  const moduleConfig = await db.prepare("SELECT ativo FROM estacionamento_configuracoes WHERE comunidade_id=?").bind(access.context.comunidadeId).first<{ativo:number}>();
  if (!moduleConfig?.ativo) return Response.json({error:"O módulo está desativado nesta comunidade."},{status:423});
  if (action === "CANCELAR_PROPRIA") {
    const own = await db.prepare("SELECT id,status FROM estacionamento_reservas WHERE id=? AND comunidade_id=? AND usuario_id=?")
      .bind(id,access.context.comunidadeId,access.user.id).first<{id:number;status:string}>();
    if (!own) return Response.json({error:"Reserva não encontrada."},{status:404});
    if (own.status === "CANCELADA") return Response.json({ok:true,status:"CANCELADA",alreadyCompleted:true});
    const cancel = db.prepare(`UPDATE estacionamento_reservas SET status='CANCELADA',atualizado_em=CURRENT_TIMESTAMP
      WHERE id=? AND comunidade_id=? AND usuario_id=? AND status IN ('PENDENTE','CONFIRMADA') AND checkin_em IS NULL
      AND NOT EXISTS(SELECT 1 FROM estacionamento_movimentacoes m WHERE m.comunidade_id=estacionamento_reservas.comunidade_id
        AND m.vaga_id=estacionamento_reservas.vaga_id AND m.status='NO_LOCAL' AND m.placa=estacionamento_reservas.placa_veiculo)`)
      .bind(id,access.context.comunidadeId,access.user.id);
    const [result] = await db.batch([cancel,parkingAuditStatement(db,access.context.comunidadeId,access.user.id,"ESTACIONAMENTO_RESERVA_CANCELADA",{reservaId:id})]);
    if (!result.meta.changes) return Response.json({error:"Esta reserva já possui entrada ou não pode mais ser cancelada."},{status:409});
    return Response.json({ok:true,status:"CANCELADA"});
  }
  const reservation = await db.prepare(`SELECT r.id,r.usuario_id,r.nome_completo,r.vaga_id,r.evento_id,r.codigo,r.status,r.documento_mascarado,r.inicio_em,r.fim_em,r.placa_veiculo,r.tipo_veiculo,r.modelo_veiculo,r.cor_veiculo,v.codigo AS vaga_codigo,v.status AS vaga_status FROM estacionamento_reservas r JOIN estacionamento_vagas v ON v.id=r.vaga_id AND v.comunidade_id=r.comunidade_id WHERE r.comunidade_id = ? AND ${id ? "r.id = ?" : "r.codigo = ?"} LIMIT 1`)
    .bind(access.context.comunidadeId, id || code).first<Record<string, unknown>>();
  if (!reservation) return Response.json({ error: "Reserva não encontrada." }, { status: 404 });
  const status = action === "CONFIRMAR" ? "CONFIRMADA" : action === "RECUSAR" ? "RECUSADA" : action === "CHECKIN" ? "CHECKIN" : "";
  if (!status) return Response.json({ error: "Ação inválida." }, { status: 400 });
  const currentStatus = String(reservation.status);
  if (action === "CONFIRMAR" && currentStatus !== "PENDENTE") {
    return Response.json({ error: "Somente reservas pendentes podem ser confirmadas." }, { status: 409 });
  }
  if (action === "RECUSAR" && !["PENDENTE", "CONFIRMADA"].includes(currentStatus)) {
    return Response.json({ error: "Esta reserva não pode mais ser recusada." }, { status: 409 });
  }
  if (action === "CHECKIN") {
    if (Number(payload.eventoId) && Number(payload.eventoId)!==Number(reservation.evento_id)) return Response.json({error:"Esta reserva pertence a outra atividade."},{status:409});
    if (currentStatus !== "CONFIRMADA") {
      return Response.json({ error: currentStatus === "CHECKIN" ? "Este QR Code já foi utilizado." : "A reserva ainda não foi confirmada." }, { status: 409 });
    }
    const startsAt = new Date(String(reservation.inicio_em)).getTime();
    const endsAt = new Date(String(reservation.fim_em)).getTime();
    const now = Date.now();
    if (Number.isFinite(startsAt) && startsAt - (2 * 60 * 60 * 1000) > now) {
      return Response.json({ error: "O acesso estará disponível duas horas antes do início da reserva." }, { status: 409 });
    }
    if (Number.isFinite(endsAt) && endsAt < now) {
      return Response.json({ error: `Esta reserva expirou em ${formatReservationTime(String(reservation.fim_em))}. O check-in era permitido até esse horário.` }, { status: 409 });
    }
    if (String(reservation.vaga_status) !== "LIVRE") {
      return Response.json({ error: "A vaga reservada não está livre neste momento." }, { status: 409 });
    }
  }
  const reservationUpdate = db.prepare(`UPDATE estacionamento_reservas SET status = ?, confirmado_por = ?, checkin_em = CASE WHEN ? = 'CHECKIN' THEN CURRENT_TIMESTAMP ELSE checkin_em END, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ? AND status=?
      AND (?<>'CHECKIN' OR (EXISTS(SELECT 1 FROM estacionamento_vagas v WHERE v.id=estacionamento_reservas.vaga_id AND v.comunidade_id=estacionamento_reservas.comunidade_id AND v.ativo=1 AND v.status='LIVRE')
        AND NOT EXISTS(SELECT 1 FROM estacionamento_movimentacoes m WHERE m.comunidade_id=estacionamento_reservas.comunidade_id AND m.status='NO_LOCAL' AND (m.vaga_id=estacionamento_reservas.vaga_id OR m.placa=estacionamento_reservas.placa_veiculo))))`)
    .bind(status,access.user.id,status,Number(reservation.id),access.context.comunidadeId,currentStatus,status);
  if (status === "CHECKIN") {
    const activeVehicle = await db.prepare(
      `SELECT id FROM estacionamento_movimentacoes
       WHERE comunidade_id = ? AND placa = ? AND status = 'NO_LOCAL' LIMIT 1`,
    ).bind(access.context.comunidadeId, String(reservation.placa_veiculo)).first();
    if (activeVehicle) {
      return Response.json({ error: "Este veículo já possui uma entrada ativa." }, { status: 409 });
    }
    const [updated] = await db.batch([
      reservationUpdate,
      db.prepare(`UPDATE estacionamento_vagas SET status = 'OCUPADA', atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ? AND status = 'LIVRE' AND changes()=1`).bind(Number(reservation.vaga_id),access.context.comunidadeId),
      db.prepare(
        `INSERT INTO estacionamento_movimentacoes
         (comunidade_id, vaga_id, placa, tipo_veiculo, responsavel, vinculo,
          observacoes, criado_por, atualizado_por)
         SELECT ?, ?, ?, ?, ?, 'MEMBRO', ?, ?, ? WHERE changes()=1`,
      ).bind(
        access.context.comunidadeId,
        Number(reservation.vaga_id),
        String(reservation.placa_veiculo),
        String(reservation.tipo_veiculo),
        String(reservation.nome_completo),
        `Entrada liberada por QR da reserva ${Number(reservation.id)}.`,
        access.user.id,
        access.user.id,
      ),
      parkingAuditStatement(db,access.context.comunidadeId,access.user.id,"ESTACIONAMENTO_CHECKIN_QR",{reservaId:Number(reservation.id),vagaId:Number(reservation.vaga_id),finalCodigo:String(reservation.codigo).slice(-4)}),
    ]);
    if (!updated.meta.changes) return Response.json({ error: "A entrada já foi registrada ou a vaga não está livre." }, { status: 409 });

  } else {
    const [updated] = await db.batch([reservationUpdate,parkingAuditStatement(db,access.context.comunidadeId,access.user.id,"ESTACIONAMENTO_RESERVA_ATUALIZADA",{reservaId:Number(reservation.id),status})]);
    if (!updated.meta.changes) return Response.json({ error: "A reserva foi alterada por outro operador. Atualize a lista." }, { status: 409 });
  }
  const notification = await Promise.allSettled([notifyUser(db,{ userId:Number(reservation.usuario_id), title:`Reserva ${status === "CONFIRMADA" ? "confirmada" : status === "RECUSADA" ? "recusada" : "utilizada"}`, message:`${reservation.nome_completo}, a reserva da vaga ${reservation.vaga_codigo} foi atualizada.`, entityId:Number(reservation.id), destination:"/painel?view=estacionamento", createdBy:access.user.email })]);
  if (notification.some(item=>item.status==="rejected")) await recordTenantAudit(db,access.context,access.user.id,"ESTACIONAMENTO_NOTIFICACAO_FALHOU","ERRO",{reservaId:Number(reservation.id)}).catch(()=>console.warn("Falha ao registrar a notificação de estacionamento na auditoria."));
  return Response.json({ ok: true, notificationWarning: notification.some(item => item.status === "rejected"), status, reserva:{ nomeCompleto:reservation.nome_completo, documento:reservation.documento_mascarado, inicioEm:reservation.inicio_em, fimEm:reservation.fim_em, vaga:reservation.vaga_codigo, placaVeiculo:reservation.placa_veiculo, tipoVeiculo:reservation.tipo_veiculo, modeloVeiculo:reservation.modelo_veiculo, corVeiculo:reservation.cor_veiculo } });
}

function formatReservationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "o horário informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export async function DELETE(request: Request) {
  const access = await requireTenantPermission("parking.reserve");
  if ("error" in access) return access.error;
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const reservationId = Number(payload.id) || 0;
  const db = getD1();
  const canManage = ["parking.entry", "parking.exit", "parking.edit", "parking.configure"]
    .some((permission) => access.context.permissions.includes(permission));

  if (reservationId) {
    const reservation = await db.prepare(
      `SELECT id, usuario_id, status, fim_em
       FROM estacionamento_reservas
       WHERE id = ? AND comunidade_id = ? LIMIT 1`,
    ).bind(reservationId, access.context.comunidadeId).first<{
      id: number;
      usuario_id: number;
      status: string;
      fim_em: string;
    }>();
    if (!reservation) {
      return Response.json({ error: "Reserva não encontrada." }, { status: 404 });
    }
    if (!canManage && Number(reservation.usuario_id) !== access.user.id) {
      return Response.json({ error: "Você só pode excluir o seu próprio histórico." }, { status: 403 });
    }
    const expiredConfirmation = reservation.status === "CONFIRMADA" && Date.parse(reservation.fim_em) < Date.now();
    if (!["RECUSADA", "CANCELADA", "CHECKIN"].includes(reservation.status) && !expiredConfirmation) {
      return Response.json({ error: "A reserva ainda está ativa e não pode ser removida do histórico." }, { status: 409 });
    }
    const removed = await db.prepare(
      `DELETE FROM estacionamento_reservas WHERE id = ? AND comunidade_id = ? AND NOT EXISTS(SELECT 1 FROM estacionamento_movimentacoes m WHERE m.comunidade_id=estacionamento_reservas.comunidade_id AND m.vaga_id=estacionamento_reservas.vaga_id AND m.status='NO_LOCAL' AND m.placa=estacionamento_reservas.placa_veiculo)`,
    ).bind(reservationId, access.context.comunidadeId).run();
    if (!removed.meta.changes) return Response.json({error:"Não é possível excluir uma reserva com permanência ativa."},{status:409});
    await recordTenantAudit(db, access.context, access.user.id, "ESTACIONAMENTO_HISTORICO_EXCLUIDO", "SUCESSO", {
      reservaId: reservationId,
      status: reservation.status,
      proprioRegistro: Number(reservation.usuario_id) === access.user.id,
    });
    return Response.json({ ok: true, removidos: 1 });
  }

  if (!canManage) {
    return Response.json({ error: "Somente a gestão pode limpar todo o histórico." }, { status: 403 });
  }
  const result = await db.prepare(
    `DELETE FROM estacionamento_reservas
     WHERE comunidade_id = ? AND (
       status IN ('RECUSADA', 'CANCELADA')
       OR (status = 'CONFIRMADA' AND datetime(fim_em) < datetime('now'))
     )`,
  ).bind(access.context.comunidadeId).run();
  const removed = Number((result.meta as { changes?: number }).changes || 0);
  await recordTenantAudit(db, access.context, access.user.id, "ESTACIONAMENTO_HISTORICO_LIMPO", "SUCESSO", {
    removidos: removed,
  });
  return Response.json({ ok: true, removidos: removed });
}
