import { getD1 } from "../../../../../../db";
import { getAutoSyncStatus, runAutoSyncIfDue, setAutoSyncEnabled } from "../../../../../lib/supabase-auto-sync";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { readIntegration } from "../../../../../lib/supabase-integration";
import { reply, requireIntegrationOwner } from "../route";

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try { return reply({ status: await getAutoSyncStatus(getD1()) }); }
  catch { return reply({ error: "Não foi possível consultar a sincronização automática." }, 503); }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { action?: string };
    if (!["ENABLE", "DISABLE", "RECONCILE"].includes(body?.action || "")) return reply({ error: "Ação de sincronização inválida." }, 400);
    if (body.action === "ENABLE") {
      const integration = await readIntegration();
      if (!integration?.config.ativa || !integration.config.serviceRoleKey) {
        return reply({ error: "Ative a conexão protegida com o Supabase antes de ligar a sincronização." }, 409);
      }
    }
    if (body.action === "ENABLE") await setAutoSyncEnabled(getD1(), true);
    if (body.action === "DISABLE") await setAutoSyncEnabled(getD1(), false);
    const status = body.action === "DISABLE" ? await getAutoSyncStatus(getD1())
      : await runAutoSyncIfDue(getD1(), { force: true, actorId: access.user.id });
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_AUTO_SYNC", status.lastError ? "ERRO" : "SUCESSO",
      { action: body.action, enabled: status.enabled, running: status.running,
        tenants: status.lastResult?.tenants, profiles: status.lastResult?.profiles,
        memberships: status.lastResult?.memberships });
    return reply({ status });
  } catch {
    return reply({ error: "Não foi possível alterar a sincronização automática." }, 503);
  }
}
