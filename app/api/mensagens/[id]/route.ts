import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";
import { normalizeDisplayMessage } from "../../../lib/display-message-input";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("SISTEMA_PERSONALIZAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "Mensagem inválida." }, { status: 400 });
  }
  const db = getD1();
  const existing = await db
    .prepare("SELECT id FROM mensagens_exibicao WHERE id = ?")
    .bind(id)
    .first<{ id: number }>();
  if (!existing) {
    return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
  }
  const normalized = normalizeDisplayMessage(await request.json());
  if (!normalized.value) {
    return Response.json({ error: normalized.error }, { status: 400 });
  }
  const value = normalized.value;
  await db
    .prepare(
      `UPDATE mensagens_exibicao
       SET titulo = ?, mensagem = ?, tipo = ?, areas = ?, animacao = ?,
           intervalo_segundos = ?, inicia_em = ?, termina_em = ?, ativo = ?,
           atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      value.titulo,
      value.mensagem,
      value.tipo,
      value.areas,
      value.animacao,
      value.intervaloSegundos,
      value.iniciaEm,
      value.terminaEm,
      value.ativo,
      id,
    )
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("SISTEMA_PERSONALIZAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "Mensagem inválida." }, { status: 400 });
  }
  const db = getD1();
  const existing = await db
    .prepare("SELECT id FROM mensagens_exibicao WHERE id = ?")
    .bind(id)
    .first<{ id: number }>();
  if (!existing) {
    return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
  }
  await db
    .prepare("DELETE FROM mensagens_exibicao WHERE id = ?")
    .bind(id)
    .run();
  return Response.json({ ok: true });
}
