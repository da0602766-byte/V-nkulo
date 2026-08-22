import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";

export async function GET() {
  const access = await requireApiPermission("LOUVOR_VER");
  if (access.error) return access.error;
  const result = await getD1().prepare("SELECT * FROM louvor_escalas ORDER BY data_culto DESC LIMIT 50").all();
  return Response.json({ escalas: result.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("LOUVOR_GERENCIAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as {
    titulo?: string; dataCulto?: string; horario?: string; local?: string;
    observacoes?: string; musicas?: unknown[]; integrantes?: unknown[]; links?: unknown[];
  };
  const titulo = payload.titulo?.trim() ?? "";
  if (!titulo || !payload.dataCulto) return Response.json({ error: "Título e data do culto são obrigatórios." }, { status: 400 });
  const result = await getD1().prepare(
    "INSERT INTO louvor_escalas (titulo, data_culto, horario, local, observacoes, musicas, integrantes, links, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(titulo, payload.dataCulto, payload.horario || null, payload.local || null, payload.observacoes || null, JSON.stringify(payload.musicas ?? []), JSON.stringify(payload.integrantes ?? []), JSON.stringify(payload.links ?? []), access.user!.email).run();
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
