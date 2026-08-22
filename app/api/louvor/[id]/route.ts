import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("LOUVOR_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { titulo?: string; dataCulto?: string; horario?: string; local?: string; observacoes?: string; musicas?: unknown[]; integrantes?: unknown[]; links?: unknown[] };
  if (!id || !String(payload.titulo || "").trim() || !payload.dataCulto) return Response.json({ error: "Título e data são obrigatórios." }, { status: 400 });
  await getD1().prepare("UPDATE louvor_escalas SET titulo = ?, data_culto = ?, horario = ?, local = ?, observacoes = ?, musicas = ?, integrantes = ?, links = ? WHERE id = ?").bind(String(payload.titulo).trim(), payload.dataCulto, payload.horario || null, payload.local || null, payload.observacoes || null, JSON.stringify(payload.musicas ?? []), JSON.stringify(payload.integrantes ?? []), JSON.stringify(payload.links ?? []), id).run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("LOUVOR_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Escala inválida." }, { status: 400 });
  await getD1().prepare("DELETE FROM louvor_escalas WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
