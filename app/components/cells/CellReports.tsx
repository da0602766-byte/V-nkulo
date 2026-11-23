"use client";

import { useEffect, useRef, useState } from "react";
import type { Cell, CellReport } from "./types";
import type { CellsData } from "./useCellsData";
import { useBrowserSearch } from "../useBrowserSearch";

const localDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

function defaultReportDate(cell: Cell, now: number) {
  const meeting = cell.agenda.findLast(item => {
    const start = Date.parse(item.inicia_em);
    return start <= now && start >= now - 7 * 86_400_000;
  });
  if (!meeting) return "";
  const date = localDay.format(new Date(meeting.inicia_em));
  return cell.relatorios.some(report => report.data_reuniao === date) ? "" : date;
}

export default function CellReports({ cell, cells }: { cell: Cell; cells: CellsData }) {
  const [target, setTarget] = useState<CellReport | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [page, setPage] = useState(1);
  const search = useBrowserSearch();
  const params = new URLSearchParams(search);
  const reportId = params.get("relatorio") || "";
  const requestedDate = params.get("data") || "";
  const [showAll, setShowAll] = useState(false);
  const reportQuery = showAll ? "" : reportId;
  const historyKey = `${cell.id}:${reportQuery}:${page}:${formKey}`;
  const [history, setHistory] = useState<{ key: string; reports: CellReport[]; hasMore: boolean; error?: string } | null>(null);
  const current = history?.key === historyKey ? history : null;
  const reports = current?.reports ?? (!reportQuery && page === 1 ? cell.relatorios : []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ pagina: String(page), ...(reportQuery ? { relatorio: reportQuery } : {}) });
    fetch(`/api/pilot/celulas/${cell.id}?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível consultar o histórico.");
        if (!controller.signal.aborted) setHistory({ key: historyKey, reports: body.relatorios, hasMore: body.hasMore });
      }).catch(cause => {
        if (!controller.signal.aborted) setHistory({ key: historyKey, reports: [], hasMore: false, error: (cause as Error).message });
      });
    return () => controller.abort();
  }, [cell.id,historyKey,page,reportQuery]);

  return <div className="cgestao-reports">
    <ReportForm key={`${target?.id ?? "new"}:${formKey}:${requestedDate}`} date={target?.data_reuniao || requestedDate || defaultReportDate(cell,cells.agora)} report={target} saving={cells.saving}
      onCancel={() => setTarget(null)} onSave={async data => {
        const ok = await cells.cellAction(cell.id, {
          ...data,
          acao: target ? "RELATORIO_CORRIGIR" : "RELATORIO_CRIAR",
          relatorioId: target?.id,
          versao: target?.versao,
        }, target ? "Correção registrada. A versão anterior foi preservada." : "Relatório registrado para a gestão autorizada.");
        if (ok) { setTarget(null); setFormKey(key => key + 1); }
      }} />
    <div className="cgestao-report-history">
      {current?.error && <p role="alert">{current.error}</p>}
      {reportQuery && <button type="button" onClick={() => setShowAll(true)}>Ver histórico da célula</button>}
      {reports.map(report => <article key={report.id}>
        <time dateTime={report.data_reuniao}>{new Date(`${report.data_reuniao}T12:00:00`).toLocaleDateString("pt-BR")}</time>
        <strong>{report.aconteceu ? `${report.presentes} presentes · ${report.visitantes} visitantes` : "Encontro não realizado"}</strong>
        <small>{report.enviado_por_nome || "Relatório registrado"}{report.versao > 1 && ` · Versão ${report.versao}`}</small>
        {report.observacoes && <details><summary>Observações</summary><p>{report.observacoes}</p></details>}
        <button type="button" disabled={cells.saving || target?.id === report.id} onClick={() => setTarget(report)}>Corrigir relatório</button>
      </article>)}
      {current && !reports.length && !current.error && <p className="cgestao-empty">Nenhum relatório encontrado.</p>}
      {!current && !reports.length && <p role="status">Consultando histórico…</p>}
      {(page > 1 || current?.hasMore) && <nav className="cgestao-report-pages" aria-label="Páginas do histórico da célula">
        <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button>
        <span>Página {page}</span>
        <button type="button" disabled={!current?.hasMore} onClick={() => setPage(value => value + 1)}>Próxima</button>
      </nav>}
    </div>
  </div>;
}

function ReportForm({ date, report, saving, onSave, onCancel }: {
  date: string;
  report: CellReport | null;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [happened, setHappened] = useState(report ? Boolean(report.aconteceu) : true);
  const meetingField = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (report) meetingField.current?.focus(); }, [report]);
  return <form className="cgestao-form" onSubmit={event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void onSave({ ...data, dataReuniao: report?.data_reuniao ?? data.dataReuniao, aconteceu: happened });
  }}>
    <h3>{report ? "Corrigir relatório" : "Formulário do encontro"}</h3>
    <label>Data<input name="dataReuniao" type="date" defaultValue={date} required readOnly={Boolean(report)} /></label>
    <label>O encontro aconteceu?<select ref={meetingField} value={String(happened)} onChange={event => setHappened(event.target.value === "true")}><option value="true">Sim</option><option value="false">Não</option></select></label>
    <label hidden={!happened}>Presentes<input name="presentes" type="number" min="0" max="999" defaultValue={report?.presentes ?? 0} disabled={!happened} /></label>
    <label hidden={!happened}>Visitantes<input name="visitantes" type="number" min="0" max="999" defaultValue={report?.visitantes ?? 0} disabled={!happened} /></label>
    <label className="cgestao-wide">Observações<textarea name="observacoes" rows={2} maxLength={1000} defaultValue={report?.observacoes ?? ""} /></label>
    <button type="submit" disabled={saving}>{report ? "Salvar correção" : "Enviar relatório"}</button>
    {report && <button type="button" disabled={saving} onClick={onCancel}>Cancelar correção</button>}
  </form>;
}
