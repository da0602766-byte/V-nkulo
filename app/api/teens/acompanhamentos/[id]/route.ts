import { getD1 } from "../../../../../db";
import { requireApiPermission } from "../../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("TEENS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { resultado?: string; descricao?: string; proximoContato?: string };
  const result = String(payload.resultado || "").trim();
  if (!id || !result) return Response.json({ error: "Resultado obrigatório." }, { status: 400 });
  await getD1().prepare("UPDATE teens_acompanhamentos SET resultado = ?, descricao = ?, proximo_contato = ? WHERE id = ?")
    .bind(result, optional(payload.descricao), optional(payload.proximoContato), id).run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("TEENS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  await getD1().prepare("DELETE FROM teens_acompanhamentos WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}

function optional(value?: string) { return String(value || "").trim() || null; }
