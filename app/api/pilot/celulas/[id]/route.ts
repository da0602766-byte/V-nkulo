import { getD1 } from "../../../../../db";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };
type StoredCellMember = { id: string; kind: "COMMUNITY" | "EXTERNAL"; userId?: number; name: string; note?: string; role?: "LEADER" | "VICE_LEADER" | "MEMBER" };

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("cells.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as Record<string, unknown>;
  const db = getD1();
  const existing = await db.prepare(
    `SELECT id, nome, membros, lider_usuario_id, vice_lider_usuario_id, ativo
     FROM celulas WHERE id = ? AND comunidade_id = ? AND escopo_confirmado = 1`,
  ).bind(id, access.context.comunidadeId).first<{ id: number; nome: string; membros: string; lider_usuario_id: number | null; vice_lider_usuario_id: number | null; ativo: number }>();
  if (!existing) return Response.json({ error: "Célula não encontrada." }, { status: 404 });
  const manager = access.context.permissions.includes("cells.manage");
  const operator = manager || existing.lider_usuario_id === access.user.id || existing.vice_lider_usuario_id === access.user.id;
  const action = String(payload.acao || "").trim().toUpperCase();
  if (!operator) return Response.json({ error: "Somente líder, vice-líder ou gestão podem alterar esta célula." }, { status: 403 });

  if (action.startsWith("MEMBRO_")) {
    const members = parseMembers(existing.membros);
    if (action === "MEMBRO_ADICIONAR_INTERNO") {
      const userId = Number(payload.usuarioId);
      const member = await db.prepare(
        `SELECT u.id, u.nome FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
         WHERE uc.usuario_id = ? AND uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1`,
      ).bind(userId, access.context.comunidadeId).first<{ id: number; nome: string }>();
      if (!member) return Response.json({ error: "Selecione um usuário ativo desta comunidade." }, { status: 400 });
      if (!members.some((item) => item.userId === member.id)) members.push({ id: `u-${member.id}`, kind: "COMMUNITY", userId: member.id, name: member.nome, role: "MEMBER" });
    } else if (action === "MEMBRO_ADICIONAR_EXTERNO") {
      const name = String(payload.nomeExterno || "").trim().slice(0, 120);
      if (!name) return Response.json({ error: "Informe o nome da pessoa externa." }, { status: 400 });
      members.push({ id: `x-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: "EXTERNAL", name, note: String(payload.descricaoExterna || "").trim().slice(0, 300), role: "MEMBER" });
    } else if (action === "MEMBRO_REMOVER") {
      const target = members.find((item) => item.id === String(payload.membroId || ""));
      if (target?.userId === existing.lider_usuario_id) return Response.json({ error: "Defina outro líder antes de remover o líder atual." }, { status: 409 });
      const filtered = members.filter((item) => item.id !== String(payload.membroId || ""));
      await db.prepare(
        `UPDATE celulas SET membros = ?, vice_lider_usuario_id = CASE WHEN vice_lider_usuario_id = ? THEN NULL ELSE vice_lider_usuario_id END, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`,
      ).bind(JSON.stringify(filtered), target?.userId || -1, id, access.context.comunidadeId).run();
      return audited(db, access.context, access.user.id, id, "MEMBRO_REMOVIDO");
    } else if (action === "MEMBRO_PROMOVER_VICE") {
      const target = members.find((item) => item.id === String(payload.membroId || "") && item.kind === "COMMUNITY" && item.userId);
      if (!target) return Response.json({ error: "Selecione um membro cadastrado na comunidade." }, { status: 400 });
      members.forEach((item) => { if (item.role === "VICE_LEADER") item.role = "MEMBER"; });
      target.role = "VICE_LEADER";
      await db.prepare(`UPDATE celulas SET membros = ?, vice_lider_usuario_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`)
        .bind(JSON.stringify(members), target.userId, id, access.context.comunidadeId).run();
      return audited(db, access.context, access.user.id, id, "VICE_LIDER_DEFINIDO");
    } else return Response.json({ error: "Ação de integrante inválida." }, { status: 400 });
    await db.prepare(`UPDATE celulas SET membros = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`)
      .bind(JSON.stringify(members), id, access.context.comunidadeId).run();
    return audited(db, access.context, access.user.id, id, "INTEGRANTES_ATUALIZADOS");
  }

  if (action === "AGENDA_CRIAR") {
    const titulo = String(payload.titulo || "").trim().slice(0, 120);
    const iniciaEm = String(payload.iniciaEm || "");
    const terminaEm = String(payload.terminaEm || "");
    const start = Date.parse(iniciaEm); const end = Date.parse(terminaEm);
    if (!titulo || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return Response.json({ error: "Informe título, início e término válidos." }, { status: 400 });
    const memberIds = parseMembers(existing.membros).map((item) => item.userId).filter((value): value is number => Boolean(value));
    const conflicts: Array<{ nome: string; titulo: string }> = [];
    if (memberIds.length) {
      const placeholders = memberIds.map(() => "?").join(",");
      const conflictRows = await db.prepare(
        `SELECT DISTINCT u.nome, e.titulo FROM escala_designacoes d
         JOIN escalas_ministerio e ON e.id = d.escala_id JOIN usuarios u ON u.id = d.usuario_id
         WHERE d.comunidade_id = ? AND d.ativo = 1 AND d.usuario_id IN (${placeholders})
           AND e.status NOT IN ('CANCELADA','ENCERRADA') AND datetime(e.inicia_em) < datetime(?) AND datetime(e.termina_em) > datetime(?)`,
      ).bind(access.context.comunidadeId, ...memberIds, terminaEm, iniciaEm).all<{ nome: string; titulo: string }>();
      conflicts.push(...conflictRows.results);
    }
    if (conflicts.length) return Response.json({ error: "Há integrantes ocupados neste horário.", conflicts }, { status: 409 });
    await db.prepare(
      `INSERT INTO celula_agenda (comunidade_id, celula_id, titulo, inicia_em, termina_em, lembrete, visibilidade, criado_por_usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(access.context.comunidadeId, id, titulo, iniciaEm, terminaEm, String(payload.lembrete || "").trim().slice(0, 500), payload.visibilidade === "PRIVADO" ? "PRIVADO" : "PUBLICO", access.user.id).run();
    return audited(db, access.context, access.user.id, id, "AGENDA_DA_CELULA_CRIADA");
  }

  if (action === "RELATORIO_CRIAR") {
    const date = String(payload.dataReuniao || "").slice(0, 10);
    const happened = payload.aconteceu !== false && payload.aconteceu !== "false";
    const present = Math.max(0, Math.min(999, Number(payload.presentes) || 0));
    const visitors = Math.max(0, Math.min(999, Number(payload.visitantes) || 0));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Informe a data da reunião." }, { status: 400 });
    await db.batch([
      db.prepare(
        `INSERT INTO celula_relatorios (comunidade_id, celula_id, data_reuniao, aconteceu, presentes, visitantes, observacoes, enviado_por_usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(celula_id, data_reuniao) DO UPDATE SET aconteceu=excluded.aconteceu, presentes=excluded.presentes, visitantes=excluded.visitantes, observacoes=excluded.observacoes, enviado_por_usuario_id=excluded.enviado_por_usuario_id`,
      ).bind(access.context.comunidadeId, id, date, happened ? 1 : 0, happened ? present : 0, happened ? visitors : 0, String(payload.observacoes || "").trim().slice(0, 1000), access.user.id),
      db.prepare(`UPDATE celulas SET ultimo_relatorio_em = CURRENT_TIMESTAMP, ativo = 1, arquivada_em = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId),
    ]);
    return audited(db, access.context, access.user.id, id, "RELATORIO_SEMANAL_ENVIADO");
  }

  if (action === "SOLICITACAO_DECIDIR") {
    const requestId = Number(payload.solicitacaoId);
    const status = payload.status === "APROVADA" ? "APROVADA" : "RECUSADA";
    await db.prepare(`UPDATE celula_solicitacoes SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND celula_id = ? AND comunidade_id = ? AND status = 'PENDENTE'`)
      .bind(status, requestId, id, access.context.comunidadeId).run();
    return audited(db, access.context, access.user.id, id, `SOLICITACAO_${status}`);
  }

  if (action === "REATIVAR") {
    if (!manager) return Response.json({ error: "Somente a gestão pastoral pode reativar células." }, { status: 403 });
    await db.prepare(`UPDATE celulas SET ativo = 1, arquivada_em = NULL, ultimo_relatorio_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId).run();
    return audited(db, access.context, access.user.id, id, "CELULA_REATIVADA");
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}

function parseMembers(value: string): StoredCellMember[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string").slice(0, 100) : []; } catch { return []; }
}

async function audited(db: ReturnType<typeof getD1>, tenantContext: Parameters<typeof recordTenantAudit>[1], userId: number, id: number, event: string) {
  await recordTenantAudit(db, tenantContext, userId, event, "SUCESSO", { celulaId: id });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireTenantPermission("cells.manage");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  const db = getD1();
  const existing = await db.prepare(`SELECT id FROM celulas WHERE id = ? AND comunidade_id = ? AND escopo_confirmado = 1`).bind(id, access.context.comunidadeId).first();
  if (!existing) return Response.json({ error: "Célula não encontrada." }, { status: 404 });
  await db.batch([
    db.prepare(`UPDATE visitantes SET celula = NULL, celula_id = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE celula_id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId),
    db.prepare(`UPDATE celulas SET ativo = 0, arquivada_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND comunidade_id = ?`).bind(id, access.context.comunidadeId),
  ]);
  await recordTenantAudit(db, access.context, access.user.id, "CELULA_ARQUIVADA", "SUCESSO", { celulaId: id });
  return Response.json({ ok: true });
}
