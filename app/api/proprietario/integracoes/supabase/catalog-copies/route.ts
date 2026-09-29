import { getD1 } from "../../../../../../db";
import { CatalogCleanupError, clearCatalogCopies, getCatalogCopyCounts, totalCatalogCopies,
  type CatalogCopyCounts } from "../../../../../lib/supabase-catalog-cleanup";
import { getAutoSyncStatus, setAutoSyncEnabled } from "../../../../../lib/supabase-auto-sync";
import { clearProfileDetailsCopyState } from "../../../../../lib/supabase-profile-details-copy-state";
import { setProfileDetailsAutoSyncEnabled } from "../../../../../lib/supabase-profile-details-auto-sync";
import { readIntegration } from "../../../../../lib/supabase-integration";
import { activeAuthLinkLeases, setAuthLinkEnabled } from "../../../../../lib/supabase-auth-link";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

const keys = ["tenants", "profiles", "memberships", "profile_details"] as const;
type Expected = Pick<CatalogCopyCounts, typeof keys[number]>;

function expectedCounts(value: unknown): Expected | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!keys.every(key => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0)) return null;
  return { tenants: Number(row.tenants), profiles: Number(row.profiles),
    memberships: Number(row.memberships), profile_details: Number(row.profile_details) };
}

function failure(error: unknown) {
  return reply({ error: error instanceof CatalogCleanupError ? error.message : "Não foi possível conferir as cópias dos catálogos." },
    error instanceof CatalogCleanupError ? error.status : 503);
}

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try { return reply({ counts: await getCatalogCopyCounts() }); }
  catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { confirm?: unknown; expected?: unknown };
    const expected = expectedCounts(body?.expected);
    if (body?.confirm !== "REMOVER_COPIAS_CATALOGOS_SUPABASE" || !expected) {
      return reply({ error: "Confirme a remoção e as contagens atuais dos catálogos." }, 400);
    }
    const saved = await readIntegration();
    if (!saved?.config.serviceRoleKey) return reply({ error: "A conexão protegida com o Supabase não está configurada." }, 409);
    await setAutoSyncEnabled(getD1(), false);
    await setProfileDetailsAutoSyncEnabled(getD1(), false, access.user.id);
    await setAuthLinkEnabled(getD1(), false, access.user.id);
    if ((await getAutoSyncStatus(getD1())).running) return reply({ error: "Aguarde a sincronização em andamento antes de remover as cópias." }, 409);
    if (await activeAuthLinkLeases(getD1())) return reply({ error: "Aguarde as tentativas de vínculo Auth em andamento antes de remover as cópias." }, 409);
    const project = { url: saved.config.url, projectRef: saved.config.projectRef };
    const before = await getCatalogCopyCounts(project);
    if (before.linked_auth) return reply({ error: "Há contas Supabase Auth criadas ou vinculadas. Revise essas contas antes de remover os catálogos." }, 409);
    if (keys.some(key => before[key] !== expected[key])) return reply({ error: "As contagens mudaram. Atualize a conferência antes de remover." }, 409);
    const next = JSON.stringify({ ...saved.config, ativa: false, lastCheck: null });
    const updated = await getD1().prepare(`UPDATE configuracoes SET valor=?, atualizado_por=?, atualizado_em=CURRENT_TIMESTAMP
      WHERE chave='supabase_integration' AND valor=?`).bind(next, String(access.user.id), saved.raw).run();
    if (Number(updated.meta?.changes || 0) !== 1) throw new CatalogCleanupError("A configuração Supabase mudou durante a remoção. Atualize o painel.", 409);
    const removed = await clearCatalogCopies(expected, access.user.id, project);
    const after = await getCatalogCopyCounts(project);
    if (totalCatalogCopies(after) || after.linked_auth) throw new CatalogCleanupError("A conferência após a remoção não ficou vazia.", 409);
    await clearProfileDetailsCopyState(getD1());
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_CATALOGOS_REMOVIDOS", "SUCESSO", removed);
    return reply({ removed, counts: after, integrationPaused: true });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_CATALOGOS_REMOVIDOS", "ERRO");
    return failure(error);
  }
}
