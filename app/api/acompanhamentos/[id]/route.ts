import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("ACOMPANHAMENTOS_CRIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { tipo?: string; resultado?: string; descricao?: string; proximoContato?: string };
  const resultado = String(payload.resultado || "").trim();
  if (!id || !resultado) return Response.json({ error: "Resultado obrigatório." }, { status: 400 });
  await getD1().prepare("UPDATE acompanhamentos SET tipo = ?, resultado = ?, descricao = ?, proximo_contato = ? WHERE id = ?").bind(payload.tipo || "WHATSAPP", resultado, String(payload.descricao || "").trim() || null, payload.proximoContato || null, id).run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("ACOMPANHAMENTOS_CRIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Acompanhamento inválido." }, { status: 400 });
  await getD1().prepare("DELETE FROM acompanhamentos WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
