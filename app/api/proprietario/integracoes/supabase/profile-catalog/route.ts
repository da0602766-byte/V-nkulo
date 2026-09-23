import { getD1 } from "../../../../../../db";
import { loadSourceProfiles, previewProfiles, ProfileCatalogError, syncProfiles } from "../../../../../lib/supabase-profile-catalog";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

function failure(error: unknown) {
  return error instanceof ProfileCatalogError
    ? reply({ error: error.message }, error.status)
    : reply({ error: "Não foi possível comparar os perfis com o Supabase." }, 503);
}

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try { return reply({ preview: await previewProfiles() }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json();
    if (body?.confirm !== "SINCRONIZAR_PERFIS" || !Number.isSafeInteger(body?.sourceCount)) {
      return reply({ error: "Confirme a contagem atual de perfis antes de sincronizar." }, 400);
    }
    const source = await loadSourceProfiles();
    if (source.length !== body.sourceCount) return reply({ error: "O número de perfis mudou. Atualize a comparação antes de sincronizar." }, 409);
    const before = await previewProfiles(source);
    if (before.extraDestinationCount > 0) return reply({ error: "Há perfis extras no Supabase. A sincronização está bloqueada para revisão." }, 409);
    const run = await syncProfiles(source, access.user.id);
    const after = await previewProfiles(source);
    if (!after.ready) throw new ProfileCatalogError("A sincronização foi executada, mas a conferência final ainda aponta diferenças.", 409);
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_SUPABASE_PROFILES_SINCRONIZADOS", "SUCESSO", {
      runId: run.run_id, origem: after.sourceCount, destino: after.destinationCount,
      inseridos: run.inserted_count, atualizados: run.updated_count, inalterados: run.unchanged_count,
    });
    return reply({ preview: after, run });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_SUPABASE_PROFILES_SINCRONIZADOS", "ERRO", {
      motivo: error instanceof ProfileCatalogError ? error.message : "erro_indisponivel",
    });
    return failure(error);
  }
}
