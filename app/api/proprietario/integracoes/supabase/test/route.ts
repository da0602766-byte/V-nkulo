import { getD1 } from "../../../../../../db";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { readIntegration, verifyIntegration, writeIntegration } from "../../../../../lib/supabase-integration";
import { reply, requireIntegrationOwner } from "../route";

export async function POST(request: Request) {
  const access=await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  let saved: Awaited<ReturnType<typeof readIntegration>>=null;
  try {
    const body=await request.json();
    if (body?.confirm !== true) return reply({error:"Confirme explicitamente o teste da conexão."},400);
    saved=await readIntegration();
    if (!saved) return reply({error:"Salve a configuração do Supabase antes de testar."},404);
    const check=await verifyIntegration(saved.config);
    saved.config.lastCheck=check;
    await writeIntegration(saved.config,access.user.id);
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_TESTADA",check.ok ? "SUCESSO" : "ERRO",{ambiente:saved.config.ambiente,host:new URL(saved.config.url).hostname,latenciaMs:check.latencyMs,statusAuth:check.authStatus,statusRest:check.restStatus,statusStorage:check.storageStatus,bucketEncontrado:check.bucketFound});
    return reply({check},check.ok ? 200 : 422);
  } catch {
    await recordTenantAudit(getD1(),{comunidadeId:null},access.user.id,"INTEGRACAO_SUPABASE_TESTADA","ERRO",{ambiente:saved?.config.ambiente,host:saved ? new URL(saved.config.url).hostname : null});
    return reply({error:"O teste da conexão não pôde ser concluído."},503);
  }
}
