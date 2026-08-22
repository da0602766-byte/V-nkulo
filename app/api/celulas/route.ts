import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";

export async function GET() {
  const access = await requireApiPermission("CELULAS_VER");
  if (access.error) return access.error;
  const result = await getD1().prepare("SELECT * FROM celulas ORDER BY nome").all();
  return Response.json({ celulas: result.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("CELULAS_GERENCIAR");
  if (access.error) return access.error;
  const body = await request.json() as { nome?: string; responsavel?: string; membros?: string[]; observacoes?: string };
  if (!body.nome?.trim() || !body.responsavel?.trim()) return Response.json({ error: "Nome da célula e responsável são obrigatórios." }, { status: 400 });
  await getD1().prepare("INSERT INTO celulas (nome, responsavel, membros, observacoes, criado_por) VALUES (?, ?, ?, ?, ?)").bind(body.nome.trim(), body.responsavel.trim(), JSON.stringify(body.membros ?? []), body.observacoes || null, access.user!.email).run();
  return Response.json({ ok: true }, { status: 201 });
}
