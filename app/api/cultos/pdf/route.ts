import { getD1 } from "../../../../db";
import { pdfResponse } from "../../../lib/pdf";
import { requireApiPermission } from "../../../lib/access";

export async function GET(request: Request) {
  const access = await requireApiPermission("CULTOS_GERENCIAR");
  if (access.error) return access.error;
  const params = new URL(request.url).searchParams;
  const period = ["dia", "semana", "mes", "ano"].includes(params.get("periodo") || "") ? params.get("periodo")! : "mes";
  const modifier = period === "dia" ? "0 days" : period === "semana" ? "-6 days" : period === "ano" ? "-1 year" : "-1 month";
  const rows = await getD1().prepare(
    `SELECT c.titulo, c.data_culto, c.horario, e.nome AS equipe, u.nome AS registrador,
      COUNT(l.id) AS lancamentos, COALESCE(SUM(l.pessoas_culto), 0) AS pessoas,
      COALESCE(SUM(l.visitantes), 0) AS visitantes, COALESCE(SUM(l.cestas_basicas), 0) AS cestas,
      COALESCE(SUM(l.visitas_lares), 0) AS visitas_lares
     FROM culto_rotinas c
     LEFT JOIN diaconia_equipes e ON e.id = c.equipe_id
     LEFT JOIN usuarios u ON u.id = c.registrador_usuario_id
     LEFT JOIN culto_lancamentos l ON l.rotina_id = c.id
     WHERE date(c.data_culto) >= date('now', ?)
     GROUP BY c.id ORDER BY c.data_culto DESC, c.horario DESC`,
  ).bind(modifier).all<Record<string, unknown>>();
  const totals = rows.results.reduce<{ pessoas: number; visitantes: number; cestas: number; visitas: number }>((sum, row) => ({
    pessoas: sum.pessoas + Number(row.pessoas || 0),
    visitantes: sum.visitantes + Number(row.visitantes || 0),
    cestas: sum.cestas + Number(row.cestas || 0),
    visitas: sum.visitas + Number(row.visitas_lares || 0),
  }), { pessoas: 0, visitantes: 0, cestas: 0, visitas: 0 });
  const periodLabel = { dia: "diário", semana: "semanal", mes: "mensal", ano: "anual" }[period];
  return pdfResponse(`rotinas-cultos-${period}.pdf`, params.get("titulo") || `Relatório ${periodLabel} — Rotinas dos Cultos`, [
    ...(params.get("nota")?.trim() ? [params.get("nota")!.trim(), ""] : []),
    `Gerado em: ${new Date().toLocaleDateString("pt-BR")}`,
    `Rotinas no período: ${rows.results.length}`,
    `Pessoas registradas: ${totals.pessoas}`,
    `Visitantes: ${totals.visitantes}`,
    `Cestas básicas: ${totals.cestas}`,
    `Visitas em lares: ${totals.visitas}`,
    "",
    "DETALHAMENTO DAS ROTINAS",
    ...rows.results.flatMap((row) => [
      `${row.data_culto} ${row.horario || ""} — ${row.titulo}`,
      `Equipe: ${row.equipe || "Não informada"} | Responsável: ${row.registrador || "Não informado"}`,
      `Pessoas: ${row.pessoas} | Visitantes: ${row.visitantes} | Cestas: ${row.cestas} | Visitas em lares: ${row.visitas_lares}`,
      "",
    ]),
  ], params.get("download") === "1");
}
