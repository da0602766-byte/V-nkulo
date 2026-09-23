import { getD1 } from "../../../../../../db";
import { getAutoSyncStatus } from "../../../../../lib/supabase-auto-sync";
import { getScheduleStatus, installSchedule } from "../../../../../lib/supabase-schedule";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try { return reply({ status: await getScheduleStatus(getD1()) }); }
  catch { return reply({ error: "Não foi possível consultar o agendamento." }, 503); }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { confirm?: boolean };
    if (body?.confirm !== true) return reply({ error: "Confirme a ativação do agendamento." }, 400);
    if (!(await getAutoSyncStatus(getD1())).enabled) return reply({ error: "Ative primeiro a sincronização automática." }, 409);
    const status = await installSchedule(getD1());
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_AGENDAMENTO", "SUCESSO", { jobId: status.jobId });
    return reply({ status });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_AGENDAMENTO", "ERRO");
    return reply({ error: error instanceof Error ? error.message : "Não foi possível ativar o agendamento." }, 503);
  }
}
