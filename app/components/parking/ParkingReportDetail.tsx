"use client";

import { useEffect, useState } from "react";
import { readJson } from "./format";
import ParkingReportCard from "./ParkingReportCard";
import type { ParkingReport } from "./types";

const endpoint = "/api/pilot/estacionamento/relatorios";

async function loadReport(id: number, signal?: AbortSignal) {
  const response = await fetch(`${endpoint}?id=${id}`, { cache: "no-store", signal });
  const result = await readJson<{ relatorios?: ParkingReport[]; error?: string }>(response);
  if (!response.ok) throw new Error(result.error || "Não foi possível consultar o relatório.");
  return result.relatorios?.[0] ?? null;
}

export default function ParkingReportDetail({ id }: { id: number }) {
  const [report, setReport] = useState<ParkingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadReport(id, controller.signal)
      .then(setReport)
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  async function act(body: Record<string, unknown>) {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error((await readJson<{ error?: string }>(response)).error || "Não foi possível atualizar o relatório.");
      setReport(await loadReport(id));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return <section className="gestao-console parking-report-detail" aria-busy={loading || working}>
    <a href="/painel?view=estacionamento&aba=relatorios">Voltar ao estacionamento</a>
    <h2>Relatório de plantão</h2>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Consultando relatório…</p>}
    {!loading && !report && !error && <p>Relatório indisponível para este acesso.</p>}
    {report && <ParkingReportCard report={report} working={working} onAction={act} />}
  </section>;
}
