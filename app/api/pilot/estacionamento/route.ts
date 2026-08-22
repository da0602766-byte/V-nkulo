import { getD1 } from "../../../../db";
import { parseParkingEntry } from "../../../lib/parking-validation";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import { getActiveParkingAssignment } from "../../../lib/tenant";

export async function GET() {
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
  const [stats, spaces, movements, occurrences, users, responsible, assignment] = await Promise.all([
    db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'OCUPADA' THEN 1 ELSE 0 END) AS ocupadas,
          SUM(CASE WHEN status = 'LIVRE' THEN 1 ELSE 0 END) AS livres,
          SUM(CASE WHEN tipo IN ('RESERVADA','IDOSO','PCD') THEN 1 ELSE 0 END) AS especiais
         FROM estacionamento_vagas
         WHERE comunidade_id = ? AND ativo = 1`,
      )
      .bind(access.context.comunidadeId)
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT v.id, v.codigo, v.tipo, v.status, s.id AS setor_id,
          s.nome AS setor_nome, s.cor AS setor_cor, s.ordem
         FROM estacionamento_vagas v
         JOIN estacionamento_setores s
           ON s.id = v.setor_id AND s.comunidade_id = v.comunidade_id
         WHERE v.comunidade_id = ? AND v.ativo = 1 AND s.ativo = 1
         ORDER BY s.ordem, s.nome, v.codigo`,
      )
      .bind(access.context.comunidadeId)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT m.id, m.placa, m.tipo_veiculo, m.responsavel, m.vinculo,
          m.entrada_em, m.saida_em, m.status, m.observacoes,
          actor.nome AS operador_nome,
          v.codigo AS vaga_codigo, s.nome AS setor_nome
         FROM estacionamento_movimentacoes m
         LEFT JOIN estacionamento_vagas v
           ON v.id = m.vaga_id AND v.comunidade_id = m.comunidade_id
         LEFT JOIN estacionamento_setores s
           ON s.id = v.setor_id AND s.comunidade_id = m.comunidade_id
         LEFT JOIN usuarios actor ON actor.id = m.criado_por
         WHERE m.comunidade_id = ?
         ORDER BY CASE m.status WHEN 'NO_LOCAL' THEN 0 ELSE 1 END,
           m.entrada_em DESC, m.id DESC
         LIMIT 80`,
      )
      .bind(access.context.comunidadeId)
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
  ]);
  return Response.json(
    {
      config: {
        ...config,
        ...rules,
        responsavel: responsible,
      },
      stats: {
        total: Number(stats?.total || 0),
        ocupadas: Number(stats?.ocupadas || 0),
        livres: Number(stats?.livres || 0),
        especiais: Number(stats?.especiais || 0),
      },
      vagas: spaces.results,
      movimentacoes: movements.results,
      ocorrencias: occurrences.results,
      availableUsers: access.context.permissions.includes("parking.helpers.manage") ||
        access.context.permissions.includes("parking.configure")
        ? users.results
        : [],
      operator: {
        id: access.user.id,
        nome: access.user.nome,
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
  const occupy = db
    .prepare(
      `UPDATE estacionamento_vagas
       SET status = 'OCUPADA', atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ? AND status = 'LIVRE'`,
    )
    .bind(parsed.vagaId, access.context.comunidadeId);
  const [result] = await db.batch([insert, occupy]);
  const movementId = Number(result.meta.last_row_id);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "ESTACIONAMENTO_ENTRADA_REGISTRADA",
    "SUCESSO",
    { movimentacaoId: movementId, vagaId: parsed.vagaId },
  );
  return Response.json({ id: movementId }, { status: 201 });
}
