import { getD1 } from "../../../../../db";
import { requireApiPermission } from "../../../../lib/access";
import { ALLOWED_NOTICE_EMOJIS } from "../../../../lib/notice-interactions";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  const noticeId = Number((await context.params).id);
  const payload = await request.json() as { tipo?: string; emoji?: string; texto?: string };
  if (!noticeId) return Response.json({ error: "Notícia inválida." }, { status: 400 });
  const db = getD1();
  const notice = await db.prepare("SELECT id FROM avisos WHERE id = ? AND publicado = 1").bind(noticeId).first<{ id: number }>();
  if (!notice) return Response.json({ error: "Notícia não encontrada." }, { status: 404 });

  if (payload.tipo === "reacao") {
    const emoji = String(payload.emoji || "");
    if (!ALLOWED_NOTICE_EMOJIS.has(emoji)) return Response.json({ error: "Reação inválida." }, { status: 400 });
    const existing = await db.prepare("SELECT id FROM aviso_reacoes WHERE aviso_id = ? AND usuario_id = ? AND emoji = ?")
      .bind(noticeId, access.user!.id, emoji).first<{ id: number }>();
    if (existing) await db.prepare("DELETE FROM aviso_reacoes WHERE id = ?").bind(existing.id).run();
    else await db.prepare("INSERT INTO aviso_reacoes (aviso_id, usuario_id, emoji) VALUES (?, ?, ?)").bind(noticeId, access.user!.id, emoji).run();
    return Response.json({ ativo: !existing });
  }

  if (payload.tipo === "comentario") {
    const text = String(payload.texto || "").trim().slice(0, 500);
    if (!text) return Response.json({ error: "Digite um comentário." }, { status: 400 });
    const result = await db.prepare("INSERT INTO aviso_comentarios (aviso_id, usuario_id, texto) VALUES (?, ?, ?)")
      .bind(noticeId, access.user!.id, text).run();
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  }
  return Response.json({ error: "Interação inválida." }, { status: 400 });
}
