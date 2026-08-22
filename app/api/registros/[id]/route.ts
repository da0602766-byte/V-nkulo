import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("MODULOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { dados?: Record<string, unknown> };
  if (!id) return Response.json({ error: "Registro inválido." }, { status: 400 });
  await getD1().prepare("UPDATE ministerio_registros SET dados = ? WHERE id = ?").bind(JSON.stringify(payload.dados ?? {}), id).run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("MODULOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Registro inválido." }, { status: 400 });
  await getD1().prepare("DELETE FROM ministerio_registros WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
