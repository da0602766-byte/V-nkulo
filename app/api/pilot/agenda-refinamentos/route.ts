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

  const { comunidadeId } = access.context;
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");

  const db = getD1();

  // ============================================
  // CONFIRMAÇÃO DE ESCALAS
  // ============================================
  if (tipo === "escala-respostas") {
    const escalaSemana = url.searchParams.get("semana"); // YYYY-WW
    const designacaoId = url.searchParams.get("designacaoId");

    if (designacaoId) {
      const result = await db
        .prepare(
          `SELECT er.id, er.escala_designacao_id, er.usuario_id, er.resposta, er.motivo_recusa, er.confirmado_em
           FROM escala_respostas er
           WHERE er.comunidade_id = ? AND er.escala_designacao_id = ?`
        )
        .bind(comunidadeId, Number(designacaoId))
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
         WHERE er.comunidade_id = ?
         ORDER BY er.confirmado_em DESC
         LIMIT 100`
      )
      .bind(comunidadeId)
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
    const usuarioId = url.searchParams.get("usuarioId");
    const meses = url.searchParams.get("meses") || "3";

    const dataFim = new Date();
    dataFim.setMonth(dataFim.getMonth() + parseInt(meses));

    const result = await db
      .prepare(
        `SELECT id, usuario_id, titulo, descricao, data_inicio, data_fim,
                todo_dia, hora_inicio, hora_fim, tipo
         FROM indisponibilidades
         WHERE comunidade_id = ? ${usuarioId ? "AND usuario_id = ?" : ""}
           AND data_fim >= datetime('now', '-1 day')
         ORDER BY data_inicio ASC
         LIMIT 200`
      )
      .bind(usuarioId ? [comunidadeId, Number(usuarioId)] : [comunidadeId])
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
    const usuarioId = url.searchParams.get("usuarioId");
    const status = url.searchParams.get("status") || "EM_PROGRESSO";

    const result = await db
      .prepare(
        `SELECT id, usuario_id, titulo, descricao, categoria, prioridade,
                data_inicio, data_alvo, progresso_percentual, status, metricas_chave, concluido_em
         FROM metas_objetivos
         WHERE comunidade_id = ? ${usuarioId ? "AND usuario_id = ?" : ""}
           AND (status = ? OR status = 'CONCLUIDO')
         ORDER BY data_alvo ASC
         LIMIT 100`
      )
      .bind(usuarioId ? [comunidadeId, Number(usuarioId), status] : [comunidadeId, status])
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

  const { comunidadeId, userId } = access.context;

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

    if (!designacaoId || !["SIM", "NAO", "TALVEZ"].includes(resposta)) {
      return Response.json({ error: "Designação e resposta (SIM/NAO/TALVEZ) obrigatórias." }, { status: 400 });
    }

    const resultado = await db
      .prepare(
        `INSERT INTO escala_respostas
          (comunidade_id, escala_designacao_id, usuario_id, resposta, motivo_recusa)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(escala_designacao_id, usuario_id) DO UPDATE SET
           resposta = excluded.resposta,
           motivo_recusa = excluded.motivo_recusa,
           confirmado_em = CURRENT_TIMESTAMP
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
        new Date(dataInicio).toISOString(),
        new Date(dataFim).toISOString(),
        corpo.todoDia ? 1 : 0,
        corpo.horaInicio ? String(corpo.horaInicio).slice(0, 5) : null,
        corpo.horaFim ? String(corpo.horaFim).slice(0, 5) : null,
        "UNAVAILABLE",
        corpo.bloqueioEscalas ? 1 : 0,
        corpo.bloqueoPessoal ? 1 : 0
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
    const categoria = String(corpo.categoria || "PESSOAL");

    if (!titulo || !dataAlvo) {
      return Response.json({ error: "Título e data alvo obrigatórios." }, { status: 400 });
    }

    if (Number.isNaN(Date.parse(dataAlvo))) {
      return Response.json({ error: "Data alvo inválida." }, { status: 400 });
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
        String(corpo.prioridade || "NORMAL").toUpperCase(),
        new Date().toISOString(),
        new Date(dataAlvo).toISOString(),
        Number(corpo.progresso || 0),
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

    const progresso = Number(corpo.progresso || 0);
    const status = corpo.status ? String(corpo.status).toUpperCase() : undefined;

    const resultado = await db
      .prepare(
        `UPDATE metas_objetivos
         SET progresso_percentual = ?,
             status = COALESCE(?, status),
             ${status === "CONCLUIDO" ? "concluido_em = datetime('now')," : ""}
             atualizado_em = datetime('now')
         WHERE id = ? AND comunidade_id = ? AND usuario_id = ?`
      )
      .bind(progresso, status || null, id, comunidadeId, userId)
      .run();

    if (!resultado.meta.changes) {
      return Response.json({ error: "Meta não encontrada." }, { status: 404 });
    }

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Tipo desconhecido." }, { status: 400 });
}

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
