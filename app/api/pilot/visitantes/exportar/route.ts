import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { visitorExportRows } from "../../../../lib/visitor-export";

export async function GET() {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  const db = getD1();
  try {
    const rows = await visitorExportRows(db, access.context.comunidadeId);
    await recordTenantAudit(db, access.context, access.user.id, "VISITANTES_EXPORTADOS", "SUCESSO", { quantidade: rows.length });
    return Response.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível exportar todas as fichas. O limite é de 10.000 pessoas." }, { status: 422 });
  }
}
