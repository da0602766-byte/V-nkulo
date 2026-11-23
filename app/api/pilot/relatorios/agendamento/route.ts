import { getD1 } from "../../../../../db";
import { reportFilters, rollingReportPeriod } from "../../../../lib/management-reports";
import { nextReportRun } from "../../../../lib/report-schedules";
import { requireTenantPermission } from "../../../../lib/tenant";

const headers = { "Cache-Control": "private, no-store" };
const denied = () => Response.json({ error: "Somente o proprietário da comunidade pode agendar relatórios." }, { status: 403, headers });

export async function GET() {
  const access = await requireTenantPermission("reports.view");
  if ("error" in access) return access.error;
  if (!access.context.isCommunityOwner) return denied();
  const schedule = await getD1().prepare(`SELECT frequencia,dias,area,grupo,situacao,proxima_execucao FROM relatorios_agendamentos
    WHERE comunidade_id=? AND usuario_id=?`).bind(access.context.comunidadeId,access.user.id).first();
  return Response.json({ schedule }, { headers });
}

export async function PUT(request: Request) {
  const access = await requireTenantPermission("reports.view");
  if ("error" in access) return access.error;
  if (!access.context.isCommunityOwner) return denied();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const db = getD1();
  const { comunidadeId } = access.context;
  if (body?.frequencia === "DESATIVADO") {
    await db.prepare("DELETE FROM relatorios_agendamentos WHERE comunidade_id=? AND usuario_id=?").bind(comunidadeId,access.user.id).run();
    return Response.json({ schedule: null }, { headers });
  }
  const frequencia = body?.frequencia;
  const dias = Number(body?.dias);
  if ((frequencia !== "SEMANAL" && frequencia !== "MENSAL") || !Number.isInteger(dias) || dias < 1 || dias > 366) {
    return Response.json({ error: "Escolha a periodicidade e um intervalo entre 1 e 366 dias." }, { status: 400, headers });
  }
  const filters = reportFilters(new URLSearchParams({ ...rollingReportPeriod(dias,new Date()),
    area: String(body?.area || ""), group: String(body?.grupo || ""), status: String(body?.situacao || "") }));
  if (!filters) return Response.json({ error: "Revise os filtros do agendamento." }, { status: 400, headers });
  const proxima_execucao = nextReportRun(frequencia);
  await db.prepare(`INSERT INTO relatorios_agendamentos(comunidade_id,usuario_id,frequencia,dias,area,grupo,situacao,proxima_execucao)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(comunidade_id,usuario_id) DO UPDATE SET frequencia=excluded.frequencia,dias=excluded.dias,
    area=excluded.area,grupo=excluded.grupo,situacao=excluded.situacao,proxima_execucao=excluded.proxima_execucao,versao=relatorios_agendamentos.versao+1`)
    .bind(comunidadeId,access.user.id,frequencia,dias,filters.area,filters.group,filters.status,proxima_execucao).run();
  return Response.json({ schedule: { frequencia,dias,area:filters.area,grupo:filters.group,situacao:filters.status,proxima_execucao } }, { headers });
}
