import { parkingAuditStatement } from "../../../lib/parking-audit";
import { readParkingContext } from "../../../lib/parking-context";
import { readParkingShiftStats } from "../../../lib/parking-shift-stats";
import { getD1 } from "../../../../db";
import { parseParkingEntry } from "../../../lib/parking-validation";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import { getActiveParkingAssignment } from "../../../lib/tenant";

export async function GET(request: Request) {
  const access = await requireTenantPermission("parking.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const config = await db
    .prepare(
      `SELECT c.ativo, c.nome_modulo, c.cor_destaque, c.regras,
        c.atualizado_em, u.nome AS atualizado_por_nome
       FROM estacionamento_configuracoes
       c LEFT JOIN usuarios u ON u.id = c.atualizado_por
       WHERE comunidade_id = ?`,
    )
    .bind(access.context.comunidadeId)
    .first<Record<string, unknown>>();
  if (!config || !Boolean(config.ativo)) {
    return Response.json(
      { error: "O módulo de estacionamento está desativado nesta comunidade." },
      { status: 423 },
    );
  }
  const rules = readRules(config.regras);
  const [movements, occurrences, users, ministryMembers, responsible, assignment, sectors] = await Promise.all([
    db
      .prepare(
        `SELECT m.id, m.vaga_id, m.placa, m.tipo_veiculo, m.responsavel, m.vinculo,
          m.entrada_em, m.saida_em, m.status, m.observacoes,
          actor.nome AS operador_nome,
          v.codigo AS vaga_codigo, s.nome AS setor_nome
         FROM estacionamento_movimentacoes m
         LEFT JOIN estacionamento_vagas v
           ON v.id = m.vaga_id AND v.comunidade_id = m.comunidade_id
         LEFT JOIN estacionamento_setores s
           ON s.id = v.setor_id AND s.comunidade_id = m.comunidade_id
         LEFT JOIN usuarios actor ON actor.id = m.criado_por
         WHERE m.comunidade_id = ? AND (m.status='NO_LOCAL' OR m.id IN (SELECT id FROM estacionamento_movimentacoes WHERE comunidade_id=? AND status='ENCERRADA' ORDER BY entrada_em DESC,id DESC LIMIT 20))
         ORDER BY CASE m.status WHEN 'NO_LOCAL' THEN 0 ELSE 1 END,
           m.entrada_em DESC, m.id DESC`,
      )
      .bind(access.context.comunidadeId,access.context.comunidadeId)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT o.id, o.movimentacao_id, o.tipo, o.descricao, o.gravidade,
          o.status, o.criado_em, u.nome AS criado_por_nome
         FROM estacionamento_ocorrencias o
         LEFT JOIN usuarios u ON u.id = o.criado_por
         WHERE o.comunidade_id = ?
         ORDER BY o.criado_em DESC, o.id DESC LIMIT 20`,
      )
      .bind(access.context.comunidadeId)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT u.id, u.nome, uc.papel
         FROM usuario_comunidades uc
         JOIN usuarios u ON u.id = uc.usuario_id
         WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
         ORDER BY u.nome LIMIT 250`,
      )
      .bind(access.context.comunidadeId)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT u.id, u.nome, mv.papel
         FROM ministerio_voluntarios mv
         JOIN ministerios_comunidade m
           ON m.id = mv.ministerio_id AND m.comunidade_id = mv.comunidade_id
         JOIN usuarios u ON u.id = mv.usuario_id
         WHERE mv.comunidade_id = ? AND mv.ativo = 1 AND m.status = 'ATIVO'
           AND (m.categoria = 'ESTACIONAMENTO' OR lower(m.nome) LIKE '%estacionamento%')
           AND u.ativo = 1
         ORDER BY u.nome LIMIT 250`,
      )
      .bind(access.context.comunidadeId)
      .all<Record<string, unknown>>(),
    rules.responsavelUsuarioId
      ? db
          .prepare(
            `SELECT u.id, u.nome, u.email
             FROM usuarios u
             JOIN usuario_comunidades uc ON uc.usuario_id = u.id
             WHERE u.id = ? AND uc.comunidade_id = ? AND uc.status = 'ATIVO'
             LIMIT 1`,
          )
          .bind(rules.responsavelUsuarioId, access.context.comunidadeId)
          .first<Record<string, unknown>>()
      : Promise.resolve(null),
    getActiveParkingAssignment(access.user.id, access.context.comunidadeId),
    access.context.permissions.includes("parking.configure")
      ? db.prepare(`SELECT id, nome, cor, ordem FROM estacionamento_setores
          WHERE comunidade_id = ? AND ativo = 1 ORDER BY ordem, nome`)
          .bind(access.context.comunidadeId).all<{ id: number; nome: string; cor: string; ordem: number }>()
      : Promise.resolve({ results: [] }),
  ]);
  const parkingContext = await readParkingContext(db, access.context.comunidadeId, access.user.id, new URL(request.url));
  if ("error" in parkingContext) return Response.json({ error: parkingContext.error }, { status: parkingContext.status });
  const shiftStats = assignment ? await readParkingShiftStats(db,access.context.comunidadeId,assignment.inicia_em,assignment.termina_em) : null;
  return Response.json(
    {
      ...parkingContext,
      setores: sectors.results,
      config: {
        ...config,
        ...rules,
        responsavel: responsible,
      },
      movimentacoes: access.context.permissions.some((item) => ["parking.entry","parking.exit","parking.edit"].includes(item)) ? movements.results : [],
      ocorrencias: access.context.permissions.includes("parking.edit") ? occurrences.results : [],
      availableUsers: access.context.permissions.includes("parking.helpers.manage") ||
        access.context.permissions.includes("parking.configure")
        ? users.results
        : [],
      ministryMembers: access.context.permissions.includes("parking.helpers.manage") ||
        access.context.permissions.includes("parking.configure")
        ? ministryMembers.results
        : [],
      operator: {
        shiftStats,
        id: access.user.id,
        nome: access.user.nome,
        email: access.user.email,
        papel: access.context.papel,
        origemAcesso: assignment ? "ESCALA_ATIVA" : "PERFIL_GESTOR",
        escala: assignment,
      },
      permissions: access.context.permissions.filter((item) =>
        item.startsWith("parking."),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function readRules(value: unknown) {
  try {
    const rules = JSON.parse(String(value || "{}"));
    return {
      responsavelUsuarioId: Number(rules.responsavelUsuarioId || 0) || null,
      instrucoes: String(rules.instrucoes || ""),
    };
  } catch {
    return { responsavelUsuarioId: null, instrucoes: "" };
  }
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("parking.entry");
  if ("error" in access) return access.error;
  const parsed = parseParkingEntry(
    (await request.json()) as Record<string, unknown>,
  );
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const db = getD1();
  const config = await db
    .prepare(
      `SELECT ativo FROM estacionamento_configuracoes
       WHERE comunidade_id = ?`,
    )
    .bind(access.context.comunidadeId)
    .first<{ ativo: number }>();
  if (!config?.ativo) {
    return Response.json(
      { error: "O módulo está desativado nesta comunidade." },
      { status: 423 },
    );
  }
  const [space, duplicate] = await Promise.all([
    db
      .prepare(
        `SELECT id, status FROM estacionamento_vagas
         WHERE id = ? AND comunidade_id = ? AND ativo = 1`,
      )
      .bind(parsed.vagaId, access.context.comunidadeId)
      .first<{ id: number; status: string }>(),
    db
      .prepare(
        `SELECT id FROM estacionamento_movimentacoes
         WHERE comunidade_id = ? AND placa = ? AND status = 'NO_LOCAL'
         LIMIT 1`,
      )
      .bind(access.context.comunidadeId, parsed.placa)
      .first<{ id: number }>(),
  ]);
  if (!space) return Response.json({ error: "Vaga não encontrada." }, { status: 404 });
  if (space.status !== "LIVRE") {
    return Response.json({ error: "A vaga selecionada não está livre." }, { status: 409 });
  }
  if (duplicate) {
    return Response.json({ error: "Este veículo já possui uma entrada ativa." }, { status: 409 });
  }
  const insert = db
    .prepare(
      `INSERT INTO estacionamento_movimentacoes
       (comunidade_id, vaga_id, placa, tipo_veiculo, responsavel, vinculo,
        observacoes, criado_por, atualizado_por)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS(SELECT 1 FROM estacionamento_vagas v JOIN estacionamento_setores s ON s.id=v.setor_id AND s.comunidade_id=v.comunidade_id
         WHERE v.id=? AND v.comunidade_id=? AND v.ativo=1 AND s.ativo=1 AND v.status='LIVRE')
       AND NOT EXISTS(SELECT 1 FROM estacionamento_movimentacoes WHERE comunidade_id=? AND status='NO_LOCAL' AND (vaga_id=? OR placa=?))
       AND NOT EXISTS(SELECT 1 FROM estacionamento_reservas WHERE comunidade_id=? AND vaga_id=? AND status IN ('PENDENTE','CONFIRMADA')
         AND datetime(inicio_em)<=datetime('now') AND datetime(fim_em)>datetime('now'))`,
    )
    .bind(
      access.context.comunidadeId,
      parsed.vagaId,
      parsed.placa,
      parsed.tipoVeiculo,
      parsed.responsavel,
      parsed.vinculo,
      parsed.observacoes,
      access.user.id,
      access.user.id,
      parsed.vagaId, access.context.comunidadeId, access.context.comunidadeId, parsed.vagaId, parsed.placa, access.context.comunidadeId, parsed.vagaId,
    );
  const occupy = db
    .prepare(
      `UPDATE estacionamento_vagas
       SET status = 'OCUPADA', atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ? AND status = 'LIVRE' AND changes()=1`,
    )
    .bind(parsed.vagaId, access.context.comunidadeId);
  const [result] = await db.batch([insert, occupy, parkingAuditStatement(db,access.context.comunidadeId,access.user.id,"ESTACIONAMENTO_ENTRADA_REGISTRADA",{vagaId:parsed.vagaId},"movimentacaoId")]);
  if (!result.meta.changes) return Response.json({ error: "A vaga ou o veículo já possui uso ativo ou reserva neste horário." }, { status: 409 });
  const movementId = Number(result.meta.last_row_id);
  return Response.json({ id: movementId }, { status: 201 });
}

export async function DELETE() {
  const access = await requireTenantPermission("parking.edit");
  if ("error" in access) return access.error;
  const db = getD1();
  const result = await db.prepare(
    `DELETE FROM estacionamento_movimentacoes
     WHERE comunidade_id = ? AND status = 'ENCERRADA'`,
  ).bind(access.context.comunidadeId).run();
  const removed = Number((result.meta as { changes?: number }).changes || 0);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ESTACIONAMENTO_MOVIMENTACOES_LIMPAS",
    "SUCESSO",
    { removidos: removed },
  );
  return Response.json({ ok: true, removidos: removed });
}
