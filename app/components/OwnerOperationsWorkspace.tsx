"use client";

import { useMemo, useState } from "react";
import OwnerPublicationWorkspace from "./OwnerPublicationWorkspace";

export type OwnerOperationsScreen =
  | "passwords"
  | "deleted"
  | "finance"
  | "realtime"
  | "performance"
  | "publication"
  | "incidents";

const communityNames = ["Comunidade Aurora", "Vila Esperança", "São Miguel", "Caminho Vivo"];

const passwordRows = [
  { id: 1, solicitante: "Marina Costa", comunidade: communityNames[0], solicitado: "13/09/2026 08:42", status: "EM_ANALISE", expira: "—", tentativas: 1, analisado: "Você" },
  { id: 2, solicitante: "Rafael Lima", comunidade: communityNames[1], solicitado: "12/09/2026 17:10", status: "LINK_ENVIADO", expira: "13/09 · 17:40", tentativas: 2, analisado: "Ana Souza" },
  { id: 3, solicitante: "Bianca Alves", comunidade: communityNames[2], solicitado: "12/09/2026 11:06", status: "CONCLUIDO", expira: "—", tentativas: 1, analisado: "Você" },
];

const deletedRows = [
  { id: 1, ref: "usr_7f3a91c2", comunidade: communityNames[0], perfil: "MEMBRO", motivo: "Solicitado pela pessoa", origem: "AUTOATENDIMENTO", excluido: "11/09/2026", restauravel: "25/09/2026" },
  { id: 2, ref: "usr_55bd20a1", comunidade: communityNames[3], perfil: "LÍDER", motivo: "Conta duplicada", origem: "PROPRIETÁRIO", excluido: "03/09/2026", restauravel: "17/09/2026" },
  { id: 3, ref: "usr_1ca8d441", comunidade: "Sem vínculo", perfil: "MEMBRO", motivo: "Solicitado pela pessoa", origem: "AUTOATENDIMENTO", excluido: "18/08/2026", restauravel: "01/09/2026" },
];

const charges = [
  { id: 1, comunidade: communityNames[0], plano: "Comunidade Plus", competencia: "Set/2026", valor: 18990, desconto: 0, status: "PENDENTE", vence: "20/09/2026" },
  { id: 2, comunidade: communityNames[1], plano: "Essencial", competencia: "Set/2026", valor: 9900, desconto: 990, status: "PAGA", vence: "10/09/2026" },
  { id: 3, comunidade: communityNames[2], plano: "Comunidade Plus", competencia: "Ago/2026", valor: 18990, desconto: 0, status: "VENCIDA", vence: "20/08/2026" },
  { id: 4, comunidade: communityNames[3], plano: "Essencial", competencia: "Set/2026", valor: 9900, desconto: 0, status: "PENDENTE", vence: "28/09/2026" },
];

const incidentRows = [
  { id: 1, gravidade: "CRITICA", titulo: "Falhas intermitentes no login", area: "Autenticação", ocorrencias: 4, comunidades: 7, ultima: "13/09 · 09:18", status: "EM_TRATAMENTO", descricao: "Aumento de recusas após a rotação do token de sessão.", historico: ["09:18 · token expirado", "08:57 · pico de recusas", "08:41 · primeiro alerta"] },
  { id: 2, gravidade: "ALTA", titulo: "Fila de notificações atrasada", area: "Notificações", ocorrencias: 2, comunidades: 3, ultima: "12/09 · 18:24", status: "ABERTO", descricao: "Entrega acima do limite de 90 segundos para parte dos dispositivos.", historico: ["18:24 · atraso detectado", "17:59 · fila cresceu"] },
  { id: 3, gravidade: "MEDIA", titulo: "Imagem de perfil rejeitada", area: "Armazenamento", ocorrencias: 1, comunidades: 1, ultima: "12/09 · 14:02", status: "RESOLVIDO", descricao: "Formato HEIC não era aceito no fluxo de prévia.", historico: ["14:02 · correção aplicada"] },
];


function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function statusLabel(status: string) { return status.replaceAll("_", " "); }
function Status({ value, tone = "neutral" }: { value: string; tone?: string }) { return <span className={`ops-status ${tone}`}>{statusLabel(value)}</span>; }
function toneFor(value: string) { return ["PAGA", "CONCLUIDO", "RESOLVIDO", "SUCESSO"].includes(value) ? "success" : ["VENCIDA", "CRITICA", "ERRO", "NEGADO"].includes(value) ? "danger" : ["PENDENTE", "ABERTO", "ALTA"].includes(value) ? "warning" : "info"; }
function Section({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; children?: React.ReactNode }) { return <section className="ops-section"><header className="ops-section-heading"><div><p className="pilot-kicker">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div>{children}</header></section>; }
function Metrics({ items }: { items: Array<[string, string, string?]> }) { return <div className="ops-metrics">{items.map(([label, value, detail]) => <article key={label}><small>{label}</small><strong>{value}</strong>{detail && <p>{detail}</p>}</article>)}</div>; }
function Chart({ values, second, labels = ["Abr", "Mai", "Jun", "Jul", "Ago", "Set"] }: { values: number[]; second?: number[]; labels?: string[] }) {
  const width = 680; const height = 180; const all = second ? [...values, ...second] : values; const max = Math.max(...all, 1); const points = (series: number[]) => series.map((value, index) => `${(index / Math.max(series.length - 1, 1)) * width},${height - (value / max) * (height - 22) - 8}`).join(" ");
  return <div className="ops-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de tendência"><polyline className="ops-chart-area" points={`0,${height} ${points(values)} ${width},${height}`} /><polyline className="ops-chart-line" points={points(values)} />{second && <polyline className="ops-chart-line ops-chart-line-second" points={points(second)} />}</svg><div className="ops-chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div></div>;
}
function TableNote({ children }: { children: React.ReactNode }) { return <p className="ops-table-note">{children}</p>; }

export default function OwnerOperationsWorkspace({ screen }: { screen: OwnerOperationsScreen }) {
  if (screen === "passwords") return <PasswordWorkspace />;
  if (screen === "deleted") return <DeletedWorkspace />;
  if (screen === "finance") return <FinanceWorkspace />;
  if (screen === "realtime") return <RealtimeWorkspace />;
  if (screen === "performance") return <PerformanceWorkspace />;
  if (screen === "publication") return <OwnerPublicationWorkspace />;
  return <IncidentWorkspace />;
}

function PasswordWorkspace() {
  const [rows, setRows] = useState(passwordRows);
  const [link, setLink] = useState("");
  return <div className="ops-stack"><Section eyebrow="ACESSO SEGURO" title="Redefinições de senha" text="Acompanhe cada solicitação sem expor credenciais ou links permanentes."><Status value="atualizado agora" tone="success" /></Section><div className="ops-stepper">{["Solicitado", "Em análise", "Aprovado / recusado", "Link enviado", "Concluído / expirado"].map((label, index) => <div className={index < 2 ? "done" : index === 2 ? "current" : ""} key={label}><b>{index + 1}</b><span>{label}</span></div>)}</div>{link && <div className="ops-alert success"><strong>Link gerado uma única vez</strong><span>{link}</span><small>Este link expira em 30 minutos. Copie-o agora e não o reutilize.</small></div>}<section className="ops-panel"><div className="ops-panel-title"><div><h3>Fila de solicitações</h3><p>As ações ficam registradas na auditoria do sistema.</p></div></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Solicitante</th><th>Comunidade</th><th>Solicitado em</th><th>Status</th><th>Expira em</th><th>Tentativas</th><th>Analisado por</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label="Solicitante"><strong>{row.solicitante}</strong></td><td data-label="Comunidade">{row.comunidade}</td><td data-label="Solicitado em">{row.solicitado}</td><td data-label="Status"><Status value={row.status} tone={toneFor(row.status)} /></td><td data-label="Expira em">{row.expira}</td><td data-label="Tentativas">{row.tentativas}</td><td data-label="Analisado por">{row.analisado}</td><td className="ops-actions">{row.status === "EM_ANALISE" && <button type="button" onClick={() => setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "LINK_ENVIADO", expira: "13/09 · 18:30" } : item))}>Aprovar e gerar</button>}{row.status === "LINK_ENVIADO" && <button type="button" className="secondary" onClick={() => setLink(`https://vinkulo.app/redefinir/${row.id}-8f2a`)}>Ver link uma vez</button>}</td></tr>)}</tbody></table></div><TableNote>Links nunca aparecem novamente depois de visualizados.</TableNote></section></div>;
}

function DeletedWorkspace() {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const visible = deletedRows.filter((row) => !removed.includes(row.id));
  return <div className="ops-stack"><Section eyebrow="CICLO DE VIDA" title="Contas excluídas" text="Referências técnicas preservam a privacidade durante o período de restauração." /><Metrics items={[["Total", "27", "últimos 90 dias"], ["Restauráveis", "8", "dentro do prazo legal"]]} /><section className="ops-panel"><div className="ops-panel-title"><div><h3>Registros anonimizados</h3><p>Nunca exibimos nome ou e-mail nesta área.</p></div><Status value="retenção controlada" tone="info" /></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Referência técnica</th><th>Comunidade</th><th>Perfil</th><th>Motivo</th><th>Origem</th><th>Excluído em</th><th>Restaurável até</th><th /></tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td data-label="Referência"><code>{row.ref}</code></td><td data-label="Comunidade">{row.comunidade}</td><td data-label="Perfil">{row.perfil}</td><td data-label="Motivo">{row.motivo}</td><td data-label="Origem">{row.origem}</td><td data-label="Excluído em">{row.excluido}</td><td data-label="Restaurável até">{row.restauravel}</td><td className="ops-actions">{row.id < 3 && confirming !== row.id && <button type="button" onClick={() => setConfirming(row.id)}>Restaurar</button>}{confirming === row.id && <span className="ops-inline-confirm"><small>Confirmar restauração?</small><button type="button" onClick={() => { setRemoved((current) => [...current, row.id]); setConfirming(null); }}>Sim</button><button type="button" className="secondary" onClick={() => setConfirming(null)}>Não</button></span>}{confirming !== row.id && <button type="button" className="danger" onClick={() => setConfirming(row.id)}>Purgar</button>}</td></tr>)}</tbody></table></div><TableNote>Purgar é definitivo e remove qualquer possibilidade de restauração.</TableNote></section></div>;
}

function FinanceWorkspace() {
  const [filter, setFilter] = useState("TODOS");
  const [paid, setPaid] = useState<number[]>([]);
  const visible = charges.filter((row) => filter === "TODOS" || row.status === filter).filter((row) => !paid.includes(row.id));
  return <div className="ops-stack"><Section eyebrow="CONTROLE FINANCEIRO" title="Financeiro" text="Cobranças administrativas por comunidade, plano e competência."><Status value="sem gateway conectado" tone="warning" /></Section><Metrics items={[["Receita do período", "R$ 42.680", "paga em setembro"], ["A receber", "R$ 29.790", "3 cobranças pendentes"], ["Vencido", "R$ 18.990", "1 comunidade inadimplente"], ["Inadimplentes", "1", "ação recomendada"]]} /><section className="ops-panel"><div className="ops-panel-title"><div><h3>Cobranças</h3><p>Pagamentos registrados administrativamente — sem gateway conectado.</p></div><label className="ops-select-label">Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="TODOS">Todos</option><option value="PENDENTE">Pendentes</option><option value="PAGA">Pagas</option><option value="VENCIDA">Vencidas</option></select></label></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Comunidade</th><th>Plano</th><th>Competência</th><th>Valor</th><th>Desconto</th><th>Status</th><th>Vence em</th><th /></tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td data-label="Comunidade"><strong>{row.comunidade}</strong></td><td data-label="Plano">{row.plano}</td><td data-label="Competência">{row.competencia}</td><td data-label="Valor">{money(row.valor)}</td><td data-label="Desconto">{money(row.desconto)}</td><td data-label="Status"><Status value={row.status} tone={toneFor(row.status)} /></td><td data-label="Vence em">{row.vence}</td><td className="ops-actions">{row.status === "PENDENTE" && <button type="button" onClick={() => setPaid((current) => [...current, row.id])}>Marcar paga</button>}{row.status === "VENCIDA" && <button type="button" className="danger" onClick={() => setPaid((current) => [...current, row.id])}>Cancelar / estornar</button>}</td></tr>)}</tbody></table></div></section><section className="ops-panel"><div className="ops-panel-title"><div><h3>Renovações próximas</h3><p>45 dias de visibilidade para planejar a comunicação.</p></div></div><div className="ops-renewals">{[[communityNames[0], "20/09/2026", "Comunidade Plus"], [communityNames[3], "28/09/2026", "Essencial"], [communityNames[1], "10/10/2026", "Essencial"]].map(([name, date, plan]) => <article key={name}><span>↻</span><div><strong>{name}</strong><small>{plan}</small></div><time>{date}</time></article>)}</div></section></div>;
}

function RealtimeWorkspace() {
  return <div className="ops-stack"><Section eyebrow="OBSERVABILIDADE" title="Tempo real" text="Presença e atividade agregadas, sem conteúdo de publicações."><span className="ops-live"><i /> AO VIVO · atualiza a cada 30s</span></Section><Metrics items={[["Online agora", "186", "presença ativa"], ["Sessões ativas", "142", "em todos os dispositivos"], ["Pico simultâneo", "231", "últimas 24 horas"], ["Duração média", "18 min", "aproximada"]]} /><div className="ops-chart-grid"><section className="ops-panel"><div className="ops-panel-title"><div><h3>Ativos por hora</h3><p>Janela móvel de 24 horas.</p></div><button type="button" className="secondary">Atualizar</button></div><Chart values={[72, 61, 48, 39, 34, 41, 64, 88, 122, 151, 174, 186, 179, 164, 158, 171, 189, 201, 182, 148, 121, 108, 94, 82]} labels={["00h", "04h", "08h", "12h", "16h", "20h", "24h"]} /></section><section className="ops-panel"><div className="ops-panel-title"><div><h3>Ativos por dia</h3><p>Últimos 14 dias.</p></div></div><Chart values={[113, 129, 121, 144, 151, 138, 164, 172, 158, 181, 176, 192, 186, 186]} labels={["D−13", "D−10", "D−7", "D−4", "Hoje"]} /></section></div><section className="ops-panel"><div className="ops-panel-title"><div><h3>Atividade por comunidade</h3><p>Somente contagem agregada.</p></div></div><div className="ops-community-bars">{[[communityNames[0], 64], [communityNames[1], 47], [communityNames[2], 38], [communityNames[3], 21]].map(([name, count]) => <div key={String(name)}><span><strong>{name}</strong><b>{count}</b></span><i><em style={{ width: `${Number(count) / 64 * 100}%` }} /></i></div>)}</div></section></div>;
}

function PerformanceWorkspace() {
  const [period, setPeriod] = useState("30 dias");
  return <div className="ops-stack"><Section eyebrow="SAÚDE DA PLATAFORMA" title="Desempenho" text="Falhas conhecidas, tendência e incidentes em um mesmo contexto."><label className="ops-select-label">Período<select value={period} onChange={(event) => setPeriod(event.target.value)}>{["7 dias", "14 dias", "30 dias", "90 dias"].map((item) => <option key={item}>{item}</option>)}</select></label></Section><Metrics items={[["Falhas", "23", "−18% vs. período anterior"], ["Taxa de falhas", "0,42%", period], ["Incidentes abertos", "3", "1 crítico"], ["Bloqueados agora", "11", "autenticação"]]} /><section className="ops-panel"><div className="ops-panel-title"><div><h3>Tendência de falhas</h3><p>O ponto em vermelho indica uma anomalia detectada.</p></div></div><Chart values={[18, 22, 14, 19, 11, 13, 8, 9, 12, 7, 6, 5]} labels={["01", "05", "10", "15", "20", "25", "30"]} /><div className="ops-anomaly"><i /> 08/09 · pico de falhas no login após expiração de sessão</div></section><div className="ops-two-col"><section className="ops-panel"><div className="ops-panel-title"><div><h3>Onde as falhas acontecem</h3><p>Eventos com erro ou acesso negado.</p></div></div><div className="ops-list">{[["Login · token expirado", "ERRO", "12", "13/09 · 09:18"], ["Upload · formato inválido", "NEGADO", "7", "12/09 · 14:02"], ["Convite · limite atingido", "ERRO", "4", "11/09 · 18:31"]].map(([event, result, total, last]) => <div key={event}><span><strong>{event}</strong><small>{last}</small></span><Status value={result} tone={toneFor(result)} /><b>{total}</b></div>)}</div></section><section className="ops-panel"><div className="ops-panel-title"><div><h3>Incidentes por área</h3><p>Gravidade atual.</p></div></div><div className="ops-list">{[["Autenticação", "CRITICA", "1"], ["Notificações", "ALTA", "1"], ["Armazenamento", "MEDIA", "1"]].map(([area, severity, total]) => <div key={area}><span><strong>{area}</strong><small>em acompanhamento</small></span><Status value={severity} tone={toneFor(severity)} /><b>{total}</b></div>)}</div></section></div><section className="ops-panel"><div className="ops-panel-title"><div><h3>Lacunas conhecidas</h3><p>O painel deixa claro quando a fonte ainda não está conectada.</p></div></div><div className="ops-gap-grid">{[["Latência", "APM necessário"], ["Uptime", "monitor externo necessário"], ["Erros 4xx/5xx", "telemetria HTTP necessária"], ["CPU / memória", "métrica do runtime necessária"], ["Consultas lentas", "profiling do banco necessário"], ["Comparação entre versões", "histórico de releases necessário"]].map(([name, source]) => <article key={name}><strong>{name}</strong><small>fonte necessária: {source}</small></article>)}</div></section></div>;
}


function IncidentWorkspace() {
  const [status, setStatus] = useState("TODOS");
  const [severity, setSeverity] = useState("TODOS");
  const [resolving, setResolving] = useState<number | null>(null);
  const [resolved, setResolved] = useState<number[]>([]);
  const filtered = useMemo(() => incidentRows.filter((row) => !resolved.includes(row.id)).filter((row) => status === "TODOS" || row.status === status).filter((row) => severity === "TODOS" || row.gravidade === severity), [resolved, severity, status]);
  return <div className="ops-stack"><Section eyebrow="RESPOSTA OPERACIONAL" title="Incidentes" text="Priorize impacto, acompanhe recorrência e deixe a resolução registrada." /><Metrics items={[["Críticos em aberto", "1", "ação imediata"], ["Altos em aberto", "1", "em acompanhamento"], ["Em tratamento", "2", "com responsável"], ["Recorrentes", "2", "mais de uma ocorrência"]]} /><section className="ops-panel"><div className="ops-filter-row"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>TODOS</option><option>ABERTO</option><option>EM_TRATAMENTO</option><option>RESOLVIDO</option></select></label><label>Gravidade<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>TODOS</option><option>CRITICA</option><option>ALTA</option><option>MEDIA</option></select></label><label className="ops-search">Buscar<input placeholder="Área ou título" /></label></div><div className="ops-incident-list">{filtered.map((row) => <details className={`ops-incident ${row.gravidade === "CRITICA" ? "critical" : ""}`} key={row.id}><summary><span className="ops-severity">{row.gravidade.slice(0, 1)}</span><div><strong>{row.titulo}</strong><small>{row.area} · {row.comunidades} comunidades afetadas · {row.ultima}</small></div><Status value={row.status} tone={toneFor(row.status)} /><b>{row.ocorrencias > 1 ? `${row.ocorrencias} · recorrente` : row.ocorrencias}</b></summary><div className="ops-incident-detail"><p>{row.descricao}</p><div className="ops-history">{row.historico.map((event) => <span key={event}>{event}</span>)}</div>{resolving === row.id ? <div className="ops-resolution"><label>Resolução obrigatória<textarea required rows={3} placeholder="Descreva a causa e a ação aplicada…" /></label><button type="button" onClick={() => { setResolved((current) => [...current, row.id]); setResolving(null); }}>Registrar resolução</button></div> : <div className="ops-incident-actions"><button type="button">Assumir</button><button type="button" className="secondary">Mitigar</button>{row.status !== "RESOLVIDO" && <button type="button" onClick={() => setResolving(row.id)}>Resolver</button>}<button type="button" className="secondary">Ignorar</button></div>}</div></details>)}{!filtered.length && <div className="owner-empty"><span>◇</span><strong>Nenhum incidente neste filtro</strong><p>Quando houver ocorrências compatíveis, elas aparecerão aqui.</p></div>}</div></section></div>;
}
