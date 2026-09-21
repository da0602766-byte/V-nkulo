import { getD1 } from "../../../../../db";
import { getSessionUser } from "../../../../lib/local-auth";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { IntegrationInputError, parseIntegration, publicIntegration, readIntegration, writeIntegration } from "../../../../lib/supabase-integration";

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
    await writeIntegration(config,access.user.id);
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_ATUALIZADA","SUCESSO",{ambiente:config.ambiente,host:new URL(config.url).hostname,campos:Object.keys(config).filter(key=>JSON.stringify(saved?.config[key as keyof typeof config]) !== JSON.stringify(config[key as keyof typeof config]))});
    return GET();
  } catch (failure) {
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_ATUALIZADA","ERRO");
    return reply({error:failure instanceof IntegrationInputError ? failure.message : "Não foi possível salvar a integração. Confira os campos e tente novamente."},failure instanceof IntegrationInputError ? 400 : 503);
  }
}
export async function DELETE(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const payload = await request.json();
    if (payload?.confirm !== "REMOVER_INTEGRACAO_SUPABASE") return reply({error:"Confirme a remoção da conexão com o Supabase."},400);
    const saved = await readIntegration();
    await getD1().prepare("DELETE FROM configuracoes WHERE chave = 'supabase_integration'").run();
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_REMOVIDA","SUCESSO",{ambiente:saved?.config.ambiente,host:saved ? new URL(saved.config.url).hostname : null});
    return reply({integration:null});
  } catch {
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_REMOVIDA","ERRO");
    return reply({error:"Não foi possível remover a configuração do Supabase. Tente novamente."},503);
  }
}
