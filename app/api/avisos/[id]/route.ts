import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";
import { normalizeNoticeImage } from "../../../lib/notice-image";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("AVISOS_PUBLICAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = (await request.json()) as {
    titulo?: string;
    resumo?: string;
    conteudo?: string;
    tipo?: string;
    prioridade?: string;
    imagem?: string;
  };
  const titulo = String(payload.titulo || "").trim();
  const resumo = String(payload.resumo || "").trim();
  if (!id || !titulo || !resumo)
    return Response.json(
      { error: "Título e resumo são obrigatórios." },
      { status: 400 },
    );
  const image = normalizeNoticeImage(payload.imagem);
  if (image.error)
    return Response.json({ error: image.error }, { status: 400 });
  await getD1()
    .prepare(
      "UPDATE avisos SET titulo = ?, resumo = ?, conteudo = ?, imagem = ?, tipo = ?, prioridade = ? WHERE id = ?",
    )
    .bind(
      titulo,
      resumo,
      String(payload.conteudo || "").trim() || null,
      image.image,
      payload.tipo || "AVISO",
      payload.prioridade || "NORMAL",
      id,
    )
    .run();
  return Response.json({ ok: true });
}
export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("AVISOS_PUBLICAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Aviso inválido." }, { status: 400 });
  await getD1().prepare("DELETE FROM avisos WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
