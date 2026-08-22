import { getD1 } from "../../../../../../db";
import { getSessionUser } from "../../../../../lib/local-auth";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const id = Number((await context.params).id); const body = await request.json() as Record<string, unknown>;
  const nome = String(body.nome || "").trim().slice(0,120); const contato = String(body.contato || "").trim().slice(0,160); const mensagem = String(body.mensagem || "").trim().slice(0,500);
  if (!Number.isInteger(id) || id <= 0 || !nome || !contato) return Response.json({ error:"Informe nome e contato." }, { status:400 });
  const db = getD1(); const cell = await db.prepare(`SELECT id, comunidade_id FROM celulas WHERE id = ? AND ativo = 1 AND escopo_confirmado = 1 AND trim(descricao_publica) <> ''`).bind(id).first<{id:number;comunidade_id:number}>();
  if (!cell) return Response.json({ error:"Célula indisponível." }, { status:404 });
  const user = await getSessionUser();
  await db.prepare(`INSERT INTO celula_solicitacoes (comunidade_id, celula_id, usuario_id, nome, contato, mensagem) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(cell.comunidade_id, id, user?.id || null, nome, contato, mensagem).run();
  return Response.json({ ok:true }, { status:201 });
}
