import { getD1 } from "../../../../../db";
import { pdfResponse } from "../../../../lib/pdf";
import { requireApiPermission } from "../../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  if (access.user!.perfil !== "ADMIN")
    return Response.json({ error: "Somente administradores podem baixar fichas técnicas." }, { status: 403 });
  const id = Number((await context.params).id);
  const row = await getD1().prepare(
    `SELECT nome_completo, data_nascimento, telefone, email, batizado, status, endereco,
      acompanhante, celula, encontro_com_deus, curso_membros, ministerio, data_entrada, observacoes
     FROM visitantes WHERE id = ? AND ativo = 1 LIMIT 1`,
  ).bind(id).first<Record<string, unknown>>();
  if (!row) return Response.json({ error: "Visitante não encontrado." }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const title = params.get("titulo") || `Ficha técnica — ${row.nome_completo}`;
  const note = params.get("nota")?.trim();
  const yesNo = (value: unknown) => Number(value) ? "Sim" : "Não";
  const label = (value: unknown) => String(value || "Não informado");
  return pdfResponse(`ficha-visitante-${id}.pdf`, title, [
    ...(note ? [note, ""] : []),
    "DADOS PESSOAIS",
    `Nome completo: ${label(row.nome_completo)}`,
    `Data de nascimento: ${label(row.data_nascimento)}`,
    `Telefone: ${label(row.telefone)}`,
    `E-mail: ${label(row.email)}`,
    `Endereço: ${label(row.endereco)}`,
    "",
    "ACOMPANHAMENTO E INTEGRAÇÃO",
    `Data de entrada: ${label(row.data_entrada)}`,
    `Situação: ${label(row.status)}`,
    `Batizado: ${row.batizado === "SIM" ? "Sim" : row.batizado === "NAO" ? "Não" : "Não informado"}`,
    `Célula: ${label(row.celula)}`,
    `Acompanhante: ${label(row.acompanhante)}`,
    `Ministério: ${label(row.ministerio)}`,
    `Encontro com Deus: ${yesNo(row.encontro_com_deus)}`,
    `Curso de membros: ${yesNo(row.curso_membros)}`,
    "",
    `Observações: ${label(row.observacoes)}`,
  ], params.get("download") === "1");
}
