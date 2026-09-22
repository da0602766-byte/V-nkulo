import { getD1 } from "../../../../../../db";
import { loadSourceTenantCatalog, previewTenantCatalog, syncTenantCatalog, TenantCatalogError } from "../../../../../lib/supabase-tenant-catalog";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

function failure(error: unknown) {
  return error instanceof TenantCatalogError
    ? reply({ error: error.message }, error.status)
    : reply({ error: "Não foi possível comparar as comunidades com o Supabase." }, 503);
}

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    return reply({ preview: await previewTenantCatalog() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json();
    if (body?.confirm !== "SINCRONIZAR_COMUNIDADES" || !Number.isSafeInteger(body?.sourceCount)) {
      return reply({ error: "Confirme a contagem atual das comunidades antes de sincronizar." }, 400);
    }
    const source = await loadSourceTenantCatalog();
    if (source.length !== body.sourceCount) {
      return reply({ error: "O número de comunidades mudou. Atualize a conferência antes de sincronizar." }, 409);
    }
    const before = await previewTenantCatalog(source);
    if (before.extraDestinationCount > 0) {
      return reply({ error: "Há comunidades no Supabase sem correspondente no D1. Revise o catálogo antes de sincronizar." }, 409);
    }
    const run = await syncTenantCatalog(source, access.user.id);
    const after = await previewTenantCatalog(source);
    if (!after.ready) throw new TenantCatalogError("A sincronização foi executada, mas a conferência final ainda aponta diferenças. Repita a leitura antes de tentar novamente.", 409);
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_SUPABASE_TENANTS_SINCRONIZADOS", "SUCESSO", {
      runId: run.run_id,
      origem: after.sourceCount,
      destino: after.destinationCount,
      inseridos: run.inserted_count,
      atualizados: run.updated_count,
      inalterados: run.unchanged_count,
    });
    return reply({ preview: after, run });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_SUPABASE_TENANTS_SINCRONIZADOS", "ERRO", {
      motivo: error instanceof TenantCatalogError ? error.message : "erro_indisponivel",
    });
    return failure(error);
  }
}
