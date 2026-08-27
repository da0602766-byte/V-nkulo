import { getD1 } from "../../../../db";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

type CellRow = {
  id: number;
  membros: string;
  dias_reuniao: string;
  lider_usuario_id: number | null;
  vice_lider_usuario_id: number | null;
  ativo: number;
  [key: string]: unknown;
};

export async function GET() {
  const access = await requireTenantPermission("cells.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const canManage = access.context.permissions.includes("cells.manage");
  await db.prepare(
    `UPDATE celulas SET ativo = 0, arquivada_em = CURRENT_TIMESTAMP,
       atualizado_em = CURRENT_TIMESTAMP
     WHERE comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1
       AND datetime(COALESCE(ultimo_relatorio_em, criado_em)) <= datetime('now', '-60 days')`,
  ).bind(access.context.comunidadeId).run();
  const result = await db.prepare(
    `SELECT c.id, c.nome, c.responsavel, c.membros, c.observacoes,
      c.dias_reuniao, c.endereco_publico, c.descricao_publica,
      c.lider_usuario_id, c.vice_lider_usuario_id, c.ultimo_relatorio_em,
      c.arquivada_em, c.ativo, c.criado_em,
      lider.nome AS lider_nome, vice.nome AS vice_lider_nome,
      COUNT(v.id) AS visitantes_ativos
     FROM celulas c
     LEFT JOIN usuarios lider ON lider.id = c.lider_usuario_id
     LEFT JOIN usuarios vice ON vice.id = c.vice_lider_usuario_id
     LEFT JOIN visitantes v ON v.celula_id = c.id
       AND v.comunidade_id = c.comunidade_id AND v.ativo = 1
       AND v.escopo_confirmado = 1
     WHERE c.comunidade_id = ? AND c.escopo_confirmado = 1
       AND (c.ativo = 1 OR ? = 1)
     GROUP BY c.id ORDER BY c.ativo DESC, c.nome`,
  ).bind(access.context.comunidadeId, canManage ? 1 : 0).all<CellRow>();
  const [agenda, reports, requests, users] = await Promise.all([
    db.prepare(
      `SELECT id, celula_id, titulo, inicia_em, termina_em, lembrete,
        visibilidade, criado_por_usuario_id FROM celula_agenda
       WHERE comunidade_id = ? AND datetime(termina_em) >= datetime('now', '-7 days')
       ORDER BY inicia_em ASC LIMIT 250`,
    ).bind(access.context.comunidadeId).all(),
    db.prepare(
      `SELECT r.id, r.celula_id, r.data_reuniao, r.aconteceu, r.presentes,
        r.visitantes, r.observacoes, r.criado_em, u.nome AS enviado_por_nome
       FROM celula_relatorios r LEFT JOIN usuarios u ON u.id = r.enviado_por_usuario_id
       WHERE r.comunidade_id = ? ORDER BY r.data_reuniao DESC LIMIT 250`,
    ).bind(access.context.comunidadeId).all(),
    db.prepare(
      `SELECT id, celula_id, nome, contato, mensagem, status, criado_em
       FROM celula_solicitacoes WHERE comunidade_id = ?
       ORDER BY criado_em DESC LIMIT 250`,
    ).bind(access.context.comunidadeId).all(),
    db.prepare(
      `SELECT u.id, u.nome, u.email, u.telefone, u.foto_perfil, uc.papel FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
       ORDER BY u.nome ASC LIMIT 250`,
    ).bind(access.context.comunidadeId).all<{
      id: number;
      nome: string;
      email: string;
      telefone: string | null;
      foto_perfil: string | null;
      papel: string;
    }>(),
  ]);
  const usersById = new Map(users.results.map((user) => [Number(user.id), user]));
  const cells = result.results.map((cell) => {
    const canOperate = canManage || Number(cell.lider_usuario_id) === access.user.id || Number(cell.vice_lider_usuario_id) === access.user.id;
    const members = parseArray(cell.membros);
    return {
      ...cell,
      membros_total: members.filter((member) => String((member as Record<string, unknown>).kind) === "COMMUNITY").length,
      membros: canOperate ? members.map((member) => {
        const source = member as Record<string, unknown>;
        const profile = usersById.get(Number(source.userId));
        return profile ? {
          ...source,
          email: profile.email,
          telefone: profile.telefone,
          fotoPerfil: profile.foto_perfil,
          papelComunidade: profile.papel,
        } : source;
      }) : [],
      dias_reuniao: parseArray(cell.dias_reuniao),
      can_operate: canOperate,
      agenda: agenda.results.filter((item) => Number(item.celula_id) === Number(cell.id) && (canOperate || item.visibilidade === "PUBLICO")),
      relatorios: canOperate ? reports.results.filter((item) => Number(item.celula_id) === Number(cell.id)).slice(0, 12) : [],
      solicitacoes: canOperate ? requests.results.filter((item) => Number(item.celula_id) === Number(cell.id) && item.status === "PENDENTE") : [],
    };
  });
  return Response.json({
    celulas: cells,
    availableUsers: canManage ? users.results.map((user) => ({ id: user.id, nome: user.nome, papel: user.papel })) : [],
    canManage,
  }, { headers: { "Cache-Control": "no-store" } });
}

function parseArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.slice(0, 100) : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("cells.manage");
  if ("error" in access) return access.error;
  const payload = await request.json() as Record<string, unknown>;
  const nome = String(payload.nome || "").trim().slice(0, 100);
  const legacyRequest = !payload.liderUsuarioId && Boolean(String(payload.responsavel || "").trim());
  const liderUsuarioId = Number(payload.liderUsuarioId || (legacyRequest ? access.user.id : 0));
  const observacoes = String(payload.observacoes || "").trim().slice(0, 1000);
  const endereco = String(payload.enderecoPublico || "").trim().slice(0, 240);
  const descricao = String(payload.descricaoPublica || "").trim().slice(0, 700);
  const dias = Array.isArray(payload.diasReuniao)
    ? payload.diasReuniao.map(String).filter((day) => ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"].includes(day))
    : String(payload.diasReuniao || "").split(",").filter(Boolean);
  if (legacyRequest && !dias.length) dias.push("QUA");
  if (!nome || !Number.isInteger(liderUsuarioId) || liderUsuarioId <= 0 || !dias.length) {
    return Response.json({ error: "Informe nome, líder e ao menos um dia de reunião." }, { status: 400 });
  }
  const db = getD1();
  const leader = legacyRequest
    ? await db.prepare(`SELECT id, nome FROM usuarios WHERE id = ? AND ativo = 1`).bind(liderUsuarioId).first<{ id: number; nome: string }>()
    : await db.prepare(
        `SELECT u.id, u.nome FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
         WHERE uc.usuario_id = ? AND uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1`,
      ).bind(liderUsuarioId, access.context.comunidadeId).first<{ id: number; nome: string }>();
  if (!leader) return Response.json({ error: "Selecione um líder ativo desta comunidade." }, { status: 400 });
  const duplicate = await db.prepare(
    `SELECT id FROM celulas WHERE comunidade_id = ? AND nome = ? COLLATE NOCASE AND ativo = 1`,
  ).bind(access.context.comunidadeId, nome).first();
  if (duplicate) return Response.json({ error: "Já existe uma célula ativa com esse nome." }, { status: 409 });
  const responsibleName = legacyRequest ? String(payload.responsavel).trim().slice(0, 120) : leader.nome;
  const members = [{ id: `u-${leader.id}`, kind: "COMMUNITY", userId: leader.id, name: leader.nome, role: "LEADER" }];
  const result = await db.prepare(
    `INSERT INTO celulas
     (comunidade_id, nome, responsavel, membros, observacoes, dias_reuniao,
      endereco_publico, descricao_publica, lider_usuario_id, ativo,
      escopo_confirmado, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
  ).bind(access.context.comunidadeId, nome, responsibleName, JSON.stringify(members), observacoes || null, JSON.stringify([...new Set(dias)]), endereco, descricao, leader.id, access.user.email).run();
  const cellId = Number(result.meta.last_row_id);
  await recordTenantAudit(db, access.context, access.user.id, "CELULA_V45_CRIADA", "SUCESSO", { celulaId: cellId, dias });
  return Response.json({ id: cellId }, { status: 201 });
}
