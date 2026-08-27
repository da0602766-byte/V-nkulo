import { getD1 } from "../../../../../db";
import { maskDocument, normalizeBrazilianPhone, onlyDigits, validateCpfCnpj } from "../../../../lib/brazilian-validation";
import { notifyUser } from "../../../../lib/pilot-notifications";
import { requireTenantPermission } from "../../../../lib/tenant";
import { recordTenantAudit } from "../../../../lib/tenant-audit";

function normalizeReservationCode(value: unknown) {
  const match = String(value || "").trim().toUpperCase().match(/VK-[A-F0-9]{8,32}/);
  return match?.[0] || "";
}

export async function GET() {
  const access = await requireTenantPermission("parking.reserve");
  if ("error" in access) return access.error;
  const canManage = ["parking.entry", "parking.exit", "parking.edit", "parking.configure"]
    .some((permission) => access.context.permissions.includes(permission));
  const db = getD1();
  const rows = await db.prepare(`SELECT r.id, r.usuario_id, r.vaga_id, r.evento_id, r.evento_titulo, r.nome_completo, r.email, r.telefone,
    r.placa_veiculo, r.tipo_veiculo, r.modelo_veiculo, r.cor_veiculo,
    r.documento_mascarado, r.inicio_em, r.fim_em, r.codigo, r.status, r.checkin_em,
    v.codigo AS vaga_codigo, s.nome AS setor_nome
    FROM estacionamento_reservas r
    JOIN estacionamento_vagas v ON v.id = r.vaga_id AND v.comunidade_id = r.comunidade_id
    JOIN estacionamento_setores s ON s.id = v.setor_id AND s.comunidade_id = r.comunidade_id
    WHERE r.comunidade_id = ? AND (? = 1 OR r.usuario_id = ?)
    ORDER BY CASE r.status WHEN 'PENDENTE' THEN 0 WHEN 'CONFIRMADA' THEN 1 ELSE 2 END, r.inicio_em DESC LIMIT 80`)
    .bind(access.context.comunidadeId, canManage ? 1 : 0, access.user.id).all<Record<string, unknown>>();
  const reservations = rows.results.map((row) => {
    const { usuario_id: ownerId, ...reservation } = row;
    return {
      ...reservation,
      codigo: Number(ownerId) === access.user.id ? row.codigo : "",
    };
  });
  return Response.json({ reservas: reservations, canManage }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("parking.reserve");
  if ("error" in access) return access.error;
  const payload = await request.json() as Record<string, unknown>;
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
  const start = new Date(String(payload.inicioEm || ""));
  const end = new Date(String(payload.fimEm || ""));
  const validEmail = /^\S+@\S+\.\S+$/.test(email);
  const validDocument = validateCpfCnpj(document);
  if (!vagaId || nome.length < 5 || (!validEmail && !validDocument) || !phone || vehiclePlate.length < 6 || !["CARRO", "MOTO", "VAN", "OUTRO"].includes(vehicleType) || vehicleModel.length < 2 || !vehicleColor || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return Response.json({ error: "Revise os dados do usuário, veículo, contato e período da reserva." }, { status: 400 });
  }
  const db = getD1();
  let eventTitle = "";
  if (eventId) {
    const linkedEvent = await db.prepare(
      `SELECT id, titulo FROM eventos_comunidade
       WHERE id = ? AND comunidade_id = ? AND status = 'PUBLICADO' LIMIT 1`,
    ).bind(eventId, access.context.comunidadeId).first<{ id: number; titulo: string }>();
    if (!linkedEvent) {
      return Response.json({ error: "O evento ou culto escolhido não está mais disponível." }, { status: 409 });
    }
    eventTitle = linkedEvent.titulo;
  }
  const space = await db.prepare(`SELECT id FROM estacionamento_vagas WHERE id = ? AND comunidade_id = ? AND ativo = 1 AND status = 'LIVRE'`).bind(vagaId, access.context.comunidadeId).first<{ id: number }>();
  if (!space) return Response.json({ error: "A vaga não está disponível." }, { status: 409 });
  const conflict = await db.prepare(`SELECT id FROM estacionamento_reservas WHERE comunidade_id = ? AND vaga_id = ? AND status IN ('PENDENTE','CONFIRMADA','CHECKIN') AND datetime(inicio_em) < datetime(?) AND datetime(fim_em) > datetime(?) LIMIT 1`)
    .bind(access.context.comunidadeId, vagaId, end.toISOString(), start.toISOString()).first();
  if (conflict) return Response.json({ error: "Essa vaga já possui reserva no período informado." }, { status: 409 });
  const identityKey = validDocument ? document : email;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${access.context.comunidadeId}:${identityKey}`));
  const documentHash = [...new Uint8Array(hashBuffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const code = `VK-${crypto.randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
  const result = await db.prepare(`INSERT INTO estacionamento_reservas
    (comunidade_id,vaga_id,usuario_id,evento_id,evento_titulo,nome_completo,email,telefone,placa_veiculo,tipo_veiculo,modelo_veiculo,cor_veiculo,documento_hash,documento_mascarado,inicio_em,fim_em,codigo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(access.context.comunidadeId,vagaId,access.user.id,eventId,eventTitle,nome,validEmail?email:"",phone,vehiclePlate,vehicleType,vehicleModel,vehicleColor,documentHash,validDocument?maskDocument(document):"Não informado",start.toISOString(),end.toISOString(),code).run();
  const managers = await db.prepare(`SELECT DISTINCT m.responsavel_usuario_id AS id FROM ministerios_comunidade m WHERE m.comunidade_id = ? AND m.status = 'ATIVO' AND m.categoria = 'ESTACIONAMENTO' AND m.responsavel_usuario_id IS NOT NULL`).bind(access.context.comunidadeId).all<{ id: number }>();
  await Promise.all(managers.results.map((manager) => notifyUser(db,{ userId:Number(manager.id), title:"Nova reserva de estacionamento", message:`${nome} solicitou a vaga${eventTitle ? ` para “${eventTitle}”` : ""} em ${start.toLocaleString("pt-BR")}.`, entityId:Number(result.meta.last_row_id), destination:"/painel?view=estacionamento", createdBy:access.user.email })));
  return Response.json({ id: Number(result.meta.last_row_id), codigo: code, status: "PENDENTE" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  const id = Number(payload.id);
  const action = String(payload.acao || "").toUpperCase();
  const access = await requireTenantPermission(action === "CHECKIN" ? "parking.entry" : "parking.edit");
  if ("error" in access) return access.error;
  const code = normalizeReservationCode(payload.codigo);
  const db = getD1();
  const reservation = await db.prepare(`SELECT r.id,r.usuario_id,r.nome_completo,r.vaga_id,r.codigo,r.status,r.documento_mascarado,r.inicio_em,r.fim_em,r.placa_veiculo,r.tipo_veiculo,r.modelo_veiculo,r.cor_veiculo,v.codigo AS vaga_codigo,v.status AS vaga_status FROM estacionamento_reservas r JOIN estacionamento_vagas v ON v.id=r.vaga_id AND v.comunidade_id=r.comunidade_id WHERE r.comunidade_id = ? AND ${id ? "r.id = ?" : "r.codigo = ?"} LIMIT 1`)
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
  const reservationUpdate = db.prepare(`UPDATE estacionamento_reservas SET status = ?, confirmado_por = ?, checkin_em = CASE WHEN ? = 'CHECKIN' THEN CURRENT_TIMESTAMP ELSE checkin_em END, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`)
    .bind(status,access.user.id,status,Number(reservation.id),access.context.comunidadeId);
  if (status === "CHECKIN") {
    const activeVehicle = await db.prepare(
      `SELECT id FROM estacionamento_movimentacoes
       WHERE comunidade_id = ? AND placa = ? AND status = 'NO_LOCAL' LIMIT 1`,
    ).bind(access.context.comunidadeId, String(reservation.placa_veiculo)).first();
    if (activeVehicle) {
      return Response.json({ error: "Este veículo já possui uma entrada ativa." }, { status: 409 });
    }
    await db.batch([
      reservationUpdate,
      db.prepare(`UPDATE estacionamento_vagas SET status = 'OCUPADA', atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ? AND status = 'LIVRE'`).bind(Number(reservation.vaga_id),access.context.comunidadeId),
      db.prepare(
        `INSERT INTO estacionamento_movimentacoes
         (comunidade_id, vaga_id, placa, tipo_veiculo, responsavel, vinculo,
          observacoes, criado_por, atualizado_por)
         VALUES (?, ?, ?, ?, ?, 'MEMBRO', ?, ?, ?)`,
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
    ]);
    await recordTenantAudit(db, access.context, access.user.id, "ESTACIONAMENTO_CHECKIN_QR", "SUCESSO", {
      reservaId: Number(reservation.id),
      vagaId: Number(reservation.vaga_id),
      finalCodigo: String(reservation.codigo).slice(-4),
    });
  } else {
    await reservationUpdate.run();
  }
  await notifyUser(db,{ userId:Number(reservation.usuario_id), title:`Reserva ${status === "CONFIRMADA" ? "confirmada" : status === "RECUSADA" ? "recusada" : "utilizada"}`, message:`${reservation.nome_completo}, a reserva da vaga ${reservation.vaga_codigo} foi atualizada.`, entityId:Number(reservation.id), destination:"/painel?view=estacionamento", createdBy:access.user.email });
  return Response.json({ ok: true, status, reserva:{ nomeCompleto:reservation.nome_completo, documento:reservation.documento_mascarado, inicioEm:reservation.inicio_em, fimEm:reservation.fim_em, vaga:reservation.vaga_codigo, placaVeiculo:reservation.placa_veiculo, tipoVeiculo:reservation.tipo_veiculo, modeloVeiculo:reservation.modelo_veiculo, corVeiculo:reservation.cor_veiculo } });
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

export async function DELETE() {
  const access = await requireTenantPermission("parking.edit");
  if ("error" in access) return access.error;
  const db = getD1();
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
