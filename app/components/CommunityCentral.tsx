"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { centralCsv, centralReportRows, safeCentralDestination, type CentralData } from "../lib/community-central";
import { matchesDirectorySearch } from "../lib/directory-search";
import "./community-central.css";

export const CENTRAL_VIEWS = ["comunidade", "membro", "lider", "pessoas", "relatorios", "avisos", "conta", "continuidade", "configuracoes"];
const TITLES: Record<string, string> = { comunidade: "Visão geral", membro: "Minha participação", lider: "Liderança", pessoas: "Pessoas", relatorios: "Relatórios", avisos: "Avisos", conta: "Perfil e conta", continuidade: "Continuidade", configuracoes: "Configurações" };

const NAV_HINTS: Record<string,string> = { comunidade: "Resumo e prioridades", membro: "Meus vínculos e escalas", lider: "Equipe e ministérios", pessoas: "Diretório e acompanhamento", relatorios: "Consultar e baixar", avisos: "Recados recebidos" };
function CentralIcon({name}: {name:string}) {
  const paths: Record<string,string> = {
    comunidade:"M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7", membro:"M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
    lider:"M4 4h16v6H4zM12 10v5M5 15h14M5 15v5m7-5v5m7-5v5", pessoas:"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 7m2 4a6 6 0 0 1 3 5",
    relatorios:"M4 3v18h17M8 17v-5m5 5V7m5 10V4", avisos:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    conta:"M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21a8 8 0 0 1 16 0", continuidade:"M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7zM8 12l3 3 5-6", configuracoes:"M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
    agenda:"M5 5h14v16H5zM8 2v6m8-6v6M5 10h14", check:"m5 12 4 4L19 6", arrow:"M4 12h16m-6-6 6 6-6 6", clock:"M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", alert:"M12 4 2 21h20zM12 10v5m0 3v.1"
  };
  return <svg className="central-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.relatorios}/></svg>;
}

export function CentralNavigation({ communityName, roleLabel, current, allowed, onNavigate }: { communityName: string; roleLabel: string; current: string; allowed: string[]; onNavigate: (view: string) => void }) {
  const items = CENTRAL_VIEWS.filter(id => allowed.includes(id));
  const primary = items.filter(id => !["conta","continuidade","configuracoes"].includes(id));
  const secondary = items.filter(id => ["conta","continuidade","configuracoes"].includes(id));
  if(current === "configuracoes") return <div className="settings-context"><a href="/painel?view=comunidade">← Central da Comunidade</a><span>{communityName}</span><small>{roleLabel}</small></div>;
  return <div className="central-masthead">
    <div className="central-context"><span>{communityName}</span><span className="central-role-badge">{roleLabel}</span></div>
    <h1>Central da Comunidade</h1>
    <p>Suas informações, responsabilidades e consultas.</p>
    <nav className="central-nav" data-count={primary.length} aria-label="Central da Comunidade">{primary.map(id => <button type="button" key={id} aria-current={current === id ? "page" : undefined} onClick={() => onNavigate(id)}><CentralIcon name={id}/><span><strong>{TITLES[id]}</strong><small>{NAV_HINTS[id]}</small></span></button>)}</nav>
    {secondary.length > 0 && <nav className="central-secondary-nav" aria-label="Conta e administração">{secondary.map(id => <button type="button" key={id} aria-current={current === id ? "page" : undefined} onClick={() => onNavigate(id)}><CentralIcon name={id}/>{TITLES[id]}</button>)}</nav>}
  </div>;
}

export default function CommunityCentral({ mode = "overview", communityId, onNotifications }: { mode?: "overview" | "member" | "leadership" | "reports" | "notices"; communityId: number; onNotifications?: () => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<CentralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const personal = mode === "member";
  const load = useCallback(async () => {
    requestRef.current?.abort(); const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setError(""); setData(null);
    try {
      const response = await fetch(`/api/pilot/central?days=${days}${personal ? "&scope=me" : ""}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar a Central.");
      if (result.community?.id !== communityId || !Array.isArray(result.ministries) || !Array.isArray(result.metrics) || !Array.isArray(result.errors) || !Array.isArray(result.notices) || !Array.isArray(result.schedules) || !result.capabilities || !Array.isArray(result.areas) || !Array.isArray(result.events) || !Array.isArray(result.cellReports)) throw new Error("A consulta retornou dados incompletos. Tente novamente.");
      if (!controller.signal.aborted) { setData(result); setMinistryId(current => result.ministries.some((m: { id: number }) => String(m.id) === current) ? current : ""); }
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [communityId, days, personal]);
  useEffect(() => { void load(); return () => requestRef.current?.abort(); }, [load]);
  const ministries = data?.ministries.filter(m => (!ministryId || String(m.id) === ministryId) && matchesDirectorySearch(query, m.name, m.leader)) || [];
  const notices = data?.notices.filter(n => (!onlyUnread || !n.read) && matchesDirectorySearch(query, n.title, n.message, n.ministry)) || [];
  const reportMode = mode === "reports";
  const noticesMode = mode === "notices";
  const personalScope = personal || data?.scope === "personal";
  const title = noticesMode ? "Seus avisos" : reportMode ? "Relatórios" : personal ? "Minha participação" : mode === "leadership" ? "Ministérios e liderança" : personalScope ? "Meu resumo" : "Resumo da comunidade";

  function downloadReport() {
    if (!data || loading || data.errors.some(e => ["ministries", "pastoral"].includes(e.section))) return;
    try {
      const blob = new Blob([centralCsv(centralReportRows(data, ministries))], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `relatorio-comunidade-${communityId}-${days}dias.csv`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); setExportMessage("Relatório preparado para download. Confira os arquivos do seu dispositivo.");
    } catch { setExportMessage("Não foi possível baixar. Use Imprimir para salvar uma cópia em PDF."); }
  }

  const reportControls = data && (data.capabilities.ministries || data.capabilities.cellReports) && <div className="central-report-controls">
          <div className="central-toolbar"><label>Período<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select></label>{data.capabilities.ministries && <label>{reportMode ? "Ministério" : "Buscar ministério"}{reportMode ? <select value={ministryId} onChange={e => setMinistryId(e.target.value)}><option value="">Todos os disponíveis</option>{data.ministries.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select> : <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome ou responsável" />}</label>}{reportMode && <div className="central-export-actions"><button type="button" onClick={downloadReport} disabled={data.errors.some(e => ["ministries", "pastoral"].includes(e.section))}>Baixar CSV</button><button type="button" onClick={() => window.print()}>Imprimir / PDF</button></div>}</div>
          <p className="central-note">{date(data.period.from)} a {date(data.period.to)} · Confirmação de escala não comprova presença.</p>
          {exportMessage && <p role="status">{exportMessage}</p>}
        </div>;

  return <section className={`central-dashboard central-mode-${mode}`} aria-busy={loading}>
    <header className="central-page-heading"><div><span className="central-eyebrow">{noticesMode ? "COMUNICAÇÃO" : reportMode ? "CONSULTAS E EXPORTAÇÃO" : personalScope ? "SEU DIA A DIA" : "ACOMPANHAMENTO"}</span><h2>{title}</h2><p>{data?.scopeLabel || (personal ? "Sua participação" : "Carregando seu contexto…")}{data && <> · Atualizado {dateTime(data.generatedAt)}</>}</p></div><div className="central-heading-actions">{!reportMode && !noticesMode && <a className="central-primary-action" href={personalScope ? "/painel?view=conta" : "/painel?view=relatorios"}>{personalScope ? "Meu perfil" : "Ver relatórios"}<CentralIcon name="arrow"/></a>}<button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button></div></header>
    {error && <div className="central-error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
    {loading && <p className="central-empty" role="status">Consultando as informações disponíveis para você…</p>}
    {!loading && data && <>
      {data.errors.length > 0 && <div className="central-error" role="alert"><strong>Parte da consulta está indisponível</strong>{data.errors.map(e => <p key={e.section}>{e.message}</p>)}<button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
      {!noticesMode && !reportMode && <dl className="central-metric-line">{data.metrics.map(m => <div key={m.label} className={m.value > 0 && /pendentes|Substituições/.test(m.label) ? "needs-attention" : undefined}><dt><CentralIcon name={m.label.includes("Pessoas") ? "pessoas" : m.label.includes("ministérios") || m.label.includes("Ministérios") ? "lider" : m.label.includes("Avisos") ? "avisos" : "clock"}/>{m.label}</dt><dd>{m.href ? <a href={m.href}>{m.value}<span className="sr-only"> — abrir {m.label}</span></a> : m.value}</dd><small>{m.detail}</small></div>)}</dl>}

      {noticesMode ? <>
        <div className="central-toolbar"><label>Buscar aviso<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Assunto ou ministério" /></label><label className="central-check"><input type="checkbox" checked={onlyUnread} onChange={e => setOnlyUnread(e.target.checked)} />Somente não lidos</label>{onNotifications && <button type="button" onClick={onNotifications}>Abrir central de notificações</button>}</div>
        <NoticeList notices={notices} empty={query || onlyUnread ? "Nenhum aviso corresponde aos filtros." : "Você ainda não recebeu avisos nesta comunidade."} />
        {data.limits.notices && <p className="central-note">Exibindo os 30 avisos mais recentes. A central de notificações permite consultar os anteriores e marcar como lidos.</p>}
      </> : <>
        {!reportMode && <div className="central-columns">
          <section className="central-section"><div className="central-section-heading"><h3><CentralIcon name="alert"/>Precisa de atenção</h3><a href="/painel?view=avisos">Ver avisos →</a></div>
            {data.schedules.filter(s => s.pending > 0 || s.replacements > 0).slice(0, 4).map(s => <a className="central-action-row" key={s.id} href={`/painel?view=ministerios&schedule=${s.id}`}><span><strong>{s.title}</strong><small>{s.ministry} · {dateTime(s.startsAt)}</small></span><span className="central-attention">{s.pending > 0 && `${s.pending} a confirmar`}{s.pending > 0 && s.replacements > 0 && " · "}{s.replacements > 0 && `${s.replacements} ${s.replacements === 1 ? "substituição" : "substituições"}`}<b aria-hidden="true"> →</b></span></a>)}
            {!data.schedules.some(s => s.pending > 0 || s.replacements > 0) && !data.errors.some(e => e.section === "schedules") && <div className="central-empty-state"><span className="central-empty-symbol"><CentralIcon name="check"/></span><strong>Sem pendências nas próximas escalas</strong><p>Nenhuma confirmação ou substituição pendente nas próximas escalas exibidas.</p></div>}
            <NoticeList notices={data.notices.filter(n => !n.read).slice(0, 2)} compact empty="" />
          </section>
          <section className="central-section"><div className="central-section-heading"><h3><CentralIcon name="agenda"/>{personalScope ? "Minhas próximas escalas" : "Próximas escalas"}</h3>{data.capabilities.schedules && <a href="/painel?view=ministerios&tab=escalas">Abrir escalas →</a>}</div>
            {data.schedules.slice(0, 5).map(s => <a className="central-schedule-row" key={s.id} href={`/painel?view=ministerios&schedule=${s.id}`}><time dateTime={s.startsAt}><strong>{day(s.startsAt)}</strong><small>{month(s.startsAt)}</small></time><span><strong>{s.title}</strong><small>{s.ministry} · {time(s.startsAt)}</small></span><span aria-hidden="true">→</span></a>)}
            {!data.schedules.length && !data.errors.some(e => e.section === "schedules") && <div className="central-empty-state"><span className="central-empty-symbol"><CentralIcon name="agenda"/></span><strong>Nenhuma escala por enquanto</strong><p>As próximas escalas disponíveis para você aparecerão aqui.</p></div>}
            {data.limits.schedules && <p className="central-note">As pendências acima consideram as 12 próximas escalas. Consulte todas na área de escalas.</p>}
          </section>
        </div>}



        {data.capabilities.ministries && <section className="central-section central-report-section">
          <div className="central-section-heading"><div><h3><CentralIcon name="lider"/>{personalScope ? "Meus ministérios e participação" : "Ministérios em acompanhamento"}</h3><p>{personalScope ? "Sua participação no período. Os números abaixo se referem somente a você." : "Compare os ministérios no período. Integrantes e pendências mostram a situação atual."}</p></div>{!reportMode && <a href="/painel?view=relatorios">Todos os relatórios →</a>}</div>
          {reportControls}
          <div className={`central-ministry-table${personalScope ? " is-personal" : ""}`} role="table" aria-label="Relatório de ministérios"><div className="central-ministry-columns" role="row"><span role="columnheader">Ministério / responsável</span>{!personalScope && <span role="columnheader">Integrantes</span>}<span role="columnheader">Escalas</span><span role="columnheader">Confirmações</span><span role="columnheader">Ausências</span><span role="columnheader">Pendentes futuras</span></div>{ministries.map(m => <div className="central-ministry-row" role="row" key={m.id}><div role="cell"><a href={`/painel?view=ministerios&ministry=${m.id}`}>{m.name}<span aria-hidden="true"> ↗</span></a><small>{m.leader}</small></div>{[...(!personalScope ? [["Integrantes", m.volunteers ?? "Não disponível"]] : []), ["Escalas", data.capabilities.schedules ? m.schedules : "—"], ["Confirmações", data.capabilities.schedules ? m.confirmed : "—"], ["Ausências", data.capabilities.schedules ? m.absent : "—"], ["Pendentes futuras", data.capabilities.schedules ? m.pending : "—"]].map(([label, value]) => <div role="cell" key={label} className={label === "Pendentes futuras" && Number(value) > 0 ? "needs-attention" : undefined}><small className="central-mobile-label">{label}</small><strong>{value}</strong></div>)}</div>)}</div>
          {!ministries.length && !data.errors.some(e => e.section === "ministries") && <p className="central-empty">{query || ministryId ? "Nenhum ministério corresponde ao filtro." : data.scope === "leadership" ? "Você ainda não está vinculado como responsável ou líder de um ministério." : "Nenhum ministério disponível para este acesso."}</p>}
          {data.limits.ministries && <p className="central-note">Exibindo os primeiros 200 ministérios. Abra a área de ministérios para continuar a consulta.</p>}
        </section>}

        {!data.capabilities.ministries && data.capabilities.cellReports && reportControls}
        {!reportMode && data.capabilities.events && <section className="central-section"><div className="central-section-heading"><div><h3><CentralIcon name="agenda"/>Na agenda da comunidade</h3><p>Os cinco próximos eventos publicados.</p></div><a href="/painel?view=eventos">Ver agenda →</a></div>{data.events.map(e => <div className="central-schedule-row" key={e.id}><time dateTime={e.startsAt}><strong>{day(e.startsAt)}</strong><small>{month(e.startsAt)}</small></time><span><strong>{e.title}</strong><small>{time(e.startsAt)}{e.location && ` · ${e.location}`}{e.response === "CONFIRMADO" && " · Você confirmou"}</small></span></div>)}{!data.events.length && !data.errors.some(e => e.section === "events") && <p className="central-empty">Nenhum próximo evento publicado.</p>}</section>}
        {reportMode && !data.capabilities.ministries && !data.capabilities.cellReports && <p className="central-empty">Nenhum relatório está disponível para as áreas autorizadas ao seu perfil.</p>}
        {data.pastoralLocked && <p className="central-note">Os indicadores pastorais precisam ser liberados pelo criador da comunidade. Os demais dados disponíveis continuam acessíveis.</p>}
        {data.capabilities.cellReports && <section className="central-section"><div className="central-section-heading"><div><h3><CentralIcon name="relatorios"/>Relatórios recebidos das células</h3><p>Encontros registrados no período selecionado.</p></div><a href="/painel?view=celulas">Abrir células →</a></div>{data.cellReports.map(r => <details className="central-cell-report" key={r.id}><summary><span><strong>{r.name}</strong><small>{date(r.date)}</small></span><span>{r.happened ? `${r.attendees} presentes · ${r.visitors} visitantes` : "Encontro não realizado"}</span></summary><p>{r.notes || "Sem observações adicionais."}</p></details>)}{!data.cellReports.length && !data.errors.some(e => e.section === "pastoral") && <p className="central-empty">Nenhum relatório de célula disponível neste período.</p>}{data.limits.cellReports && <p className="central-note">50 relatórios mais recentes. Consulte os demais na área de células.</p>}</section>}
        {reportMode && data.areas.length > 0 && <section className="central-section"><div className="central-section-heading"><div><h3>Consultas por área</h3><p>Continue a análise nos módulos disponíveis para você.</p></div></div><div className="central-area-index">{data.areas.map(area => <a key={area.href} href={area.href}><strong>{area.label}</strong><small>{area.description}</small><span aria-hidden="true">→</span></a>)}</div></section>}
      </>}
    </>}
  </section>;
}

function NoticeList({ notices, empty, compact = false }: { notices: CentralData["notices"]; empty: string; compact?: boolean }) {
  return <div className={`central-notice-list${compact ? " is-compact" : ""}`}>{notices.map(n => <article key={n.id} className={n.read ? "is-read" : ""}><div><small><span className={`central-read-status${n.read ? " is-read" : ""}`}>{n.read ? "Lido" : "Não lido"}</span> · {dateTime(n.createdAt)}{n.ministry && ` · ${n.ministry}`}</small><h3>{n.title}</h3>{!compact && <p>{n.message}</p>}</div><a href={safeCentralDestination(n.destination)}>Consultar<span className="sr-only"> {n.title}</span> →</a></article>)}{!notices.length && empty && <p className="central-empty">{empty}</p>}</div>;
}
function parsed(value: string) { return new Date(value.length === 10 ? `${value}T12:00:00` : value.includes("T") ? value : `${value.replace(" ", "T")}Z`); }
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(parsed(value)); }
function dateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed(value)); }
function day(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(parsed(value)); }
function month(value: string) { return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(parsed(value)); }
function time(value: string) { return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(parsed(value)); }
