import { getD1 } from "../../../../../../db";
import { canViewSchedule } from "../../../../../lib/ministry-access";
import { getSecretaryScheduleDetail } from "../../../../../lib/secretary-schedule";
import { requireTenantPermission } from "../../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
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
  const description = [
    `Ministério: ${schedule.ministerio_nome}`,
    `Responsável: ${schedule.responsavel_nome || "Não definido"}`,
    schedule.observacoes || "",
  ]
    .filter(Boolean)
    .join("\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VÍNKULO//Secretaria Ministerial//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:secretaria-${schedule.id}@adote-gestao`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(new Date(schedule.inicia_em))}`,
    `DTEND:${toIcsDate(new Date(schedule.termina_em))}`,
    `SUMMARY:${escapeIcs(schedule.titulo)}`,
    `LOCATION:${escapeIcs(schedule.local || "")}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="escala-${scheduleId}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

function toIcsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: unknown) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}
