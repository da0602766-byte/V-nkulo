"use client";

import { formatTime, parkingLabel } from "./format";
import { ParkingMetric } from "./ParkingUi";
import type { ParkingReport } from "./types";

type Props = {
  report: ParkingReport;
  working: boolean;
  onAction: (body: Record<string, unknown>) => Promise<unknown>;
};

export default function ParkingReportCard({ report, working, onAction }: Props) {
  const reviewing = Boolean(report.pode_revisar) && report.status === "AGUARDANDO_LIDER";
  const correcting = Boolean(report.proprio) && report.status === "CORRECAO_SOLICITADA";
  return <article className="gestao-report-form">
    <header>
      <span className={`gestao-badge status-${report.status.toLowerCase()}`}>{parkingLabel(report.status)}</span>
      <h3>{report.titulo}</h3>
    </header>
    <div className="parking-workspace-metrics parking-report-metrics">
      <ParkingMetric label="Entradas" value={report.entradas} tone="green" icon="arrow" />
      <ParkingMetric label="Saídas" value={report.saidas} icon="logout" />
      <ParkingMetric label="Ocorrências" value={report.ocorrencias} tone="amber" icon="shield" />
    </div>
    <dl>
      <div><dt>Responsável</dt><dd>{report.membro_nome}</dd></div>
      <div><dt>Período</dt><dd>{formatTime(report.inicia_em)} até {formatTime(report.termina_em)}</dd></div>
      <div className="gestao-wide"><dt>Resumo</dt><dd>{report.resumo || "Nenhum resumo informado."}</dd></div>
      {report.motivo_correcao && <div className="gestao-wide"><dt>Motivo da correção</dt><dd>{report.motivo_correcao}</dd></div>}
    </dl>
    {reviewing && <div className="gestao-row-actions">
      <button type="button" className="gestao-primary" disabled={working} onClick={() => void onAction({ id: report.id, acao: "CONFIRMAR" })}>Confirmar e enviar ao pastor</button>
      <details>
        <summary>Solicitar correção</summary>
        <form onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void onAction({ id: report.id, acao: "CORRIGIR", motivo: data.get("motivo") });
        }}>
          <label>O que precisa ser corrigido?<textarea name="motivo" required maxLength={1200} rows={3} /></label>
          <button type="submit" className="gestao-ghost" disabled={working}>Enviar pedido de correção</button>
        </form>
      </details>
    </div>}
    {correcting && <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onAction({ id: report.id, acao: "ENVIAR", resumo: data.get("resumo") });
    }}>
      <label>Resumo corrigido<textarea name="resumo" defaultValue={report.resumo} required maxLength={1200} rows={3} /></label>
      <button type="submit" className="gestao-primary" disabled={working}>Enviar correção</button>
    </form>}
  </article>;
}
