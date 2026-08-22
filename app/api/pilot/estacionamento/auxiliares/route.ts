import { getD1 } from "../../../../../db";
import { createSystemNotification } from "../../../../lib/system-notifications";
import { parseParkingHelper } from "../../../../lib/parking-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import {
  getActiveParkingAssignment,
  requireTenantPermission,
} from "../../../../lib/tenant";

export async function POST(request: Request) {
  const access = await requireTenantPermission("parking.helpers.manage");
  if ("error" in access) return access.error;
  const parsed = parseParkingHelper(
    (await request.json()) as Record<string, unknown>,
  );
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  if (parsed.usuarioId === access.user.id) {
    return Response.json(
      { error: "Você já é o responsável desta escala." },
      { status: 409 },
    );
  }
  const db = getD1();
  const [assignment, target, schedule] = await Promise.all([
    getActiveParkingAssignment(access.user.id, access.context.comunidadeId),
    db
      .prepare(
        `SELECT u.id, u.nome
         FROM usuarios u
         JOIN usuario_comunidades uc ON uc.usuario_id = u.id
         WHERE u.id = ? AND uc.comunidade_id = ?
           AND uc.status = 'ATIVO' AND u.ativo = 1
         LIMIT 1`,
      )
      .bind(parsed.usuarioId, access.context.comunidadeId)
      .first<{ id: number; nome: string }>(),
    db
      .prepare(
        `SELECT s.id, s.ministerio_id, s.titulo, s.inicia_em, s.termina_em
         FROM escalas_ministerio s
         JOIN ministerios_comunidade m
           ON m.id = s.ministerio_id AND m.comunidade_id = s.comunidade_id
         WHERE s.id = ? AND s.comunidade_id = ? AND s.status = 'PUBLICADA'
           AND m.status = 'ATIVO'
           AND (m.categoria = 'ESTACIONAMENTO'
             OR lower(m.nome) LIKE '%estacionamento%')
         LIMIT 1`,
      )
      .bind(parsed.escalaId, access.context.comunidadeId)
      .first<{
        id: number;
        ministerio_id: number;
        titulo: string;
        inicia_em: string;
        termina_em: string;
      }>(),
  ]);
  const managerByRole = access.context.permissions.includes("parking.configure");
  if (!schedule || (!managerByRole && assignment?.escala_id !== schedule.id)) {
    return Response.json(
      { error: "A escala de estacionamento não está disponível para você." },
      { status: 403 },
    );
  }
  if (!target) {
    return Response.json(
      { error: "A pessoa precisa estar ativa nesta comunidade." },
      { status: 404 },
    );
  }

  await db
    .prepare(
      `INSERT INTO ministerio_voluntarios
       (comunidade_id, ministerio_id, usuario_id, funcao, papel,
        dias_disponiveis, periodo_preferido, ativo)
       VALUES (?, ?, ?, 'Auxiliar de estacionamento', 'VOLUNTARIO',
        '[]', 'FLEXIVEL', 1)
       ON CONFLICT(ministerio_id, usuario_id) DO UPDATE SET
         funcao = excluded.funcao, ativo = 1, atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      access.context.comunidadeId,
      schedule.ministerio_id,
      parsed.usuarioId,
    )
    .run();
  const volunteer = await db
    .prepare(
      `SELECT id FROM ministerio_voluntarios
       WHERE ministerio_id = ? AND usuario_id = ? AND comunidade_id = ?`,
    )
    .bind(
      schedule.ministerio_id,
      parsed.usuarioId,
      access.context.comunidadeId,
    )
    .first<{ id: number }>();
  if (!volunteer) {
    return Response.json({ error: "Não foi possível criar o apoio." }, { status: 500 });
  }
  try {
    await db
      .prepare(
        `INSERT INTO escala_designacoes
         (comunidade_id, escala_id, voluntario_id, usuario_id, funcao, status, ativo)
         VALUES (?, ?, ?, ?, 'Auxiliar de estacionamento', 'PENDENTE', 1)`,
      )
      .bind(
        access.context.comunidadeId,
        schedule.id,
        volunteer.id,
        parsed.usuarioId,
      )
      .run();
  } catch (error) {
    if (!String(error).includes("UNIQUE")) throw error;
    await db
      .prepare(
        `UPDATE escala_designacoes
         SET ativo = 1, status = 'PENDENTE', atualizado_em = CURRENT_TIMESTAMP
         WHERE escala_id = ? AND voluntario_id = ? AND comunidade_id = ?`,
      )
      .bind(schedule.id, volunteer.id, access.context.comunidadeId)
      .run();
  }
  await createSystemNotification(db, {
    tipo: "IMPORTANTE",
    titulo: "Convite para apoiar o estacionamento",
    mensagem: `${access.user.nome} convidou você para a escala “${schedule.titulo}”. Confirme em Escalas antes do plantão.`,
    area: "DIACONIA",
    entidadeId: schedule.id,
    usuarioId: parsed.usuarioId,
    criadoPor: access.user.nome,
  });
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ESTACIONAMENTO_AUXILIAR_CONVIDADO",
    "SUCESSO",
    {
      escalaId: schedule.id,
      usuarioId: parsed.usuarioId,
    },
  );
  return Response.json({ ok: true }, { status: 201 });
}
