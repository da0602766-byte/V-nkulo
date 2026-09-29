import { getD1 } from "../../../../../../db";
import { activeAuthLinkLeases, authLinkState, AuthLinkError, getAuthLinkEnabled,
  setAuthLinkEnabled } from "../../../../../lib/supabase-auth-link";
import { getAutoSyncStatus } from "../../../../../lib/supabase-auto-sync";
import { getCatalogCopyCounts } from "../../../../../lib/supabase-catalog-cleanup";
import { loadSourceProfiles, previewProfiles } from "../../../../../lib/supabase-profile-catalog";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const [source, remote, enabled, activeAttempts] = await Promise.all([
      loadSourceProfiles(), getCatalogCopyCounts(), getAuthLinkEnabled(getD1()), activeAuthLinkLeases(getD1()),
    ]);
    return reply({ status: { enabled, profiles: source.length, linked: remote.linked_auth, activeAttempts } });
  } catch { return reply({ error: "Não foi possível conferir o estado dos vínculos Auth." }, 503); }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { action?: unknown; confirm?: unknown };
    if (body?.action !== "ENABLE" && body?.action !== "DISABLE") return reply({ error: "Ação Auth inválida." }, 400);
    if (body.action === "ENABLE") {
      if (body.confirm !== "ATIVAR_VINCULO_AUTH") return reply({ error: "Confirme a ativação do vínculo Auth." }, 400);
      if (!(await getAutoSyncStatus(getD1())).enabled || !(await previewProfiles()).ready) {
        return reply({ error: "Ative a conciliação automática e confira os perfis antes de vincular contas Auth." }, 409);
      }
      await authLinkState(access.user.id); // Confirma que a migração SQL 0010 responde.
    }
    await setAuthLinkEnabled(getD1(), body.action === "ENABLE", access.user.id);
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_AUTH_LINK", "SUCESSO", { action: body.action });
    const remote = await getCatalogCopyCounts();
    return reply({ status: { enabled: await getAuthLinkEnabled(getD1()),
      profiles: (await loadSourceProfiles()).length, linked: remote.linked_auth,
      activeAttempts: await activeAuthLinkLeases(getD1()) } });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_AUTH_LINK", "ERRO");
    return reply({ error: error instanceof AuthLinkError ? error.message : "Não foi possível alterar o vínculo Auth." },
      error instanceof AuthLinkError && error.code === "SCHEMA" ? 424 : 503);
  }
}
