import { getD1 } from "../../../../../../db";
import { canViewSchedule } from "../../../../../lib/ministry-access";
import { pdfResponse } from "../../../../../lib/pdf";
import { getSecretaryScheduleDetail } from "../../../../../lib/secretary-schedule";
import { requireTenantPermission } from "../../../../../lib/tenant";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireTenantPermission("schedules.view");
  if ("error" in access) return access.error;
  const scheduleId = Number((await context.params).id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return Response.json({ error: "Escala inválida." }, { status: 400 });
  }
  const db = getD1();
  if (
    !(await canViewSchedule(
      db,
      access.context,
      access.user.id,
      scheduleId,
    ))
  ) {
    return Response.json({ error: "Escala não encontrada." }, { status: 404 });
  }
  const schedule = await getSecretaryScheduleDetail(
    db,
    scheduleId,
    access.context.comunidadeId,
  );
  if (!schedule) {
    return Response.json({ error: "Escala não encontrada." }, { status: 404 });
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "SECRETARIA_V472_PDF_EXPORTADO",
    "SUCESSO",
    { escalaId: scheduleId },
  );
  const params = new URL(request.url).searchParams;
  return pdfResponse(
    `escala-secretaria-${scheduleId}.pdf`,
    `Escala ministerial — ${schedule.titulo}`,
    [
      `Comunidade: ${schedule.comunidade_nome}`,
      `Ministério: ${schedule.ministerio_nome}`,
      `Responsável: ${schedule.responsavel_nome || "Não definido"}`,
      `Início: ${formatDate(schedule.inicia_em)}`,
      `Término: ${formatDate(schedule.termina_em)}`,
      `Local: ${schedule.local || "Não informado"}`,
      `Status: ${schedule.status}`,
      "",
      "EQUIPE",
      ...formatAssignmentsByTeam(schedule),
      "",
      "REPERTÓRIO",
      ...(schedule.repertorio.length
        ? schedule.repertorio.map((item, index) => `${index + 1}. ${item}`)
        : ["Nenhum item informado."]),
      "",
      "LINKS E RECURSOS",
      ...(schedule.links_recursos.length
        ? schedule.links_recursos.map(
            (item, index) => `${index + 1}. ${item.titulo} — ${item.url}`,
          )
        : ["Nenhum link informado."]),
      "",
      "CHECKLIST",
      ...(schedule.checklist.length
        ? schedule.checklist.map(
            (item, index) =>
              `${index + 1}. ${item.tarefa} — ${item.responsavel_nome || "Equipe"} — ${item.status}`,
          )
        : ["Nenhuma responsabilidade informada."]),
      "",
      `Observações: ${schedule.observacoes || "Nenhuma."}`,
    ],
    params.get("download") !== "0",
  );
}

function formatDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime())
    ? String(value || "")
    : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatAssignmentsByTeam(schedule: Awaited<ReturnType<typeof getSecretaryScheduleDetail>>) {
  if (!schedule) return ["Nenhum integrante informado."];
  const knownTeamIds = new Set(schedule.equipes.map((team) => team.equipe_id));
  const groups = [
    ...schedule.equipes.map((team) => ({
      title: `${team.equipe_nome}${team.funcao ? ` — Função/local: ${team.funcao}` : ""}`,
      assignments: schedule.designacoes.filter(
        (assignment) => Number(assignment.equipe_id || 0) === team.equipe_id,
      ),
    })),
    {
      title: "Integrantes livres",
      assignments: schedule.designacoes.filter(
        (assignment) => !knownTeamIds.has(Number(assignment.equipe_id || 0)),
      ),
    },
  ].filter((group) => group.assignments.length > 0);
  return groups.length
    ? groups.flatMap((group) => [
        group.title,
        ...group.assignments.map(
          (item, index) => `  ${index + 1}. ${item.nome} — ${item.funcao} (${item.status})`,
        ),
      ])
    : ["Nenhum integrante informado."];
}
