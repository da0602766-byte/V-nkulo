import { getD1 } from "../../../../../../db";
import { clearRemoteProfileDetails, loadSourceProfileDetails, previewProfileDetails, ProfileDetailsError, remoteProfileDetailsCount, syncProfileDetails } from "../../../../../lib/supabase-profile-details";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { getProfileDetailsAutoSyncEnabled, setProfileDetailsAutoSyncEnabled } from "../../../../../lib/supabase-profile-details-auto-sync";
import { clearProfileDetailsCopyState, hasTrackedProfileDetails, markProfileDetailsCopy } from "../../../../../lib/supabase-profile-details-copy-state";
import { getAutoSyncStatus } from "../../../../../lib/supabase-auto-sync";
import { reply, requireIntegrationOwner } from "../route";

export async function GET() {
  const access = await requireIntegrationOwner();
  if ("error" in access) return access.error;
  try { return reply({ preview: await previewProfileDetails(), autoSyncEnabled: await getProfileDetailsAutoSyncEnabled(getD1()),
    copyTracked: await hasTrackedProfileDetails(getD1()) }); }
  catch (error) { return reply({ error: error instanceof ProfileDetailsError ? error.message : "Não foi possível comparar os dados cadastrais." },
    error instanceof ProfileDetailsError ? error.status : 503); }
}

export async function PATCH(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { action?: unknown };
    if (body?.action !== "ENABLE" && body?.action !== "DISABLE") return reply({ error: "Ação inválida." }, 400);
    if (body.action === "ENABLE" && !(await previewProfileDetails()).ready) {
      return reply({ error: "Conclua e confira a primeira cópia dos dados cadastrais antes de ativar a sincronização." }, 409);
    }
    await setProfileDetailsAutoSyncEnabled(getD1(), body.action === "ENABLE", access.user.id);
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS_AUTO_SYNC", "SUCESSO", { action: body.action });
    return reply({ autoSyncEnabled: await getProfileDetailsAutoSyncEnabled(getD1()) });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS_AUTO_SYNC", "ERRO");
    return reply({ error: error instanceof ProfileDetailsError ? error.message : "Não foi possível alterar a sincronização dos dados cadastrais." },
      error instanceof ProfileDetailsError ? error.status : 503);
  }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { confirm?: unknown; sourceCount?: unknown };
    if (body?.confirm !== "SINCRONIZAR_DADOS_CADASTRAIS" || !Number.isSafeInteger(body.sourceCount) || Number(body.sourceCount) < 0) {
      return reply({ error: "Confirme a transferência e a contagem atual dos cadastros." }, 400);
    }
    const source = await loadSourceProfileDetails();
    if (source.length !== body.sourceCount) return reply({ error: "A contagem mudou. Atualize a comparação antes de transferir." }, 409);
    const before = await previewProfileDetails(source);
    if (before.extraDestinationCount) return reply({ error: "Há dados cadastrais extras no Supabase. Revise antes de sincronizar." }, 409);
    if (source.length || before.destinationCount) await markProfileDetailsCopy(getD1(), access.user.id);
    const run = before.ready ? null : await syncProfileDetails(source, access.user.id);
    const after = await previewProfileDetails();
    if (!after.ready) throw new ProfileDetailsError("A conferência após a transferência não coincidiu.");
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS", "SUCESSO",
      { sourceCount: source.length, inserted: run?.inserted_count || 0, updated: run?.updated_count || 0 });
    return reply({ preview: after, run });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS", "ERRO");
    return reply({ error: error instanceof ProfileDetailsError ? error.message : "Não foi possível transferir os dados cadastrais." },
      error instanceof ProfileDetailsError ? error.status : 503);
  }
}

export async function DELETE(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { confirm?: unknown; destinationCount?: unknown };
    if (body?.confirm !== "REMOVER_COPIA_DADOS_CADASTRAIS" || !Number.isSafeInteger(body.destinationCount) || Number(body.destinationCount) < 0) {
      return reply({ error: "Confirme a remoção e a contagem atual no Supabase." }, 400);
    }
    await setProfileDetailsAutoSyncEnabled(getD1(), false, access.user.id);
    if ((await getAutoSyncStatus(getD1())).running) return reply({ error: "Aguarde a sincronização em andamento antes de remover a cópia." }, 409);
    const count = await remoteProfileDetailsCount();
    if (count !== body.destinationCount) return reply({ error: "A contagem no Supabase mudou. Atualize a comparação antes de remover." }, 409);
    const deleted = count ? await clearRemoteProfileDetails(access.user.id) : 0;
    if (await remoteProfileDetailsCount()) throw new ProfileDetailsError("A conferência após a remoção não ficou vazia.");
    await clearProfileDetailsCopyState(getD1());
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS_REMOVIDOS", "SUCESSO", { deleted });
    return reply({ deleted, copyTracked: false, autoSyncEnabled: false, preview: await previewProfileDetails() });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS_REMOVIDOS", "ERRO");
    return reply({ error: error instanceof ProfileDetailsError ? error.message : "Não foi possível remover a cópia dos dados cadastrais." },
      error instanceof ProfileDetailsError ? error.status : 503);
  }
}
