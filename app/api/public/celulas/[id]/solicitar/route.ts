import { getD1 } from "../../../../../../db";
import { getSessionUser } from "../../../../../lib/local-auth";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const id = Number((await context.params).id); const body = await request.json() as Record<string, unknown>;
  const user = await getSessionUser();
  const nome = String(body.nome || user?.nome || "").trim().slice(0,120); const contato = String(body.contato || user?.email || "").trim().slice(0,160); const mensagem = String(body.mensagem || "").trim().slice(0,500);
  if (!Number.isInteger(id) || id <= 0 || !nome || !contato) return Response.json({ error:"Informe nome e contato." }, { status:400 });
  const db = getD1(); const cell = await db.prepare(`SELECT id, comunidade_id FROM celulas WHERE id = ? AND ativo = 1 AND escopo_confirmado = 1`).bind(id).first<{id:number;comunidade_id:number}>();
  if (!cell) return Response.json({ error:"Célula indisponível." }, { status:404 });
  if (user) {
    const duplicate = await db.prepare(`SELECT id FROM celula_solicitacoes WHERE celula_id = ? AND usuario_id = ? AND status = 'PENDENTE' LIMIT 1`).bind(id, user.id).first();
    if (duplicate) return Response.json({ error:"Você já possui uma solicitação pendente para esta célula." }, { status:409 });
  }
  await db.prepare(`INSERT INTO celula_solicitacoes (comunidade_id, celula_id, usuario_id, nome, contato, mensagem) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(cell.comunidade_id, id, user?.id || null, nome, contato, mensagem).run();
  return Response.json({ ok:true }, { status:201 });
}
