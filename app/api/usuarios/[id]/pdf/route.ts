import { getD1 } from "../../../../../db";
import { pdfResponse } from "../../../../lib/pdf";
import { PERMISSION_CATALOG, requireApiPermission } from "../../../../lib/access";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  if (access.user!.perfil !== "ADMIN")
    return Response.json({ error: "Somente administradores podem baixar fichas de membros." }, { status: 403 });
  const id = Number((await context.params).id);
  const row = await getD1().prepare(
    `SELECT u.nome, u.email, u.telefone, u.data_nascimento, u.endereco, u.celula,
      u.ministerio, u.observacoes, u.nome_pais, u.titulo_eclesiastico, u.perfil,
      u.permissoes, u.ativo, d.nome AS diaconia
     FROM usuarios u LEFT JOIN diaconia_equipes d ON d.id = u.diaconia_equipe_id
     WHERE u.id = ? LIMIT 1`,
  ).bind(id).first<Record<string, unknown>>();
  if (!row) return Response.json({ error: "Membro não encontrado." }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const selected = String(row.permissoes || "").split(",");
  const permissions = row.perfil === "ADMIN"
    ? "Acesso administrativo total"
    : PERMISSION_CATALOG.filter((item) => selected.includes(item.key)).map((item) => item.label).join("; ") || "Somente Menu Principal";
  const label = (value: unknown) => String(value || "Não informado");
  return pdfResponse(`ficha-membro-${id}.pdf`, params.get("titulo") || `Ficha do membro — ${row.nome}`, [
    ...(params.get("nota")?.trim() ? [params.get("nota")!.trim(), ""] : []),
    "DADOS PESSOAIS",
    `Nome completo: ${label(row.nome)}`,
    `E-mail: ${label(row.email)}`,
    `Telefone: ${label(row.telefone)}`,
    `Data de nascimento: ${label(row.data_nascimento)}`,
    `Pais ou responsáveis: ${label(row.nome_pais)}`,
    `Endereço: ${label(row.endereco)}`,
    "",
    "VÍNCULOS",
    `Célula: ${label(row.celula)}`,
    `Ministério: ${label(row.ministerio)}`,
    `Equipe de diaconia: ${label(row.diaconia)}`,
    `Título ministerial: ${label(row.titulo_eclesiastico)}`,
    "",
    "ACESSO AO SISTEMA",
    `Perfil: ${label(row.perfil)}`,
    `Situação: ${Number(row.ativo) ? "Ativo" : "Inativo"}`,
    `Permissões: ${permissions}`,
    "",
    `Observações: ${label(row.observacoes)}`,
  ], params.get("download") === "1");
}
