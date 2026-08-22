import { getD1 } from "../../../../db";
import { ALL_PERMISSIONS, requireApiPermission } from "../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("USUARIOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = (await request.json()) as { nome?: string; telefone?: string; dataNascimento?: string; endereco?: string; celula?: string; ministerio?: string; observacoes?: string; nomePais?: string; diaconiaEquipeId?: number | string | null; tituloEclesiastico?: string; perfil?: string; permissoes?: string[]; ativo?: boolean };
  const profile = String(payload.perfil ?? "ACOMPANHANTE").toUpperCase();
  const selectedPermissions = (payload.permissoes ?? []).filter((item) => ALL_PERMISSIONS.includes(item as never));
  if (access.user!.id === id && payload.ativo === false) {
    return Response.json({ error: "Você não pode inativar seu próprio acesso." }, { status: 400 });
  }
  if (access.user!.id === id && profile !== "ADMIN") {
    return Response.json({ error: "Para proteger seu acesso total, você não pode remover seu próprio perfil de administrador." }, { status: 400 });
  }
  const db = getD1();
  const existing = await db.prepare("SELECT titulo_eclesiastico FROM usuarios WHERE id = ?").bind(id).first<{ titulo_eclesiastico: string }>();
  const requestedTitle = String(payload.tituloEclesiastico || "").trim().toUpperCase();
  const title = access.user!.perfil === "ADMIN" && /^[A-Z0-9_]{2,40}$/.test(requestedTitle) ? requestedTitle : existing?.titulo_eclesiastico || "MEMBRO";
  const hierarchyPermissions = await configuredHierarchyPermissions(db, title);
  const permissions = profile === "ADMIN"
    ? ALL_PERMISSIONS
    : [...new Set([...(hierarchyPermissions ? ["HIERARQUIA_CONFIGURADA", ...hierarchyPermissions] : []), ...selectedPermissions])];
  const name = String(payload.nome || "").trim();
  if (!name) return Response.json({ error: "Informe o nome do usuário." }, { status: 400 });
  const teamId = await validTeamId(db, payload.diaconiaEquipeId);
  if (teamId === undefined) return Response.json({ error: "Selecione uma equipe de diaconia válida." }, { status: 400 });
  await db.prepare(
    "UPDATE usuarios SET nome = ?, telefone = ?, data_nascimento = ?, endereco = ?, celula = ?, ministerio = ?, observacoes = ?, nome_pais = ?, diaconia_equipe_id = ?, titulo_eclesiastico = ?, perfil = ?, permissoes = ?, ativo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(name, optional(payload.telefone), optional(payload.dataNascimento), optional(payload.endereco), optional(payload.celula), optional(payload.ministerio), optional(payload.observacoes), optional(payload.nomePais), teamId, title, profile, permissions.join(","), payload.ativo === false ? 0 : 1, id).run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("USUARIOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Usuário inválido." }, { status: 400 });
  if (access.user!.id === id) return Response.json({ error: "Você não pode excluir sua própria conta administrativa." }, { status: 400 });
  const db = getD1();
  await db.prepare("UPDATE avisos SET aniversario_usuario_id = NULL WHERE aniversario_usuario_id = ?").bind(id).run();
  await db.prepare("DELETE FROM usuarios WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}

function optional(value?: string) { return String(value || "").trim() || null; }
async function validTeamId(db: D1Database, value?: number | string | null) {
  const id = Number(value || 0);
  if (!id) return null;
  const team = await db.prepare("SELECT id FROM diaconia_equipes WHERE id = ? AND ativo = 1").bind(id).first<{ id: number }>();
  if (!team) return undefined;
  return id;
}
async function configuredHierarchyPermissions(db: D1Database, title: string) {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = 'hierarquias'").first<{ valor: string }>();
  if (!row?.valor) return null;
  try {
    const items = JSON.parse(row.valor) as { id: string; permissoes?: string[] }[];
    return items.find((item) => item.id === title)?.permissoes?.filter((key) => ALL_PERMISSIONS.includes(key as never)) ?? null;
  } catch {
    return null;
  }
}
