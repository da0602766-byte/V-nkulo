import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";

/**
 * Refinamentos de Agenda
 * - Confirmação de Escalas
 * - Indisponibilidade
 * - Metas & Objetivos
 */

type EscalaResposta = {
  id: number;
  escala_designacao_id: number;
  usuario_id: number;
  resposta: "SIM" | "NAO" | "TALVEZ";
  motivo_recusa: string | null;
  confirmado_em: string;
};

type Indisponibilidade = {
  id: number;
  usuario_id: number;
  titulo: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  todo_dia: boolean;
  hora_inicio: string | null;
  hora_fim: string | null;
  tipo: string;
};

type MetaObjetivo = {
  id: number;
  usuario_id: number;
  titulo: string;
  descricao: string;
  categoria: string;
  prioridade: "BAIXA" | "NORMAL" | "ALTA" | "CRITICA";
  data_inicio: string;
  data_alvo: string;
  progresso_percentual: number;
  status: "EM_PROGRESSO" | "CONCLUIDO" | "PAUSADO" | "CANCELADO";
  metricas_chave: string | null;
  concluido_em: string | null;
};

export async function GET(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;

  const { comunidadeId, userId, permissions } = access.context;
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const canManageSchedules = permissions.includes("schedules.manage");

  const db = getD1();

  // ============================================
  // CONFIRMAÇÃO DE ESCALAS
  // ============================================
  if (tipo === "escala-respostas") {
    if (!permissions.includes("schedules.view")) {
      return Response.json({ error: "Você não pode visualizar escalas." }, { status: 403 });
    }
    const designacaoParam = url.searchParams.get("designacaoId");
    const designacaoId = designacaoParam ? Number(designacaoParam) : null;
    if (designacaoParam && (!Number.isInteger(designacaoId) || Number(designacaoId) <= 0)) {
      return Response.json({ error: "Designação inválida." }, { status: 400 });
    }

    if (designacaoId) {
      const result = await db
        .prepare(
          `SELECT er.id, er.escala_designacao_id, er.usuario_id, er.resposta, er.motivo_recusa, er.confirmado_em
           FROM escala_respostas er
           WHERE er.comunidade_id = ? AND er.escala_designacao_id = ?
             ${canManageSchedules ? "" : "AND er.usuario_id = ?"}`
        )
        .bind(...(canManageSchedules
          ? [comunidadeId, designacaoId]
          : [comunidadeId, designacaoId, userId]))
        .first<EscalaResposta>();

      return Response.json({
        tipo: "escala-respostas",
        dados: result || null,
      });
    }

    // Listar respostas da semana
    const result = await db
      .prepare(
        `SELECT er.id, er.escala_designacao_id, er.usuario_id, er.resposta, er.confirmado_em
         FROM escala_respostas er
         JOIN escala_designacoes ed ON ed.id = er.escala_designacao_id
         WHERE er.comunidade_id = ? AND ed.comunidade_id = er.comunidade_id
           ${canManageSchedules ? "" : "AND er.usuario_id = ?"}
         ORDER BY er.confirmado_em DESC
         LIMIT 100`
      )
      .bind(...(canManageSchedules ? [comunidadeId] : [comunidadeId, userId]))
      .all<Omit<EscalaResposta, "motivo_recusa">>();

    return Response.json({
      tipo: "escala-respostas",
      dados: result.results || [],
    });
  }

  // ============================================
  // INDISPONIBILIDADE
  // ============================================
  if (tipo === "indisponibilidades") {
    const usuarioParam = url.searchParams.get("usuarioId");
    const requestedUserId = usuarioParam ? Number(usuarioParam) : null;
    if (usuarioParam && (!Number.isInteger(requestedUserId) || Number(requestedUserId) <= 0)) {
      return Response.json({ error: "Usuário inválido." }, { status: 400 });
    }
    const requestedMonths = Number(url.searchParams.get("meses") || 3);
    const months = Number.isInteger(requestedMonths)
      ? Math.min(Math.max(requestedMonths, 1), 12)
      : 3;
    const targetUserId = canManageSchedules ? requestedUserId : userId;

    const dataFim = new Date();
    dataFim.setMonth(dataFim.getMonth() + months);

    const result = await db
      .prepare(
        `SELECT id, usuario_id, titulo, descricao, data_inicio, data_fim,
                todo_dia, hora_inicio, hora_fim, tipo
         FROM indisponibilidades
         WHERE comunidade_id = ? ${targetUserId ? "AND usuario_id = ?" : ""}
           AND data_fim >= datetime('now', '-1 day')
           AND data_inicio <= ?
         ORDER BY data_inicio ASC
         LIMIT 200`
      )
      .bind(...(targetUserId
        ? [comunidadeId, targetUserId, dataFim.toISOString()]
        : [comunidadeId, dataFim.toISOString()]))
      .all<Indisponibilidade>();

    return Response.json({
      tipo: "indisponibilidades",
      dados: result.results || [],
    });
  }

  // ============================================
  // METAS & OBJETIVOS
  // ============================================
  if (tipo === "metas") {
    const requestedStatus = String(url.searchParams.get("status") || "EM_PROGRESSO").toUpperCase();
    const status = GOAL_STATUSES.has(requestedStatus) ? requestedStatus : "EM_PROGRESSO";

    const result = await db
      .prepare(
        `SELECT id, usuario_id, titulo, descricao, categoria, prioridade,
                data_inicio, data_alvo, progresso_percentual, status, metricas_chave, concluido_em
         FROM metas_objetivos
         WHERE comunidade_id = ? AND usuario_id = ?
           AND (status = ? OR status = 'CONCLUIDO')
         ORDER BY data_alvo ASC
         LIMIT 100`
      )
      .bind(comunidadeId, userId, status)
      .all<MetaObjetivo>();

    return Response.json({
      tipo: "metas",
      dados: result.results || [],
    });
  }

  return Response.json({
    mensagem: "Use tipo=escala-respostas|indisponibilidades|metas para dados específicos",
  });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;

  const { comunidadeId, userId, permissions } = access.context;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }

  const tipo = String(corpo.tipo || "").toUpperCase();
  const db = getD1();

  // ============================================
  // RESPONDER ESCALA
  // ============================================
  if (tipo === "ESCALA_RESPOSTA") {
    const designacaoId = Number(corpo.designacaoId || 0);
    const resposta = String(corpo.resposta || "TALVEZ").toUpperCase();

    if (!permissions.includes("schedules.respond")) {
      return Response.json({ error: "Você não pode responder escalas." }, { status: 403 });
    }
    if (
      !Number.isInteger(designacaoId) ||
      designacaoId <= 0 ||
      !SCHEDULE_RESPONSES.has(resposta)
    ) {
      return Response.json({ error: "Designação e resposta (SIM/NAO/TALVEZ) obrigatórias." }, { status: 400 });
    }

    const assignment = await db
      .prepare(
        `SELECT id FROM escala_designacoes
         WHERE id = ? AND comunidade_id = ? AND usuario_id = ? AND ativo = 1
         LIMIT 1`,
      )
      .bind(designacaoId, comunidadeId, userId)
      .first<{ id: number }>();
    if (!assignment) {
      return Response.json({ error: "Esta designação não pertence à sua escala ativa." }, { status: 404 });
    }

    const resultado = await db
      .prepare(
        `INSERT INTO escala_respostas
          (comunidade_id, escala_designacao_id, usuario_id, resposta, motivo_recusa)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(escala_designacao_id, usuario_id) DO UPDATE SET
           resposta = excluded.resposta,
           motivo_recusa = excluded.motivo_recusa,
           confirmado_em = CURRENT_TIMESTAMP,
           atualizado_em = CURRENT_TIMESTAMP
         RETURNING id`
      )
      .bind(
        comunidadeId,
        designacaoId,
        userId,
        resposta,
        resposta === "NAO" ? String(corpo.motivo_recusa || "").slice(0, 500) : ""
      )
      .first<{ id: number }>();

    return Response.json({ id: resultado?.id }, { status: 201 });
  }

  // ============================================
  // CRIAR INDISPONIBILIDADE
  // ============================================
  if (tipo === "INDISPONIBILIDADE") {
    const titulo = String(corpo.titulo || "").trim().slice(0, 140);
    const dataInicio = String(corpo.dataInicio || "").trim();
    const dataFim = String(corpo.dataFim || "").trim();

    if (!titulo || !dataInicio || !dataFim) {
      return Response.json({ error: "Título, data início e fim obrigatórios." }, { status: 400 });
    }

    if (Number.isNaN(Date.parse(dataInicio)) || Number.isNaN(Date.parse(dataFim))) {
      return Response.json({ error: "Datas inválidas." }, { status: 400 });
    }
    const startsAt = new Date(dataInicio);
    const endsAt = new Date(dataFim);
    if (endsAt.getTime() < startsAt.getTime()) {
      return Response.json({ error: "A data final deve ser igual ou posterior à inicial." }, { status: 400 });
    }
    const allDay = corpo.todoDia !== false;
    const blockSchedules = corpo.bloqueioEscalas !== false;
    const blockPersonal = corpo.bloqueioPessoal !== false;

    const criado = await db
      .prepare(
        `INSERT INTO indisponibilidades
          (comunidade_id, usuario_id, titulo, descricao, data_inicio, data_fim, todo_dia,
           hora_inicio, hora_fim, tipo, bloqueio_escalas, bloqueio_pessoal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .bind(
        comunidadeId,
        userId,
        titulo,
        String(corpo.descricao || "").trim().slice(0, 1000),
        startsAt.toISOString(),
        endsAt.toISOString(),
        allDay ? 1 : 0,
        corpo.horaInicio ? String(corpo.horaInicio).slice(0, 5) : null,
        corpo.horaFim ? String(corpo.horaFim).slice(0, 5) : null,
        "UNAVAILABLE",
        blockSchedules ? 1 : 0,
        blockPersonal ? 1 : 0
      )
      .first<{ id: number }>();

    return Response.json({ id: criado?.id }, { status: 201 });
  }

  // ============================================
  // CRIAR META/OBJETIVO
  // ============================================
  if (tipo === "META") {
    const titulo = String(corpo.titulo || "").trim().slice(0, 140);
    const dataAlvo = String(corpo.dataAlvo || "").trim();
    const categoria = String(corpo.categoria || "PESSOAL").trim().toUpperCase().slice(0, 60);
    const prioridade = String(corpo.prioridade || "NORMAL").toUpperCase();
    const progresso = Number(corpo.progresso || 0);

    if (!titulo || !dataAlvo) {
      return Response.json({ error: "Título e data alvo obrigatórios." }, { status: 400 });
    }

    if (
      Number.isNaN(Date.parse(dataAlvo)) ||
      !GOAL_PRIORITIES.has(prioridade) ||
      !Number.isFinite(progresso) ||
      progresso < 0 ||
      progresso > 100
    ) {
      return Response.json({ error: "Data, prioridade ou progresso inválidos." }, { status: 400 });
    }

    const criado = await db
      .prepare(
        `INSERT INTO metas_objetivos
          (comunidade_id, usuario_id, titulo, descricao, categoria, prioridade,
           data_inicio, data_alvo, progresso_percentual, status, metricas_chave)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .bind(
        comunidadeId,
        userId,
        titulo,
        String(corpo.descricao || "").trim().slice(0, 1000),
        categoria,
        prioridade,
        new Date().toISOString(),
        new Date(dataAlvo).toISOString(),
        Math.round(progresso),
        "EM_PROGRESSO",
        corpo.metricasChave ? String(corpo.metricasChave).slice(0, 500) : null
      )
      .first<{ id: number }>();

    return Response.json({ id: criado?.id }, { status: 201 });
  }

  return Response.json({ error: "Tipo desconhecido." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;

  const { comunidadeId, userId } = access.context;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }

  const tipo = String(corpo.tipo || "").toUpperCase();
  const id = Number(corpo.id || 0);
  const db = getD1();

  // ============================================
  // ATUALIZAR PROGRESSO DE META
  // ============================================
  if (tipo === "META_PROGRESSO") {
    if (!id) {
      return Response.json({ error: "ID da meta obrigatório." }, { status: 400 });
    }

    const progresso = Number(corpo.progresso ?? 0);
    const status = corpo.status ? String(corpo.status).toUpperCase() : undefined;
    if (
      !Number.isFinite(progresso) ||
      progresso < 0 ||
      progresso > 100 ||
      (status !== undefined && !GOAL_STATUSES.has(status))
    ) {
      return Response.json({ error: "Progresso ou status inválidos." }, { status: 400 });
    }

    const resultado = await db
      .prepare(
        `UPDATE metas_objetivos
         SET progresso_percentual = ?,
             status = COALESCE(?, status),
             ${status === "CONCLUIDO" ? "concluido_em = datetime('now')," : ""}
             atualizado_em = datetime('now')
         WHERE id = ? AND comunidade_id = ? AND usuario_id = ?`
      )
      .bind(Math.round(progresso), status || null, id, comunidadeId, userId)
      .run();

    if (!resultado.meta.changes) {
      return Response.json({ error: "Meta não encontrada." }, { status: 404 });
    }

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Tipo desconhecido." }, { status: 400 });
}

const SCHEDULE_RESPONSES = new Set(["SIM", "NAO", "TALVEZ"]);
const GOAL_PRIORITIES = new Set(["BAIXA", "NORMAL", "ALTA", "CRITICA"]);
const GOAL_STATUSES = new Set(["EM_PROGRESSO", "CONCLUIDO", "PAUSADO", "CANCELADO"]);

export async function DELETE(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;

  const { comunidadeId, userId } = access.context;
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const id = Number(url.searchParams.get("id"));

  if (!tipo || !id) {
    return Response.json({ error: "Tipo e ID obrigatórios." }, { status: 400 });
  }

  const db = getD1();

  if (tipo === "indisponibilidade") {
    const resultado = await db
      .prepare(
        `DELETE FROM indisponibilidades WHERE id = ? AND comunidade_id = ? AND usuario_id = ?`
      )
      .bind(id, comunidadeId, userId)
      .run();

    if (!resultado.meta.changes) {
      return Response.json({ error: "Indisponibilidade não encontrada." }, { status: 404 });
    }

    return Response.json({ ok: true });
  }

  if (tipo === "meta") {
    const resultado = await db
      .prepare(`DELETE FROM metas_objetivos WHERE id = ? AND comunidade_id = ? AND usuario_id = ?`)
      .bind(id, comunidadeId, userId)
      .run();

    if (!resultado.meta.changes) {
      return Response.json({ error: "Meta não encontrada." }, { status: 404 });
    }

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Tipo desconhecido." }, { status: 400 });
}
