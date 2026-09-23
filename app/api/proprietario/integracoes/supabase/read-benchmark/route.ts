import { getD1 } from "../../../../../../db";
import { benchmarkMembershipRead } from "../../../../../lib/supabase-read-benchmark";
import { MembershipCatalogError } from "../../../../../lib/supabase-membership-catalog";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const result = await benchmarkMembershipRead();
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_SUPABASE_LEITURA_COMPARADA", "SUCESSO", {
      origem: result.sourceCount, destino: result.destinationCount, iguais: result.matching,
      d1MedianaMs: result.d1MedianMs, supabaseMedianaMs: result.supabaseMedianMs,
    });
    return reply({ result });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_SUPABASE_LEITURA_COMPARADA", "ERRO", {
      motivo: error instanceof MembershipCatalogError ? error.message : "erro_indisponivel",
    });
    return error instanceof MembershipCatalogError
      ? reply({ error: error.message }, error.status)
      : reply({ error: "Não foi possível medir a leitura nos dois bancos." }, 503);
  }
}
