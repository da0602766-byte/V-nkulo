import { getD1 } from "../../../../../../db";
import {
  canAccessDiaconiaSchedule,
  closeExpiredDiaconiaSchedules,
} from "../../../../../lib/diaconia-access";
import { pdfResponse } from "../../../../../lib/pdf";
import { requireTenantPermission } from "../../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireTenantPermission("diaconia.view");
  if ("error" in access) return access.error;
  const scheduleId = Number((await context.params).id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return Response.json({ error: "Escala inválida." }, { status: 400 });
  }
  const db = getD1();
  await closeExpiredDiaconiaSchedules(db, access.context.comunidadeId);
  if (
    !(await canAccessDiaconiaSchedule(
      db,
      access.context,
      access.user.id,
      scheduleId,
    ))
  ) {
    return Response.json({ error: "Relatório não encontrado." }, { status: 404 });
  }
  const schedule = await db
    .prepare(
      `SELECT s.titulo, s.inicia_em, s.termina_em, s.local,
        m.nome AS ministerio_nome, r.resumo, r.encerrado_em
       FROM escalas_ministerio s
       JOIN ministerios_comunidade m
         ON m.id = s.ministerio_id
        AND m.comunidade_id = s.comunidade_id
       JOIN diaconia_relatorios r
         ON r.escala_id = s.id
        AND r.comunidade_id = s.comunidade_id
       WHERE s.id = ? AND s.comunidade_id = ?
       LIMIT 1`,
    )
    .bind(scheduleId, access.context.comunidadeId)
    .first<Record<string, unknown>>();
  if (!schedule) {
    return Response.json(
      { error: "O relatório ainda não foi finalizado." },
      { status: 404 },
    );
  }
  const items = await db
    .prepare(
      `SELECT ci.tarefa, ci.status, ci.observacao,
        COALESCE(su.nome, ci.substituto_externo_nome, '') AS substituto
       FROM ministerio_checklist_itens ci
       LEFT JOIN usuarios su ON su.id = ci.substituto_usuario_id
       WHERE ci.escala_id = ? AND ci.comunidade_id = ?
       ORDER BY ci.id ASC`,
    )
    .bind(scheduleId, access.context.comunidadeId)
    .all<Record<string, unknown>>();
  const params = new URL(request.url).searchParams;
  return pdfResponse(
    `relatorio-escala-${scheduleId}.pdf`,
    `Relatório da escala — ${schedule.titulo}`,
    [
      `Comunidade: ${access.context.comunidadeNome}`,
      `Equipe: ${schedule.ministerio_nome}`,
      `Período: ${formatDate(schedule.inicia_em)} até ${formatDate(schedule.termina_em)}`,
      `Local: ${schedule.local || "Não informado"}`,
      `Finalizado em: ${formatDate(schedule.encerrado_em)}`,
      "",
      "RESUMO",
      String(schedule.resumo || ""),
      "",
      "CHECKLIST",
      ...items.results.flatMap((item, index) => [
        `${index + 1}. ${item.tarefa} — ${statusLabel(item.status)}`,
        ...(item.substituto ? [`Substituto: ${item.substituto}`] : []),
        ...(item.observacao ? [`Observação: ${item.observacao}`] : []),
      ]),
      "",
      "Envio externo por e-mail ou WhatsApp: não habilitado neste piloto.",
    ],
    params.get("download") === "1",
  );
}

function formatDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime())
    ? String(value || "")
    : date.toLocaleString("pt-BR");
}

function statusLabel(value: unknown) {
  return (
    {
      FEITO: "Feito",
      NAO_FEITO: "Não feito",
      SUBSTITUIDO: "Substituído",
      PENDENTE: "Pendente",
    }[String(value || "")] || String(value || "")
  );
}
