import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { verifyTenantFoundation } from "../../../../../lib/supabase-tenant-foundation";
import { getD1 } from "../../../../../../db";
import { reply, requireIntegrationOwner } from "../route";

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  const check = await verifyTenantFoundation();
  return reply({ check }, check.ready ? 200 : 424);
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  const check = await verifyTenantFoundation();
  await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_SUPABASE_TENANCY_VERIFICADA", check.ready ? "SUCESSO" : "ERRO", {
    status: check.status,
    latenciaMs: check.latencyMs,
    tabelas: check.tables,
  });
  return reply({ check }, check.ready ? 200 : 424);
}
