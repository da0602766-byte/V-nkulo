import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("DIACONIA_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { titulo?: string; dataServico?: string; responsavel?: string; integrantes?: unknown[]; tarefas?: unknown[]; observacoes?: string; status?: string; equipeId?: number; checklist?: unknown[]; cumprida?: boolean };
  if (!id || !String(payload.titulo || "").trim() || !payload.dataServico || !String(payload.responsavel || "").trim()) return Response.json({ error: "Título, data e responsável são obrigatórios." }, { status: 400 });
  const current = await getD1().prepare("SELECT checklist FROM diaconias WHERE id = ?").bind(id).first<{ checklist: string }>();
  const previous = parseChecklist(current?.checklist);
  const members = Array.isArray(payload.integrantes) ? payload.integrantes : [];
  const checklist = members.map((item) => {
    const nome = String((item as { nome?: unknown }).nome || "").trim();
    return { nome, cumpriu: previous.find((person) => person.nome === nome)?.cumpriu || false };
  }).filter((item) => item.nome);
  await getD1().prepare("UPDATE diaconias SET titulo = ?, data_servico = ?, responsavel = ?, integrantes = ?, tarefas = ?, equipe_id = ?, checklist = ?, observacoes = ?, status = ? WHERE id = ?").bind(String(payload.titulo).trim(), payload.dataServico, String(payload.responsavel).trim(), JSON.stringify(payload.integrantes ?? []), JSON.stringify(payload.tarefas ?? []), Number(payload.equipeId) || null, JSON.stringify(checklist), payload.observacoes || null, payload.status || "PLANEJADA", id).run();
  return Response.json({ ok: true });
}

function parseChecklist(value?: string) {
  try { return value ? JSON.parse(value) as { nome: string; cumpriu: boolean }[] : []; } catch { return []; }
}

export async function DELETE(_: Request, context: Context) {
  const access = await requireApiPermission("DIACONIA_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!id) return Response.json({ error: "Serviço inválido." }, { status: 400 });
  await getD1().prepare("DELETE FROM diaconias WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
