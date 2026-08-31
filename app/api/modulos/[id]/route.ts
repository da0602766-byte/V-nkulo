import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("MODULOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = (await request.json()) as { nome?: string; descricao?: string; icone?: string; campos?: unknown[]; conteudo?: unknown[]; cor?: string; ativo?: boolean };
  if (/data:(?:image|audio|video|application)\//i.test(JSON.stringify(payload.conteudo ?? null))) {
    return Response.json(
      { error: "As imagens precisam estar no Google Drive; o Vínkulo não guarda arquivos no banco." },
      { status: 400 },
    );
  }
  await getD1().prepare(
    "UPDATE ministerio_modulos SET nome = ?, descricao = ?, icone = ?, campos = ?, conteudo = ?, cor = ?, ativo = ? WHERE id = ?",
  ).bind(payload.nome || "Módulo", payload.descricao || null, payload.icone || "◇", JSON.stringify(payload.campos ?? []), JSON.stringify(payload.conteudo ?? []), payload.cor || "#17877f", payload.ativo === false ? 0 : 1, id).run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("MODULOS_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Aba inválida." }, { status: 400 });
  await getD1().prepare("DELETE FROM ministerio_modulos WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
