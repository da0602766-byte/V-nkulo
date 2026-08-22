import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";

export async function GET(request: Request) {
  const access = await requireApiPermission("VISITANTES_VER");
  if (access.error) return access.error;
  const visitorId = Number(new URL(request.url).searchParams.get("visitanteId"));
  const result = visitorId
    ? await getD1().prepare("SELECT a.*, v.nome_completo AS visitante_nome FROM acompanhamentos a JOIN visitantes v ON v.id = a.visitante_id WHERE a.visitante_id = ? ORDER BY a.criado_em DESC").bind(visitorId).all()
    : await getD1().prepare("SELECT a.*, v.nome_completo AS visitante_nome FROM acompanhamentos a JOIN visitantes v ON v.id = a.visitante_id WHERE v.ativo = 1 ORDER BY a.criado_em DESC LIMIT 100").all();
  return Response.json({ acompanhamentos: result.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("ACOMPANHAMENTOS_CRIAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as Record<string, string | number | null>;
  const visitorId = Number(payload.visitanteId);
  const resultText = String(payload.resultado ?? "").trim();
  if (!visitorId || !resultText) {
    return Response.json({ error: "Visitante e resultado são obrigatórios." }, { status: 400 });
  }
  const result = await getD1().prepare(
    "INSERT INTO acompanhamentos (visitante_id, responsavel_email, tipo, resultado, descricao, proximo_contato) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    visitorId,
    access.user!.email,
    String(payload.tipo ?? "WHATSAPP"),
    resultText,
    String(payload.descricao ?? "").trim() || null,
    payload.proximoContato || null,
  ).run();
  await getD1().prepare(
    "UPDATE visitantes SET status = 'EM_ACOMPANHAMENTO', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(visitorId).run();
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
