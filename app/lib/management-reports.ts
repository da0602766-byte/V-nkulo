export const reportStatuses = {
  RECEBIDO: "Recebido",
  PENDENTE: "Atrasado",
  AGUARDANDO_LIDER: "Em revisão",
  CORRECAO_SOLICITADA: "Correção solicitada",
  ENVIADO_PASTOR: "Encaminhado",
} as const;

export type ReportStatus = keyof typeof reportStatuses;
export type ReportArea = "cells" | "parking";
export type ReportArchiveRow = {
  id: number; groupId: number; area: ReportArea; groupName: string; title: string;
  day: string; responsible: string; status: ReportStatus; expected: number;
  notes: string; firstCount: number | null; secondCount: number | null; thirdCount: number | null;
  happened: number | null;
};
export type ReportArchiveResult = {
  rows: ReportArchiveRow[]; total: number; page: number; pageSize: number;
  period: { from: string; to: string }; metrics: {
    expected: number; received: number; overdue: number; reviewing: number; correcting: number;
    attendance: number; meetings: number;
  };
  comparison?: {
    previous: Pick<ReportArchiveResult, "period" | "metrics">;
    visitors: { current: VisitorCohort; previous: VisitorCohort } | null;
  };
};
export type VisitorCohort = { registered: number; integrated: number };

const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const dayMs = 86_400_000;

export function reportFilters(query: URLSearchParams, now = new Date()) {
  const to = query.get("to") || dayFormatter.format(now);
  const start = Date.parse(`${to}T12:00:00Z`);
  const from = query.get("from") || (Number.isFinite(start) ? new Date(start - 29 * dayMs).toISOString().slice(0,10) : "");
  const day = (value: string) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? date.getTime() : NaN;
  };
  const duration = (day(to) - day(from)) / dayMs + 1;
  const area = query.get("area") || "";
  const status = query.get("status") || "";
  const page = Number(query.get("page") || "1");
  if (!Number.isInteger(duration) || duration < 1 || duration > 366 || !["", "cells", "parking"].includes(area) ||
      (status && !Object.hasOwn(reportStatuses,status)) || !Number.isSafeInteger(page) || page < 1 || page > 10_000) return null;
  return { from, to, duration, area, status, page, queue: query.get("queue") === "1", group: (query.get("group") || "").trim().slice(0,120) };
}

export type ReportFilters = NonNullable<ReturnType<typeof reportFilters>>;

export function previousReportPeriod(filters: ReportFilters) {
  const start = Date.parse(`${filters.from}T12:00:00Z`);
  return { ...filters,
    from: new Date(start - filters.duration * dayMs).toISOString().slice(0,10),
    to: new Date(start - dayMs).toISOString().slice(0,10),
  };
}

export function rollingReportPeriod(days: number, now: Date) {
  const to = dayFormatter.format(now);
  const end = Date.parse(`${to}T12:00:00Z`);
  return { from: new Date(end - (days - 1) * dayMs).toISOString().slice(0,10), to };
}

export function reportDestination(row: ReportArchiveRow) {
  return row.area === "parking"
    ? `/painel?view=estacionamento&relatorio=${row.id}`
    : `/painel?view=celulas&celula=${row.groupId}&aba=relatorio${row.id > 0 ? `&relatorio=${row.id}` : `&data=${row.day}`}`;
}

export function reportArchiveRows(data: ReportArchiveResult) {
  return [["Área", "Grupo", "Registro", "Data", "Responsável", "Situação", "Encontro realizado", "Presentes", "Visitantes do encontro", "Entradas", "Saídas", "Ocorrências", "Observações"],
    ...data.rows.map(row => [row.area === "cells" ? "Células" : "Estacionamento",row.groupName,row.title,row.day,row.responsible,reportStatuses[row.status],
      row.happened === null ? "" : row.happened ? "Sim" : "Não",
      row.area === "cells" ? row.firstCount ?? "" : "", row.area === "cells" ? row.secondCount ?? "" : "",
      row.area === "parking" ? row.firstCount ?? "" : "", row.area === "parking" ? row.secondCount ?? "" : "",
      row.area === "parking" ? row.thirdCount ?? "" : "", row.notes])];
}
