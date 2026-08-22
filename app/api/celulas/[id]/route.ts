import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("CELULAS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const body = await request.json() as { nome?: string; responsavel?: string; membros?: string[]; observacoes?: string };
  if (!id || !body.nome?.trim() || !body.responsavel?.trim()) return Response.json({ error: "Dados da célula inválidos." }, { status: 400 });
  const db = getD1();
  await db.prepare("UPDATE celulas SET nome = ?, responsavel = ?, membros = ?, observacoes = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(body.nome.trim(), body.responsavel.trim(), JSON.stringify(body.membros ?? []), body.observacoes || null, id).run();
  await db.prepare("UPDATE visitantes SET celula = ? WHERE celula_id = ?").bind(body.nome.trim(), id).run();
  return Response.json({ ok: true });
}
export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("CELULAS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Célula inválida." }, { status: 400 });
  const db = getD1();
  await db.prepare("UPDATE visitantes SET celula = NULL, celula_id = NULL WHERE celula_id = ?").bind(id).run();
  await db.prepare("DELETE FROM celulas WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
