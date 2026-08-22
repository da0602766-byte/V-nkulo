import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

export async function POST(request: Request) {
  const access = await requireApiPermission("TEENS_GERENCIAR");
  if (access.error) return access.error;
  const payload = await request.json() as { usuarioId?: number | string; resultado?: string; descricao?: string; proximoContato?: string };
  const userId = Number(payload.usuarioId);
  const result = String(payload.resultado || "").trim();
  if (!userId || !result) return Response.json({ error: "Teen e resultado são obrigatórios." }, { status: 400 });
  const db = getD1();
  const teen = await db.prepare("SELECT id FROM usuarios WHERE id = ? AND ativo = 1 AND data_nascimento IS NOT NULL AND date(data_nascimento, '+17 years') > date('now')").bind(userId).first<{ id: number }>();
  if (!teen) return Response.json({ error: "Este cadastro não pertence mais ao Teens." }, { status: 400 });
  const created = await db.prepare(
    "INSERT INTO teens_acompanhamentos (usuario_id, responsavel_email, resultado, descricao, proximo_contato) VALUES (?, ?, ?, ?, ?)",
  ).bind(userId, access.user!.email, result, optional(payload.descricao), optional(payload.proximoContato)).run();
  return Response.json({ id: created.meta.last_row_id }, { status: 201 });
}

function optional(value?: string) { return String(value || "").trim() || null; }
