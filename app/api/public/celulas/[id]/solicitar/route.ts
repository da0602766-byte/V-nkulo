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

// Desistir do pedido é do próprio autor: a decisão de aprovar ou recusar
// continua com a liderança, mas ficar preso numa fila que a pessoa já não quer
// não é decisão de ninguém. Só apaga pedido PENDENTE e só o dela, identificado
// pela sessão — pedido anônimo não tem como ser reivindicado depois.
export async function DELETE(_request: Request, context: Context) {
  const id = Number((await context.params).id);
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Faça login para cancelar a solicitação." }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Célula inválida." }, { status: 400 });
  const db = getD1();
  const result = await db.prepare(
    `DELETE FROM celula_solicitacoes WHERE celula_id = ? AND usuario_id = ? AND status = 'PENDENTE'`,
  ).bind(id, user.id).run();
  if (!result.meta.changes) {
    return Response.json({ error: "Não há solicitação pendente sua nesta célula." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
