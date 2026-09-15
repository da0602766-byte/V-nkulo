import { getD1 } from "../../../../db";
import { requireOwner } from "../../../lib/owner-access";
import { lerResumoMetricas, lerSerieMetricas } from "../../../lib/request-metrics";

/**
 * Saúde técnica da plataforma para a Área do Proprietário.
 *
 * Fica fora de /api/proprietario porque aquele endpoint já carrega sete
 * consultas para montar o painel inteiro; a saúde é consultada sob demanda,
 * na aba própria, e não pode encarecer a abertura da área.
 */
export async function GET(request: Request) {
  const access = await requireOwner();
  if ("error" in access) return access.error;

  const janela = new URL(request.url).searchParams.get("janela");
  const horas = janela === "7d" ? 24 * 7 : 24;

  const db = getD1();
  const [resumo, serie] = await Promise.all([
    lerResumoMetricas(db, horas),
    lerSerieMetricas(db, horas),
  ]);

  return Response.json(
    { resumo, serie },
    { headers: { "Cache-Control": "no-store" } },
  );
}
