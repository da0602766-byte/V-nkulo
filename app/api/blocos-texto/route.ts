import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";

export async function GET() {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  const rows = await getD1().prepare("SELECT * FROM blocos_texto WHERE ativo = 1 ORDER BY area, posicao, ordem, id").all();
  return Response.json({ blocos: rows.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("SISTEMA_PERSONALIZAR");
  if (access.error) return access.error;
  const payload = await request.json() as { area?: string; posicao?: string; titulo?: string; conteudo?: string; cor?: string; ordem?: number | string };
  const content = String(payload.conteudo || "").trim();
  if (!content) return Response.json({ error: "Digite o conteúdo da caixa de texto." }, { status: 400 });
  const result = await getD1().prepare(
    "INSERT INTO blocos_texto (area, posicao, titulo, conteudo, cor, ordem, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(cleanArea(payload.area), payload.posicao === "RODAPE" ? "RODAPE" : "TOPO", optional(payload.titulo), content, cleanColor(payload.cor), Number(payload.ordem || 0), access.user!.email).run();
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}

function cleanArea(value?: string) { return String(value || "avisos").replace(/[^a-z_]/g, "").slice(0, 40) || "avisos"; }
function cleanColor(value?: string) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#eef7f6"; }
function optional(value?: string) { return String(value || "").trim() || null; }
