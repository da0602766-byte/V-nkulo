import { getD1 } from "../../../../../db";
import { getSessionUser } from "../../../../lib/local-auth";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { IntegrationInputError, parseIntegration, publicIntegration, readIntegration, writeIntegration } from "../../../../lib/supabase-integration";
import { getAutoSyncStatus } from "../../../../lib/supabase-auto-sync";
import { setProfileDetailsAutoSyncEnabled } from "../../../../lib/supabase-profile-details-auto-sync";
import { hasTrackedProfileDetails } from "../../../../lib/supabase-profile-details-copy-state";
import { CatalogCleanupError, getCatalogCopyCounts, totalCatalogCopies } from "../../../../lib/supabase-catalog-cleanup";
import { activeAuthLinkLeases, setAuthLinkEnabled } from "../../../../lib/supabase-auth-link";

export const reply = (value: unknown, status=200) => Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function requireIntegrationOwner(request?: Request) {
  const user = await getSessionUser();
  if (!user) return {error:reply({error:"Faça login para continuar."},401)} as const;
  if (!user.ativo || !user.system_owner) {
    if (request && request.method !== "GET") await recordTenantAudit(getD1(),{comunidadeId:null},user.id,"INTEGRACAO_SUPABASE_ATUALIZADA","NEGADO");
    return {error:reply({error:"Esta área é exclusiva do proprietário do sistema."},403)} as const;
  }
  if (request && request.method !== "GET" && request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return {error:reply({error:"Origem da solicitação não autorizada."},403)} as const;
  return {user} as const;
}
export async function GET() {
  const access = await requireIntegrationOwner();
  if ("error" in access) return access.error;
  try {
    const saved = await readIntegration();
    return reply({integration:saved ? publicIntegration(saved.config) : null,updatedBy:saved?.updatedBy || null,updatedAt:saved?.updatedAt || null});
  } catch { return reply({error:"Não foi possível ler a configuração do Supabase. Tente novamente."},503); }
}
export async function PATCH(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const payload = await request.json();
    if (!payload || Array.isArray(payload) || typeof payload !== "object" || payload.confirm !== true) return reply({error:"Confirme explicitamente a alteração da integração."},400);
    const saved = await readIntegration();
    const config = await parseIntegration(payload,saved?.config || null);
    if (saved && (saved.config.url !== config.url || saved.config.projectRef !== config.projectRef || !config.serviceRoleKey)
      && await activeAuthLinkLeases(getD1())) {
      return reply({error:"Aguarde os vínculos Auth em andamento antes de mudar o projeto ou a chave protegida."},409);
    }
    if (saved?.config.serviceRoleKey && !config.serviceRoleKey) {
      const localFiles = await getD1().prepare("SELECT COUNT(*) AS total FROM supabase_storage_copies")
        .first<{ total: number }>();
      if (Number(localFiles?.total || 0) > 0 || await hasTrackedProfileDetails(getD1())) {
        return reply({error:"Remova as cópias do Supabase antes de retirar a chave protegida do servidor."},409);
      }
      const remote = await getCatalogCopyCounts();
      if (totalCatalogCopies(remote) > 0 || remote.linked_auth > 0) {
        return reply({error:"Remova os catálogos do Supabase antes de retirar a chave protegida do servidor."},409);
      }
    }
    if (saved && (saved.config.url !== config.url || saved.config.projectRef !== config.projectRef)
      && await hasTrackedProfileDetails(getD1())) {
      return reply({error:"Há uma cópia cadastral no projeto Supabase atual. Remova essa cópia antes de trocar o projeto."},409);
    }
    if (saved && (saved.config.url !== config.url || saved.config.bucket !== config.bucket)) {
      const copies = await getD1().prepare("SELECT COUNT(*) AS total FROM supabase_storage_copies")
        .first<{ total: number }>();
      if (Number(copies?.total || 0) > 0) {
        return reply({error:"Há imagens copiadas no projeto Supabase atual. Remova essas cópias antes de trocar o projeto ou o bucket."},409);
      }
    }
    if (saved?.config.url !== config.url && (await getAutoSyncStatus(getD1())).enabled) {
      return reply({error:"Pause a sincronização automática antes de trocar o projeto Supabase."},409);
    }
    if (saved && (saved.config.url !== config.url || saved.config.projectRef !== config.projectRef)
      && (await getAutoSyncStatus(getD1())).running) {
      return reply({error:"Aguarde a sincronização em andamento antes de trocar o projeto Supabase."},409);
    }
    if (saved && (saved.config.url !== config.url || saved.config.projectRef !== config.projectRef)) {
      const catalogCounts = await getCatalogCopyCounts();
      if (totalCatalogCopies(catalogCounts) > 0 || catalogCounts.linked_auth > 0) {
        return reply({error:"Há catálogos copiados no projeto Supabase atual. Remova as cópias antes de trocar o projeto."},409);
      }
    }
    await writeIntegration(config,access.user.id);
    if (!config.ativa || (saved && saved.config.url !== config.url)) {
      await setProfileDetailsAutoSyncEnabled(getD1(), false, access.user.id);
      await setAuthLinkEnabled(getD1(), false, access.user.id);
    }
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_ATUALIZADA","SUCESSO",{ambiente:config.ambiente,host:new URL(config.url).hostname,campos:Object.keys(config).filter(key=>JSON.stringify(saved?.config[key as keyof typeof config]) !== JSON.stringify(config[key as keyof typeof config]))});
    return GET();
  } catch (failure) {
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_ATUALIZADA","ERRO");
    return reply({error:failure instanceof IntegrationInputError || failure instanceof CatalogCleanupError ? failure.message : "Não foi possível salvar a integração. Confira os campos e tente novamente."},failure instanceof IntegrationInputError ? 400 : failure instanceof CatalogCleanupError ? failure.status : 503);
  }
}
export async function DELETE(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const payload = await request.json();
    if (payload?.confirm !== "REMOVER_INTEGRACAO_SUPABASE") return reply({error:"Confirme a remoção da conexão com o Supabase."},400);
    const copies = await getD1().prepare("SELECT COUNT(*) AS total FROM supabase_storage_copies")
      .first<{ total: number }>();
    if (Number(copies?.total || 0) > 0) return reply({error:"Há imagens copiadas no Supabase. Remova essas cópias antes de desligar a integração."},409);
    if (await hasTrackedProfileDetails(getD1())) return reply({error:"Há dados cadastrais copiados no Supabase. Remova a cópia antes de desligar a integração."},409);
    const sync = await getAutoSyncStatus(getD1());
    if (sync.enabled || sync.running) return reply({error:"Pause e conclua a sincronização automática antes de remover a integração."},409);
    if (await activeAuthLinkLeases(getD1())) return reply({error:"Aguarde os vínculos Auth em andamento antes de remover a integração."},409);
    const saved = await readIntegration();
    if (saved) {
      const catalogCounts = await getCatalogCopyCounts();
      if (totalCatalogCopies(catalogCounts) > 0 || catalogCounts.linked_auth > 0) {
        return reply({error:"Há comunidades, perfis ou vínculos copiados no Supabase. Remova os catálogos antes de desligar a integração."},409);
      }
    }
    await setProfileDetailsAutoSyncEnabled(getD1(), false, access.user.id);
    await setAuthLinkEnabled(getD1(), false, access.user.id);
    await getD1().prepare("DELETE FROM configuracoes WHERE chave = 'supabase_integration'").run();
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_REMOVIDA","SUCESSO",{ambiente:saved?.config.ambiente,host:saved ? new URL(saved.config.url).hostname : null});
    return reply({integration:null});
  } catch (failure) {
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_REMOVIDA","ERRO");
    return reply({error:failure instanceof CatalogCleanupError ? failure.message : "Não foi possível remover a configuração do Supabase. Tente novamente."},
      failure instanceof CatalogCleanupError ? failure.status : 503);
  }
}
