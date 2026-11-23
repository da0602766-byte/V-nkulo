"use client";

import { useEffect, useState } from "react";
import { reportDestination, reportStatuses, type ReportArchiveResult, type ReportArchiveRow } from "../lib/management-reports";
import { useBrowserSearch } from "./useBrowserSearch";
import { useBrowserStorage } from "./useBrowserStorage";
import ReportSchedule from "./ReportSchedule";
import PublicIcon from "./PublicIcon";

const endpoint = "/api/pilot/relatorios";
const emptyFilter = { from: "", to: "", area: "", group: "", status: "" };
type ArchiveFilter = typeof emptyFilter;
type SavedFilter = { name: string; filter: ArchiveFilter };
const displayDay = (date: string) => date.split("-").reverse().join("/");

function readFilter(values: URLSearchParams | FormData): ArchiveFilter {
  return { from: String(values.get("from") || ""),to: String(values.get("to") || ""),area: String(values.get("area") || ""),group: String(values.get("group") || ""),status: String(values.get("status") || "") };
}

function parseSavedFilters(raw: string | null): SavedFilter[] {
  try {
    const entries: unknown = JSON.parse(raw || "[]");
    if (Array.isArray(entries)) return entries.filter(entry => typeof entry?.name === "string" && entry.name.length <= 60 &&
      Object.keys(emptyFilter).every(key => typeof entry.filter?.[key] === "string")).slice(0,8);
  } catch { /* invalid preference */ }
  return [];
}

export default function ManagementReportArchive({ preview = false, preferenceKey, canSchedule = false }: { preview?: boolean; preferenceKey?: string; canSchedule?: boolean }) {
  const [selection, setSelection] = useState<ArchiveFilter | null>(null);
  const search = useBrowserSearch();
  const filter = selection || (preview ? emptyFilter : readFilter(new URLSearchParams(search)));
  const [page, setPage] = useState(1);
  const [compare, setCompare] = useState(false);
  const [preferences, setPreferences] = useBrowserStorage(`report-filters:${preferenceKey || "none"}`,parseSavedFilters);
  const [savedName, setSavedName] = useState("");
  const [requestCount, setRequestCount] = useState(0);
  const query = new URLSearchParams({ ...filter, page: String(page), ...(preview ? { queue: "1" } : {}), ...(compare ? { compare: "1" } : {}) }).toString();
  const [current, setCurrent] = useState<{ key: string; data?: ReportArchiveResult; error?: string } | null>(null);
  const key = `${requestCount}:${query}`;
  const data = current?.key === key ? current.data : undefined;
  const error = current?.key === key ? current.error : undefined;
  const [exportState, setExportState] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${endpoint}?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível consultar o histórico.");
        if (!controller.signal.aborted) setCurrent({ key, data: body });
      }).catch(cause => { if (!controller.signal.aborted) setCurrent({ key, error: (cause as Error).message }); });
    return () => controller.abort();
  }, [key,query]);

  function applyFilter(next: ArchiveFilter) {
    setSelection(next);
    setExportState("");
    setPage(1);
  }

  async function download(format: "csv" | "xlsx") {
    setExporting(true);
    setExportState("");
    try {
      const response = await fetch(`${endpoint}?${query}&format=${format}`, { cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).error || "Exportação indisponível.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `historico-de-relatorios.${format}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url),1000);
      setExportState("Arquivo preparado para download.");
    } catch (cause) {
      setExportState((cause as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const rows = preview ? data?.rows.slice(0,5) : data?.rows;
  return <section className="central-section central-report-archive" data-preview={preview} aria-busy={!data && !error}>
    <header className="central-report-header" id={preview ? undefined : "historico-relatorios"}>
      <div className="central-report-heading">
        <span className="central-report-emblem"><PublicIcon name="layers" size={23} /></span>
        <h3>{preview ? "Relatórios que precisam de atenção" : "Histórico de Células e Estacionamento"}</h3>
      </div>
      {preview ? <a className="central-report-open" href="/painel?view=relatorios#historico-relatorios">Abrir histórico <PublicIcon name="arrow" size={16} /></a> : data && (
        <p className="central-report-period"><PublicIcon name="calendar" size={17} /><span>{displayDay(data.period.from)} a {displayDay(data.period.to)}</span></p>
      )}
    </header>
    {data && <ReportTotals metrics={data.metrics} />}
    {!preview && <form key={JSON.stringify(filter)} className="central-toolbar central-report-filters" aria-label="Filtrar histórico" onSubmit={event => {
      event.preventDefault();
      applyFilter(readFilter(new FormData(event.currentTarget)));
    }}>
      <label>De<input type="date" name="from" defaultValue={filter.from} /></label>
      <label>Até<input type="date" name="to" defaultValue={filter.to} /></label>
      <label>Área<select name="area" defaultValue={filter.area}><option value="">Todas</option><option value="cells">Células</option><option value="parking">Estacionamento</option></select></label>
      <label className="central-report-search">Grupo ou plantão<span><PublicIcon name="search" size={17} /><input type="search" name="group" defaultValue={filter.group} maxLength={120} /></span></label>
      <label>Situação<select name="status" defaultValue={filter.status}><option value="">Todas</option>{Object.entries(reportStatuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="submit" className="central-report-apply">Aplicar filtros</button>
    </form>}
    {!preview && <div className="central-report-tools">
    {preferenceKey && <details className="central-report-preferences"><summary>Filtros salvos</summary>
      {preferences.length > 0 && <div className="central-export-actions">
        <label>Escolher filtro<select value={savedName} onChange={event => setSavedName(event.target.value)}><option value="">Selecione</option>{preferences.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
        <button type="button" disabled={!savedName} onClick={() => { const saved = preferences.find(item => item.name === savedName); if (saved) applyFilter(saved.filter); }}>Usar filtro</button>
        <button type="button" disabled={!savedName} onClick={() => { setPreferences(items => items.filter(item => item.name !== savedName)); setSavedName(""); }}>Remover filtro</button>
      </div>}
      <form className="central-toolbar" onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = String(new FormData(form).get("nome") || "").trim();
        if (!name) return;
        setPreferences(items => [{ name,filter },...items.filter(item => item.name !== name)].slice(0,8));
        setSavedName(name);
        form.reset();
      }}><label>Nome do filtro<input name="nome" maxLength={60} required /></label><button type="submit">Salvar recorte aplicado</button></form>
      <p className="central-note">Este navegador guarda os oito recortes salvos mais recentes para sua conta nesta comunidade.</p>
    </details>}
    {canSchedule && <details className="central-report-preferences"><summary>Agendar resumo</summary><ReportSchedule filter={filter} /></details>}
    <button className="central-report-compare" type="button" aria-pressed={compare} onClick={() => setCompare(value => !value)}>{compare ? "Ocultar comparação" : "Comparar períodos"}</button>
    </div>}
    {error && <div className="central-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRequestCount(count => count + 1)}>Tentar novamente</button></div>}
    {!data && !error && <p className="central-report-state" role="status">Consultando relatórios…</p>}
    {data && <>
      {data.comparison && <Comparison data={data} showAttendance={filter.area !== "parking"} />}
      {!preview && <div className="central-report-results">
        <div><h4>Registros</h4><p>{data.total === 1 ? "1 resultado" : `${data.total} resultados`}</p></div>
        <div className="central-report-downloads" role="group" aria-label="Exportar o histórico filtrado">
          <button type="button" aria-label="Baixar histórico filtrado (CSV)" onClick={() => void download("csv")} disabled={exporting || !data.total}>CSV</button>
          <button type="button" aria-label="Baixar planilha (XLSX)" onClick={() => void download("xlsx")} disabled={exporting || !data.total}>XLSX</button>
        </div>
        {(exportState || exporting) && <span className="central-report-export-message" role="status">{exporting ? "Preparando arquivo…" : exportState}</span>}
      </div>}
      {!rows?.length && <p className="central-report-state"><PublicIcon name={preview ? "shield" : "search"} size={20} />{preview ? "Nenhum relatório pendente no período." : "Nenhum relatório encontrado neste recorte."}</p>}
      <div className="central-report-archive-rows">{rows?.map(row => <ArchiveRow key={`${row.area}:${row.id}:${row.groupId}:${row.day}`} row={row} />)}</div>
      {!preview && data.total > data.pageSize && <nav className="central-export-actions" aria-label="Páginas do histórico">
        <button type="button" onClick={() => setPage(value => value - 1)} disabled={page <= 1}>Anterior</button>
        <span>Página {page} de {Math.ceil(data.total / data.pageSize)}</span>
        <button type="button" onClick={() => setPage(value => value + 1)} disabled={page * data.pageSize >= data.total}>Próxima</button>
      </nav>}
    </>}
  </section>;
}

function ReportTotals({ metrics }: { metrics: ReportArchiveResult["metrics"] }) {
  const { received,expected,overdue,reviewing,correcting } = metrics;
  return <>
    <dl className="central-report-totals" aria-label="Indicadores do período">
      <div className="central-report-total central-report-total-coverage">
        <dt>Recebidos</dt><dd>{received}<small> de {expected} esperados</small></dd>
        <progress aria-label="Relatórios recebidos dos esperados" value={received} max={Math.max(expected,1)} />
      </div>
      <div className="central-report-total" data-tone="overdue"><dt>Atrasados</dt><dd>{overdue}</dd></div>
      <div className="central-report-total" data-tone="review"><dt>Em revisão</dt><dd>{reviewing}</dd></div>
      <div className="central-report-total" data-tone="correction"><dt>Correções solicitadas</dt><dd>{correcting}</dd></div>
    </dl>
    <p className="central-report-metric-note">Os totais incluem todas as situações dos encontros agendados e plantões no recorte.</p>
  </>;
}

function ArchiveRow({ row }: { row: ReportArchiveRow }) {
  const area = row.area === "cells" ? "Células" : "Estacionamento";
  return <article className="central-report-archive-row">
    <span className="central-report-row-icon" data-area={row.area}><PublicIcon name={row.area === "cells" ? "community" : "pin"} size={21} /></span>
    <div className="central-report-row-main">
      <strong>{row.title}</strong>
      <p className="central-report-row-meta"><span>{row.area === "cells" ? area : row.groupName}</span><time dateTime={row.day}>{displayDay(row.day)}</time><span>{row.responsible || "Responsável a definir"}</span></p>
      {row.happened !== null && <p className="central-report-row-count">{row.happened ? `${row.firstCount} presentes · ${row.secondCount} visitantes` : "Encontro não realizado"}</p>}
      {row.notes && <details className="central-report-row-notes"><summary>Observações</summary><p>{row.notes}</p></details>}
    </div>
    <span className="central-report-status" data-status={row.status}>{reportStatuses[row.status]}</span>
    <a className="central-report-open" href={reportDestination(row)}>{row.id ? "Abrir relatório" : "Abrir encontro"}<span className="sr-only"> de {row.title}</span><PublicIcon name="arrow" size={16} /></a>
  </article>;
}

function Comparison({ data, showAttendance }: { data: ReportArchiveResult; showAttendance: boolean }) {
  if (!data.comparison) return null;
  const { previous,visitors } = data.comparison;
  const current = data.metrics;
  return <div className="central-report-comparison">
    <h4>Comparação com {displayDay(previous.period.from)} a {displayDay(previous.period.to)}</h4>
    <ComparisonMetric title="Relatórios recebidos dos esperados" current={current.received} previous={previous.metrics.received} total={current.expected} previousTotal={previous.metrics.expected} />
    {showAttendance && <ComparisonMetric title="Presenças registradas em encontros de célula" current={current.attendance} previous={previous.metrics.attendance} />}
    {visitors && <>
      <ComparisonMetric title="Visitantes integrados entre os cadastrados" current={visitors.current.integrated} previous={visitors.previous.integrated} total={visitors.current.registered} previousTotal={visitors.previous.registered} />
      <p className="central-note">Integração usa a situação atual das fichas ativas cadastradas em cada período.</p>
    </>}
  </div>;
}

function ComparisonMetric({ title,current,previous,total,previousTotal }: { title: string; current: number; previous: number; total?: number; previousTotal?: number }) {
  const max = Math.max(current,previous,total ?? 0,previousTotal ?? 0,1);
  return <figure><figcaption>{title}</figcaption>
    <div className="central-report-series"><span>Selecionado</span><meter aria-label={`${title} no período selecionado`} min={0} max={total || max} value={current} /><strong>{current}{total !== undefined && ` de ${total}`}</strong></div>
    <div className="central-report-series central-report-series-previous"><span>Anterior</span><meter aria-label={`${title} no período anterior`} min={0} max={previousTotal || max} value={previous} /><strong>{previous}{previousTotal !== undefined && ` de ${previousTotal}`}</strong></div>
  </figure>;
}
