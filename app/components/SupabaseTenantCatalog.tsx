"use client";

import { useCallback, useEffect, useState } from "react";

type Preview = {
  sourceCount: number;
  destinationCount: number;
  matchedCount: number;
  pendingCount: number;
  extraDestinationCount: number;
  sourceByStatus: Record<string, number>;
  sourceDemoCount: number;
  ready: boolean;
};
type Run = { run_id: string; inserted_count: number; updated_count: number; unchanged_count: number };

const endpoint = "/api/proprietario/integracoes/supabase/tenant-catalog";

export default function SupabaseTenantCatalog() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível comparar as comunidades.");
      setPreview(data.preview);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível comparar as comunidades.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function sync() {
    if (!preview || preview.extraDestinationCount > 0) return;
    setLoading(true);
    setError("");
    setRun(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "SINCRONIZAR_COMUNIDADES", sourceCount: preview.sourceCount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível sincronizar as comunidades.");
      setPreview(data.preview);
      setRun(data.run);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível sincronizar as comunidades.");
    } finally {
      setLoading(false);
    }
  }

  return <article className="publication-panel" aria-busy={loading}>
    <h3>Catálogo de comunidades</h3>
    <p>Compare e sincronize somente os dados básicos das comunidades entre D1 e Supabase. Cadastros de pessoas, vínculos, arquivos e logins seguem no Vínkulo atual.</p>
    <div aria-live="polite">
      {loading && <p>Conferindo comunidades nos dois bancos.</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <div className={`publication-check ${preview.ready ? "success" : "danger"}`} role="status">
        <strong>{preview.ready ? "Catálogo sincronizado" : "Sincronização pendente"}</strong>
        <p>D1: {preview.sourceCount} · Supabase: {preview.destinationCount} · Iguais: {preview.matchedCount} · Pendentes: {preview.pendingCount}</p>
        <p>Inclui {preview.sourceDemoCount} de demonstração e {preview.sourceByStatus.ARQUIVADA || 0} arquivada(s), com seus estados preservados.</p>
        {preview.extraDestinationCount > 0 && <p>Há {preview.extraDestinationCount} comunidade(s) extras no Supabase. A sincronização foi bloqueada para revisão.</p>}
      </div>}
      {run && <p role="status">Execução concluída: {run.inserted_count} inserida(s), {run.updated_count} atualizada(s) e {run.unchanged_count} inalterada(s).</p>}
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>Atualizar comparação</button>
      <button type="button" disabled={loading || !preview || preview.ready || preview.extraDestinationCount > 0} onClick={() => void sync()}>Sincronizar comunidades</button>
    </div>
  </article>;
}
