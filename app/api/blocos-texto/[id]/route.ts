import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("SISTEMA_PERSONALIZAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { area?: string; posicao?: string; titulo?: string; conteudo?: string; cor?: string; ordem?: number | string };
  const content = String(payload.conteudo || "").trim();
  if (!id || !content) return Response.json({ error: "Conteúdo obrigatório." }, { status: 400 });
  await getD1().prepare(
    "UPDATE blocos_texto SET area = ?, posicao = ?, titulo = ?, conteudo = ?, cor = ?, ordem = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(cleanArea(payload.area), payload.posicao === "RODAPE" ? "RODAPE" : "TOPO", optional(payload.titulo), content, cleanColor(payload.cor), Number(payload.ordem || 0), id).run();
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("SISTEMA_PERSONALIZAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  await getD1().prepare("DELETE FROM blocos_texto WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}

function cleanArea(value?: string) { return String(value || "avisos").replace(/[^a-z_]/g, "").slice(0, 40) || "avisos"; }
function cleanColor(value?: string) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#eef7f6"; }
function optional(value?: string) { return String(value || "").trim() || null; }
