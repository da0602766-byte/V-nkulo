import { visitorCustomFields } from "../../../../lib/visitor-custom-fields";
import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { visitorExportRows, mapVisitorExportRows } from "../../../../lib/visitor-export";

import { directoryExportRows } from "../../../../lib/visitor-directory";
import { migrateVisitorAgeCategories } from "../../../../lib/visitor-category-rules";

export async function GET(request: Request) {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  const db = getD1();
  try {
    const params = new URL(request.url).searchParams;
    const directory = params.get("diretorio") === "1";
    if (directory) await migrateVisitorAgeCategories(db, access.context.comunidadeId);
    const campos = await visitorCustomFields(db, access.context.comunidadeId);
    const rows = directory ? mapVisitorExportRows(await directoryExportRows(db, access.context.comunidadeId, params), campos) : await visitorExportRows(db, access.context.comunidadeId);
    await recordTenantAudit(db, access.context, access.user.id, "VISITANTES_EXPORTADOS", "SUCESSO", { quantidade: rows.length });
    return Response.json({ rows, campos, headers:Object.keys(rows[0] || mapVisitorExportRows([{}], campos)[0]) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : "Não foi possível exportar todas as fichas. Tente novamente." }, { status: 422 });
  }
}
