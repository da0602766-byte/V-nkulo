import { getD1 } from "../../../../../db";
import { requireApiPermission } from "../../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("DIACONIA_CHECKLIST_GERENCIAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = await request.json() as { tarefas?: { status?: string; motivoAusencia?: string; substitutoUsuarioId?: number | string | null }[] };
  if (!id || !Array.isArray(payload.tarefas)) return Response.json({ error: "Checklist de tarefas inválido." }, { status: 400 });
  const db = getD1();
  const row = await db.prepare("SELECT tarefas FROM diaconias WHERE id = ?").bind(id).first<{ tarefas: string }>();
  if (!row) return Response.json({ error: "Escala não encontrada." }, { status: 404 });
  const original = parseTasks(row.tarefas);
  if (original.length !== payload.tarefas.length) return Response.json({ error: "A lista de tarefas mudou. Abra o checklist novamente." }, { status: 409 });
  const substituteIds = [...new Set(payload.tarefas.map((item) => Number(item.substitutoUsuarioId || 0)).filter(Boolean))];
  const substituteUsers = substituteIds.length ? (await db.prepare(`SELECT id, nome FROM usuarios WHERE ativo = 1 AND id IN (${substituteIds.map(() => "?").join(",")})`).bind(...substituteIds).all<{ id: number; nome: string }>()).results : [];
  const allowed = new Set(["PENDENTE", "FEITA", "AUSENTE", "SUBSTITUTO"]);
  let tasks: ({ descricao?: string; responsavel?: string; status: string; motivoAusencia: string; substitutoUsuarioId: number | null; substitutoNome: string })[];
  try {
    tasks = original.map((task, index) => {
      const input = payload.tarefas![index];
      const status = allowed.has(String(input.status)) ? String(input.status) : "PENDENTE";
      const substitute = substituteUsers.find((item) => item.id === Number(input.substitutoUsuarioId));
      if (status === "AUSENTE" && !String(input.motivoAusencia || "").trim()) throw new Error(`Informe o motivo da ausência na tarefa “${task.descricao}”.`);
      if (status === "SUBSTITUTO" && !substitute) throw new Error(`Selecione um substituto cadastrado para “${task.descricao}”.`);
      return { ...task, status, motivoAusencia: status === "AUSENTE" ? String(input.motivoAusencia || "").trim() : "", substitutoUsuarioId: status === "SUBSTITUTO" ? substitute!.id : null, substitutoNome: status === "SUBSTITUTO" ? substitute!.nome : "" };
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  const complete = tasks.length > 0 && tasks.every((task) => task.status === "FEITA" || task.status === "SUBSTITUTO");
  const successfulNames = tasks.filter((task) => task.status === "FEITA" || task.status === "SUBSTITUTO").map((task) => task.status === "SUBSTITUTO" ? task.substitutoNome : task.responsavel).filter(Boolean);
  const checklist = [...new Set(successfulNames)].map((nome) => ({ nome, cumpriu: true }));
  await db.prepare(
    "UPDATE diaconias SET tarefas = ?, checklist = ?, cumprida = ?, status = CASE WHEN ? = 1 THEN 'CONCLUIDA' ELSE 'EM_ANDAMENTO' END WHERE id = ?",
  ).bind(JSON.stringify(tasks), JSON.stringify(checklist), complete ? 1 : 0, complete ? 1 : 0, id).run();
  return Response.json({ ok: true });
}

function parseTasks(value: string) {
  try {
    const parsed = JSON.parse(value) as { descricao?: string; responsavel?: string; status?: string }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
