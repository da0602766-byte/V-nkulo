export type CentralMetric = { label: string; value: number; detail: string; href?: string };
export type CentralMinistry = { id: number; name: string; leader: string; volunteers: number | null; schedules: number; confirmed: number; absent: number; pending: number; replacements: number };
export type CentralSchedule = { id: number; title: string; ministry: string; startsAt: string; status: string; pending: number; replacements: number };
export type CentralNotice = { id: number; title: string; message: string; area: string; ministry: string; createdAt: string; read: boolean; destination: string };
export type CentralCellReport = { id: number; name: string; date: string; happened: boolean; attendees: number; visitors: number; notes: string };
export type CentralData = {
  community: { id: number; name: string }; generatedAt: string;
  period: { days: number; from: string; to: string };
  scope: "community" | "leadership" | "personal";
  scopeLabel: string; pastoralLocked: boolean;
  capabilities: { ministries: boolean; schedules: boolean; events: boolean; cellReports: boolean };
  areas: Array<{ label: string; description: string; href: string }>;
  events: Array<{ id: number; title: string; startsAt: string; location: string; response: string | null }>;
  metrics: CentralMetric[]; ministries: CentralMinistry[]; schedules: CentralSchedule[];
  notices: CentralNotice[]; unread: number | null; cellReports: CentralCellReport[];
  limits: { ministries: boolean; schedules: boolean; notices: boolean; cellReports: boolean };
  errors: Array<{ section: string; message: string }>;
};

// Treat cell text as data when opened by Excel or another spreadsheet app.
export function centralCsv(rows: Array<Array<string | number>>) {
  return "\uFEFF" + rows.map(row => row.map(value => {
    const text = String(value ?? "");
    return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
  }).join(";")).join("\r\n");
}

export function centralReportRows(data: CentralData, ministries: CentralMinistry[] = data.ministries) {
  const rows: Array<Array<string | number>> = [
    ["Comunidade", data.community.name], ["Escopo", data.scopeLabel],
    ["Período das escalas", data.period.from, data.period.to], ["Atualizado em", data.generatedAt],
    ["Observação", "Confirmação não comprova presença. Pendências referem-se a escalas futuras."],
    [], ["Indicador atual do escopo", "Valor", "Referência"],
    ...data.metrics.map(m => [m.label, m.value, m.detail]),
    [], ["Ministério", "Responsável", "Integrantes ativos", "Escalas no período", "Confirmações", "Ausências registradas", "Confirmações pendentes futuras", "Substituições solicitadas futuras"],
  ];
  ministries.forEach(m => rows.push([m.name, m.leader, m.volunteers ?? "Não disponível", ...[m.schedules, m.confirmed, m.absent, m.pending, m.replacements].map(value => data.capabilities.schedules ? value : "Não disponível")]));
  if (data.limits.ministries) rows.push(["Limite", "Primeiros 200 ministérios; consulte a área de ministérios para continuar."]);
  if (data.cellReports.length) {
    rows.push([], ["Célula", "Data", "Encontro realizado", "Presentes", "Visitantes", "Observações"]);
    data.cellReports.forEach(r => rows.push([r.name, r.date, r.happened ? "Sim" : "Não", r.attendees, r.visitors, r.notes]));
    if (data.limits.cellReports) rows.push(["Limite", "50 relatórios de células mais recentes no período."]);
  }
  data.errors.forEach(e => rows.push(["Consulta indisponível", e.message]));
  return rows;
}

export function safeCentralDestination(value: unknown) {
  if (typeof value !== "string" || !/^\/painel(?:[?#]|$)/.test(value) || /[\\\r\n]/.test(value)) return "/painel?view=avisos";
  return value;
}
