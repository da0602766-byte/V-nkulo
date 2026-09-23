"use client";

import { useMemo, useState } from "react";

export type OwnerOperationsScreen = "passwords" | "deleted" | "finance" | "realtime" | "performance" | "publication" | "incidents";

export type OwnerOperationsData = {
  metrics: Record<string, number>;
  communities: Record<string, unknown>[];
  users: Record<string, unknown>[];
  audit: Record<string, unknown>[];
  requests: Record<string, unknown>[];
  feedback: Record<string, unknown>[];
  auditRetention?: { days: number; visibleLimit: number };
};

const SCREEN_COPY: Record<OwnerOperationsScreen, { eyebrow: string; title: string; description: string }> = {
  passwords: { eyebrow: "ACESSO SEGURO", title: "Redefinições de senha", description: "Consulte os eventos de segurança registrados pela plataforma, sem expor credenciais." },
  deleted: { eyebrow: "CICLO DE VIDA", title: "Contas excluídas", description: "Veja contas inativas e eventos de desativação que existem na fonte atual." },
  finance: { eyebrow: "CONTROLE FINANCEIRO", title: "Financeiro", description: "Acompanhe a disponibilidade da fonte financeira da plataforma." },
  realtime: { eyebrow: "OBSERVABILIDADE", title: "Tempo real", description: "Diferencie dados atuais de telemetria verdadeiramente contínua." },
  performance: { eyebrow: "SAÚDE DA PLATAFORMA", title: "Desempenho", description: "Investigue resultados diferentes de sucesso na auditoria disponível." },
  publication: { eyebrow: "ENTREGA CONTROLADA", title: "Publicação do sistema", description: "Consulte somente os eventos de publicação registrados na auditoria." },
  incidents: { eyebrow: "RESPOSTA OPERACIONAL", title: "Incidentes", description: "Priorize ocorrências reais derivadas de registros com falha ou negação." },
};

const SEARCH_TERMS: Record<"passwords" | "deleted" | "publication", string[]> = {
  passwords: ["SENHA", "PASSWORD", "REDEFIN", "CREDENCIAL"],
  deleted: ["EXCLU", "DESATIV", "REMOVID", "PURG"],
  publication: ["PUBLIC", "DEPLOY", "RELEASE", "BUILD", "VERSAO", "VERSÃO"],
};

function read(row: Record<string, unknown>, key: string, fallback = "—") {
  const current = row[key];
  return current === null || current === undefined || String(current).trim() === "" ? fallback : String(current);
}

function formatDate(input: unknown) {
  if (!input) return "—";
  const raw = String(input);
  const parsed = new Date(raw.replace(" ", "T") + (raw.includes("Z") ? "" : "Z"));
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function humanize(input: unknown) {
  return String(input || "Não informado").replaceAll("_", " ").toLocaleLowerCase("pt-BR").replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function isFailure(row: Record<string, unknown>) {
  return !["SUCESSO", "OK"].includes(read(row, "resultado", "").toUpperCase());
}

function matchesEvent(row: Record<string, unknown>, terms: string[]) {
  const event = read(row, "evento", "").toUpperCase();
  return terms.some((term) => event.includes(term));
}

function WorkspaceHeader({ screen, source }: { screen: OwnerOperationsScreen; source: string }) {
  const copy = SCREEN_COPY[screen];
  return <header className="ops-hero"><div><p className="pilot-kicker">{copy.eyebrow}</p><p>{copy.description}</p></div><span className="ops-source-chip">{source}</span></header>;
}

function SourceNote({ children }: { children: React.ReactNode }) {
  return <div className="ops-source-banner" role="note"><span aria-hidden="true">i</span><p>{children}</p></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="ops-empty-state"><span aria-hidden="true">◇</span><strong>{title}</strong><p>{text}</p></div>;
}

function Status({ result }: { result: unknown }) {
  const normalized = String(result || "NÃO INFORMADO").toUpperCase();
  const tone = ["SUCESSO", "OK", "ATIVO"].includes(normalized) ? "success" : ["ERRO", "NEGADO", "INATIVO"].includes(normalized) ? "danger" : "neutral";
  return <span className={`ops-status ${tone}`}>{humanize(normalized)}</span>;
}

function AuditPanel({ rows, title = "Registros encontrados", emptyTitle = "Nenhum registro disponível", emptyText = "A fonte atual não retornou eventos para esta área." }: { rows: Record<string, unknown>[]; title?: string; emptyTitle?: string; emptyText?: string }) {
  return <section className="ops-panel"><header className="ops-panel-title"><div><h3>{title}</h3><p>{rows.length} {rows.length === 1 ? "registro na fonte atual" : "registros na fonte atual"}</p></div></header>{rows.length ? <div className="ops-event-list">{rows.map((row, index) => <article key={read(row, "id", String(index))}><span className={`ops-event-icon ${isFailure(row) ? "danger" : "success"}`}>{isFailure(row) ? "!" : "✓"}</span><div><strong>{humanize(row.evento)}</strong><p>{read(row, "comunidade_nome", "Plataforma")} · {read(row, "usuario_nome", "Sistema")}</p></div><Status result={row.resultado} /><time>{formatDate(row.criado_em)}</time></article>)}</div> : <EmptyState title={emptyTitle} text={emptyText} />}</section>;
}

function Metric({ label, number, detail }: { label: string; number: number; detail: string }) {
  return <article><small>{label}</small><strong>{number.toLocaleString("pt-BR")}</strong><p>{detail}</p></article>;
}

export default function OwnerOperationsWorkspace({ screen, data }: { screen: OwnerOperationsScreen; data: OwnerOperationsData }) {
  if (screen === "passwords") return <FilteredAuditWorkspace screen={screen} data={data} />;
  if (screen === "deleted") return <DeletedWorkspace data={data} />;
  if (screen === "finance") return <UnavailableWorkspace screen={screen} source="Fonte não conectada" title="Dados financeiros indisponíveis" text="A API do proprietário ainda não fornece cobranças, pagamentos, valores ou renovações. Nenhuma estimativa é exibida para evitar dados falsos." needs={["Integração com o sistema de cobrança", "Status confirmado pelo provedor de pagamento", "Histórico de competências e renovações"]} />;
  if (screen === "realtime") return <RealtimeWorkspace data={data} />;
  if (screen === "performance") return <PerformanceWorkspace data={data} />;
  if (screen === "publication") return <FilteredAuditWorkspace screen={screen} data={data} />;
  return <IncidentWorkspace data={data} />;
}

function FilteredAuditWorkspace({ screen, data }: { screen: "passwords" | "publication"; data: OwnerOperationsData }) {
  const rows = useMemo(() => data.audit.filter((row) => matchesEvent(row, SEARCH_TERMS[screen])), [data.audit, screen]);
  const isPassword = screen === "passwords";
  return <div className="ops-stack"><WorkspaceHeader screen={screen} source="Auditoria real" /><SourceNote>Esta visão filtra a trilha de auditoria disponível. Ela não gera links, aprova acessos nem simula etapas que não estejam registradas.</SourceNote><AuditPanel rows={rows} title={isPassword ? "Eventos de credenciais" : "Eventos de publicação"} emptyTitle={isPassword ? "Nenhum evento de senha encontrado" : "Nenhum evento de publicação encontrado"} emptyText={isPassword ? "Não há redefinições ou eventos de credenciais na janela de auditoria disponível." : "A fonte atual não registra pipeline, versões ou implantações. Conecte o histórico de releases para habilitar esta área."} /></div>;
}

function DeletedWorkspace({ data }: { data: OwnerOperationsData }) {
  const inactiveUsers = useMemo(() => data.users.filter((row) => Number(row.ativo) !== 1), [data.users]);
  const events = useMemo(() => data.audit.filter((row) => matchesEvent(row, SEARCH_TERMS.deleted)), [data.audit]);
  return <div className="ops-stack"><WorkspaceHeader screen="deleted" source="Cadastros e auditoria" /><SourceNote>A listagem usa apenas o estado real dos cadastros. Ações de restauração ou exclusão definitiva não aparecem porque não existe um fluxo confiável exposto nesta tela.</SourceNote><div className="ops-metrics"><Metric label="Contas inativas" number={inactiveUsers.length} detail="presentes na fonte atual" /><Metric label="Eventos relacionados" number={events.length} detail="na janela de auditoria" /></div><section className="ops-panel"><header className="ops-panel-title"><div><h3>Cadastros inativos</h3><p>Identificação mínima para conferência administrativa.</p></div></header>{inactiveUsers.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Referência</th><th>Perfil</th><th>Comunidades</th><th>Criado em</th><th>Estado</th></tr></thead><tbody>{inactiveUsers.map((row, index) => <tr key={read(row, "id", String(index))}><td data-label="Referência"><strong>Conta #{read(row, "id")}</strong></td><td data-label="Perfil">{humanize(row.perfil)}</td><td data-label="Comunidades">{read(row, "comunidades_nomes", "Sem vínculo informado")}</td><td data-label="Criado em">{formatDate(row.criado_em)}</td><td data-label="Estado"><Status result="INATIVO" /></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma conta inativa" text="A fonte atual não retornou cadastros inativos." />}</section><AuditPanel rows={events} title="Eventos de exclusão e desativação" /></div>;
}

function UnavailableWorkspace({ screen, source, title, text, needs }: { screen: OwnerOperationsScreen; source: string; title: string; text: string; needs: string[] }) {
  return <div className="ops-stack"><WorkspaceHeader screen={screen} source={source} /><section className="ops-panel ops-unavailable"><span aria-hidden="true">⌁</span><div><p className="pilot-kicker">SEM DADOS SUFICIENTES</p><h3>{title}</h3><p>{text}</p><ul>{needs.map((need) => <li key={need}>{need}</li>)}</ul></div></section></div>;
}

function RealtimeWorkspace({ data }: { data: OwnerOperationsData }) {
  const currentCommunities = Number(data.metrics.comunidades_ativas || data.communities.filter((row) => String(row.status).toUpperCase() === "ATIVA").length);
  const currentUsers = Number(data.metrics.usuarios_ativos || data.users.filter((row) => Number(row.ativo) === 1).length);
  return <div className="ops-stack"><WorkspaceHeader screen="realtime" source="Último carregamento" /><SourceNote>Os números abaixo são um retrato da API do proprietário. Eles não representam presença online nem atualização contínua.</SourceNote><div className="ops-metrics"><Metric label="Comunidades ativas" number={currentCommunities} detail="na resposta atual" /><Metric label="Usuários ativos" number={currentUsers} detail="na resposta atual" /><Metric label="Registros de auditoria" number={data.audit.length} detail="na janela disponível" /></div><section className="ops-panel ops-unavailable"><span aria-hidden="true">⌁</span><div><p className="pilot-kicker">TELEMETRIA AUSENTE</p><h3>Sem presença em tempo real</h3><p>A fonte atual não informa sessões, pessoas online, duração ou picos simultâneos.</p><ul><li>Canal de presença com expiração</li><li>Agregação temporal de sessões</li><li>Política de privacidade para telemetria</li></ul></div></section></div>;
}

function PerformanceWorkspace({ data }: { data: OwnerOperationsData }) {
  const failures = useMemo(() => data.audit.filter(isFailure), [data.audit]);
  const denied = failures.filter((row) => read(row, "resultado", "").toUpperCase() === "NEGADO").length;
  const errors = failures.filter((row) => read(row, "resultado", "").toUpperCase() === "ERRO").length;
  return <div className="ops-stack"><WorkspaceHeader screen="performance" source="Auditoria disponível" /><SourceNote>Sem séries temporais de APM, esta tela mede somente resultados registrados na auditoria — não latência, uptime, CPU ou taxa global de erro.</SourceNote><div className="ops-metrics"><Metric label="Registros analisados" number={data.audit.length} detail="janela de auditoria" /><Metric label="Resultados com falha" number={failures.length} detail="diferentes de sucesso" /><Metric label="Negados" number={denied} detail="na fonte atual" /><Metric label="Erros" number={errors} detail="na fonte atual" /></div><AuditPanel rows={failures} title="Ocorrências que exigem leitura" emptyTitle="Nenhuma falha na janela disponível" emptyText="Todos os registros disponíveis estão marcados como sucesso ou OK." /><section className="ops-panel ops-needs"><header className="ops-panel-title"><div><h3>Lacunas de observabilidade</h3><p>Fontes necessárias para uma análise de desempenho completa.</p></div></header><div>{["Latência e uptime", "Erros HTTP", "CPU e memória", "Consultas lentas", "Histórico por versão"].map((item) => <span key={item}>{item}<small>Fonte não conectada</small></span>)}</div></section></div>;
}

function IncidentWorkspace({ data }: { data: OwnerOperationsData }) {
  const [query, setQuery] = useState("");
  const failures = useMemo(() => data.audit.filter(isFailure), [data.audit]);
  const filtered = useMemo(() => failures.filter((row) => [row.evento, row.resultado, row.comunidade_nome, row.usuario_nome].join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [failures, query]);
  return <div className="ops-stack"><WorkspaceHeader screen="incidents" source="Derivado da auditoria" /><SourceNote>Uma ocorrência aqui significa apenas que a auditoria registrou resultado diferente de sucesso. Severidade, impacto e resolução não são inferidos sem uma fonte própria.</SourceNote><div className="ops-metrics"><Metric label="Ocorrências disponíveis" number={failures.length} detail="resultados com falha" /><Metric label="Registros auditados" number={data.audit.length} detail="na janela atual" /></div><section className="ops-panel"><header className="ops-panel-title ops-panel-filter"><div><h3>Ocorrências</h3><p>Use a busca para localizar evento, pessoa ou comunidade.</p></div><label>Buscar<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Evento, resultado ou contexto" /></label></header><div className="ops-embedded-panel"><AuditPanel rows={filtered} title="Resultados do filtro" emptyTitle="Nenhuma ocorrência encontrada" emptyText={failures.length ? "Ajuste o termo de busca." : "Não há resultados com falha na janela de auditoria disponível."} /></div></section></div>;
}
