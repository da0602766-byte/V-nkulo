import { getD1 } from "../../../../../../db";
import { requireApiPermission } from "../../../../../lib/access";

type Context = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  const { id, commentId } = await context.params;
  const db = getD1();
  const comment = await db.prepare("SELECT usuario_id FROM aviso_comentarios WHERE id = ? AND aviso_id = ?")
    .bind(Number(commentId), Number(id)).first<{ usuario_id: number }>();
  if (!comment) return Response.json({ error: "Comentário não encontrado." }, { status: 404 });
  if (access.user!.perfil !== "ADMIN" && comment.usuario_id !== access.user!.id) return Response.json({ error: "Você só pode excluir seus comentários." }, { status: 403 });
  await db.prepare("DELETE FROM aviso_comentarios WHERE id = ?").bind(Number(commentId)).run();
  return Response.json({ ok: true });
}
