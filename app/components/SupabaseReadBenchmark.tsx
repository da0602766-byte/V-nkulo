"use client";

import { useState } from "react";

type Result = {
  measuredAt: string; sourceCount: number; destinationCount: number;
  matching: boolean; d1MedianMs: number; supabaseMedianMs: number;
  recommendation: "KEEP_D1" | "INSPECT_FRESHNESS";
};

export default function SupabaseReadBenchmark() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function measure() {
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/read-benchmark", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível comparar as leituras.");
      setResult(data.result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível comparar as leituras.");
    } finally { setLoading(false); }
  }

  return <article className="publication-panel" aria-busy={loading}>
    <h3>Velocidade de leitura</h3>
    <p>Meça três leituras iguais dos vínculos no D1 e no Supabase. O teste devolve somente contagens e tempos. O login e as permissões continuam no D1; uma medição não muda a origem do sistema.</p>
    <div aria-live="polite">
      {loading && <p>Comparando três leituras protegidas. Isso pode levar alguns segundos.</p>}
      {error && <p role="alert">{error}</p>}
      {result && <div className={`publication-check ${result.matching ? "success" : "danger"}`} role="status">
        <strong>{result.matching ? "Dados iguais" : "Diferença encontrada"}</strong>
        <p>D1: {result.sourceCount} · Supabase: {result.destinationCount} · Mediana D1: {result.d1MedianMs} ms · Mediana Supabase: {result.supabaseMedianMs} ms.</p>
        <p>{!result.matching ? "Não use a réplica para leitura até reconciliar os vínculos."
          : result.recommendation === "KEEP_D1" ? "Neste teste, o D1 foi mais rápido. A leitura de autorização permanece nele."
            : "O Supabase respondeu mais rápido neste teste, mas ainda não tem sessões e permissões adicionais nem sincronização contínua. A autorização permanece no D1."}</p>
        <small>Medido em {result.measuredAt} (UTC).</small>
      </div>}
    </div>
    <button type="button" className="secondary" disabled={loading} onClick={() => void measure()}>Comparar leituras</button>
  </article>;
}
