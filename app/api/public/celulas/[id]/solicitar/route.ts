import { getD1 } from "../../../../../../db";
import { rateLimit } from "../../../../../lib/access-security";
import { getSessionUser } from "../../../../../lib/local-auth";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const id = Number((await context.params).id);
  const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Célula indisponível." }, { status: 404 });
  if (!(await rateLimit(request, "cell-request", String(id), 10))) {
    return Response.json({ error: "Muitas solicitações em pouco tempo. Aguarde 15 minutos e tente novamente." }, { status: 429 });
  }
  const user = await getSessionUser();
  const nome = String(body.nome || user?.nome || "").trim().slice(0,120); const contato = String(body.contato || user?.email || "").trim().slice(0,160); const mensagem = String(body.mensagem || "").trim().slice(0,500);
  if (!nome || !contato) return Response.json({ error:"Informe nome e contato." }, { status:400 });
  const db = getD1(); const cell = await db.prepare(`SELECT c.id, c.comunidade_id FROM celulas c JOIN comunidades com ON com.id = c.comunidade_id AND com.status = 'ATIVA' WHERE c.id = ? AND c.ativo = 1 AND c.escopo_confirmado = 1`).bind(id).first<{id:number;comunidade_id:number}>();
  if (!cell) return Response.json({ error:"Célula indisponível." }, { status:404 });
  // Verificado mesmo sem sessão: sem isto, qualquer visitante anônimo podia
  // enviar a mesma solicitação sem parar e encher a fila de pendências do
  // líder com lixo, já que o formulário não exige login.
  const duplicate = await db.prepare(
    `SELECT id FROM celula_solicitacoes
     WHERE celula_id = ? AND status = 'PENDENTE'
       AND (usuario_id = ? OR (usuario_id IS NULL AND contato = ?))
     LIMIT 1`,
  ).bind(id, user?.id || 0, contato).first();
  if (duplicate) return Response.json({ error:"Já existe uma solicitação pendente para esta célula com este contato." }, { status:409 });
  await db.prepare(`INSERT INTO celula_solicitacoes (comunidade_id, celula_id, usuario_id, nome, contato, mensagem) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(cell.comunidade_id, id, user?.id || null, nome, contato, mensagem).run();
  return Response.json({ ok:true }, { status:201 });
}
