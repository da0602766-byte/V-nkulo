import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";
import { syncVisitorCell } from "../../../lib/cell-membership";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireApiPermission("VISITANTES_EDITAR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const payload = (await request.json()) as Record<string, string | boolean | null>;
  if (!Number.isInteger(id)) return Response.json({ error: "ID inválido." }, { status: 400 });
  const db = getD1();
  const previous = await db.prepare("SELECT nome_completo, celula_id FROM visitantes WHERE id = ? AND ativo = 1").bind(id).first<{ nome_completo: string; celula_id: number | null }>();
  if (!previous) return Response.json({ error: "Visitante não encontrado." }, { status: 404 });
  const cellId = Number(payload.celulaId || 0) || null;
  const cell = cellId ? await db.prepare("SELECT id, nome FROM celulas WHERE id = ?").bind(cellId).first<{ id: number; nome: string }>() : null;
  if (cellId && !cell) return Response.json({ error: "Selecione uma célula já cadastrada." }, { status: 400 });
  const name = String(payload.nomeCompleto ?? "").trim();
  if (!name) return Response.json({ error: "Nome completo é obrigatório." }, { status: 400 });
  await db.prepare(
    `UPDATE visitantes SET
      nome_completo = ?, data_nascimento = ?, telefone = ?, email = ?, batizado = ?, status = ?, endereco = ?,
      acompanhante = ?, celula = ?, celula_id = ?, encontro_com_deus = ?, curso_membros = ?,
      ministerio = ?, data_entrada = ?, observacoes = ?, atualizado_em = CURRENT_TIMESTAMP
     WHERE id = ? AND ativo = 1`,
  ).bind(
    name,
    payload.dataNascimento || null,
    String(payload.telefone ?? "").trim() || null,
    String(payload.email ?? "").trim().toLowerCase() || null,
    String(payload.batizado ?? "NAO_INFORMADO"),
    String(payload.status ?? "NOVO"),
    String(payload.endereco ?? "").trim() || null,
    String(payload.acompanhante ?? "").trim() || null,
    cell?.nome || null,
    cell?.id || null,
    payload.encontroComDeus ? 1 : 0,
    payload.cursoMembros ? 1 : 0,
    String(payload.ministerio ?? "").trim() || null,
    String(payload.dataEntrada ?? new Date().toISOString().slice(0, 10)),
    String(payload.observacoes ?? "").trim() || null,
    id,
  ).run();
  await syncVisitorCell(db, { cellId: previous.celula_id, name: previous.nome_completo }, { cellId: cell?.id, name });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireApiPermission("VISITANTES_EXCLUIR");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "ID inválido." }, { status: 400 });
  const db = getD1();
  const previous = await db.prepare("SELECT nome_completo, celula_id FROM visitantes WHERE id = ?").bind(id).first<{ nome_completo: string; celula_id: number | null }>();
  await db.prepare(
    "UPDATE visitantes SET ativo = 0, status = 'INATIVO', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(id).run();
  if (previous) await syncVisitorCell(db, { cellId: previous.celula_id, name: previous.nome_completo }, {});
  return Response.json({ ok: true });
}
