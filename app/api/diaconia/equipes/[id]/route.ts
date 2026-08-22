import { getD1 } from "../../../../../db";
import { requireApiPermission } from "../../../../lib/access";
import { createSystemNotification } from "../../../../lib/system-notifications";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("DIACONIA_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { nome?: string; cor?: string; responsavelUsuarioId?: number | string; usuarioIds?: (number | string)[] };
  const nome = String(payload.nome || "").trim();
  const cor = /^#[0-9a-f]{6}$/i.test(String(payload.cor || "")) ? String(payload.cor) : "#17877f";
  const db = getD1();
  const previousMembers = (
    await db.prepare("SELECT id, nome FROM usuarios WHERE diaconia_equipe_id = ?").bind(id).all<{ id: number; nome: string }>()
  ).results;
  const selected = [...new Set([...(payload.usuarioIds || []).map(Number), Number(payload.responsavelUsuarioId || 0)].filter(Boolean))];
  const members = selected.length ? (await db.prepare(`SELECT id, nome FROM usuarios WHERE ativo = 1 AND id IN (${selected.map(() => "?").join(",")}) ORDER BY nome`).bind(...selected).all<{ id: number; nome: string }>()).results : [];
  const responsible = members.find((item) => item.id === Number(payload.responsavelUsuarioId));
  if (!id || !nome || !responsible) return Response.json({ error: "Nome e responsável cadastrado são obrigatórios." }, { status: 400 });
  try {
    await db.prepare(
      "UPDATE diaconia_equipes SET nome = ?, cor = ?, responsavel = ?, integrantes = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(nome, cor, responsible.nome, JSON.stringify(members.map((item) => ({ id: item.id, nome: item.nome, funcao: item.id === responsible.id ? "Responsável" : "Integrante" }))), id).run();
    await db.prepare("UPDATE usuarios SET diaconia_equipe_id = NULL WHERE diaconia_equipe_id = ?").bind(id).run();
    if (members.length) await db.prepare(`UPDATE usuarios SET diaconia_equipe_id = ? WHERE id IN (${members.map(() => "?").join(",")})`).bind(id, ...members.map((item) => item.id)).run();
    const previousIds = new Set(previousMembers.map((member) => member.id));
    const selectedIds = new Set(members.map((member) => member.id));
    await Promise.all([
      ...members.filter((member) => !previousIds.has(member.id)).map((member) =>
        createSystemNotification(db, {
          tipo: "IMPORTANTE",
          titulo: "Você foi incluído em uma diaconia",
          mensagem: `Você agora faz parte da equipe ${nome}. Consulte a área de Diaconia para acompanhar suas escalas.`,
          area: "DIACONIA",
          entidadeId: id,
          usuarioId: member.id,
          criadoPor: access.user!.email,
        }),
      ),
      ...previousMembers.filter((member) => !selectedIds.has(member.id)).map((member) =>
        createSystemNotification(db, {
          tipo: "INFO",
          titulo: "Alteração na equipe de diaconia",
          mensagem: `Você não faz mais parte da equipe ${nome}.`,
          area: "DIACONIA",
          entidadeId: id,
          usuarioId: member.id,
          criadoPor: access.user!.email,
        }),
      ),
    ]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Já existe uma equipe com este nome." }, { status: 409 });
  }
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("DIACONIA_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Equipe inválida." }, { status: 400 });
  const db = getD1();
  await db.prepare("UPDATE usuarios SET diaconia_equipe_id = NULL WHERE diaconia_equipe_id = ?").bind(id).run();
  await db.prepare("UPDATE diaconias SET equipe_id = NULL WHERE equipe_id = ?").bind(id).run();
  await db.prepare("DELETE FROM diaconia_equipes WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
