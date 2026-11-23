import { getD1 } from "../../../../db";
import { readManagementReports, readVisitorCohort } from "../../../lib/management-report-data";
import { previousReportPeriod, reportArchiveRows, reportFilters } from "../../../lib/management-reports";
import { centralCsv } from "../../../lib/community-central";
import { requireTenantPermission } from "../../../lib/tenant";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const access = await requireTenantPermission("reports.view");
  if ("error" in access) return access.error;
  const query = new URL(request.url).searchParams;
  const filters = reportFilters(query);
  if (!filters) return Response.json({ error: "Revise os filtros. Use um período de até 366 dias." }, { status: 400, headers });
  const db = getD1();
  const format = query.get("format");
  if (format !== "csv" && format !== "xlsx") {
    if (query.get("compare") !== "1") return Response.json(await readManagementReports(db,access.context,filters), { headers });
    const previousFilters = previousReportPeriod(filters);
    const canViewVisitors = access.context.isCommunityOwner && access.context.permissions.includes("visitors.view") && !filters.group && filters.area !== "parking";
    const [current, previous, visitors] = await Promise.all([
      readManagementReports(db,access.context,filters),
      readManagementReports(db,access.context,previousFilters,0),
      canViewVisitors ? Promise.all([
        readVisitorCohort(db,access.context.comunidadeId,filters),readVisitorCohort(db,access.context.comunidadeId,previousFilters),
      ]).then(([current,previous]) => ({ current,previous })).catch(() => null) : null,
    ]);
    return Response.json({ ...current, comparison: { previous: { period: previous.period, metrics: previous.metrics },visitors } }, { headers });
  }
  const data = await readManagementReports(db,access.context,{ ...filters, page: 1 },5000);
  if (data.total > data.rows.length) return Response.json({ error: "Reduza o período para exportar até 5.000 registros." }, { status: 422, headers });
  if (format === "xlsx") {
    const xlsx = await import("xlsx");
    const book = xlsx.utils.book_new();
    const summary = [["Comunidade", access.context.comunidadeNome], ["De",filters.from], ["Até",filters.to], ["Área",filters.area || "Todas"], ["Grupo",filters.group], ["Situação",filters.status],
      ["Registros",data.total], ["Indicadores", "Todas as situações do período e grupo"], ["Esperados",data.metrics.expected], ["Recebidos dos esperados",data.metrics.received], ["Atrasados",data.metrics.overdue],
      ["Em revisão",data.metrics.reviewing], ["Correções solicitadas",data.metrics.correcting], ["Presenças em encontros",data.metrics.attendance]];
    xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet(summary),"Resumo");
    xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet(reportArchiveRows(data)),"Registros");
    const content = xlsx.write(book,{ bookType:"xlsx", type:"array" }) as ArrayBuffer;
    return new Response(content, { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="relatorios-${filters.from}-${filters.to}.xlsx"` } });
  }
  return new Response(centralCsv([["Período",filters.from,filters.to],["Área",filters.area || "Todas"],["Grupo",filters.group],["Situação",filters.status || "Todas"], ...reportArchiveRows(data)]), {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorios-${filters.from}-${filters.to}.csv"` },
  });
}
