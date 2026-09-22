"use client";

import { useCallback, useEffect, useState } from "react";

type Preview = {
  sourceCount: number; destinationCount: number; matchedCount: number;
  pendingCount: number; extraDestinationCount: number; activeCount: number; ready: boolean;
};
type Run = { inserted_count: number; updated_count: number; unchanged_count: number };
const endpoint = "/api/proprietario/integracoes/supabase/profile-catalog";

export default function SupabaseProfileCatalog() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível comparar os perfis.");
      setPreview(data.preview);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível comparar os perfis.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function sync() {
    if (!preview || preview.extraDestinationCount > 0) return;
    setLoading(true); setError(""); setRun(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "SINCRONIZAR_PERFIS", sourceCount: preview.sourceCount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível sincronizar os perfis.");
      setPreview(data.preview); setRun(data.run);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível sincronizar os perfis.");
    } finally { setLoading(false); }
  }

  return <article className="publication-panel" aria-busy={loading}>
    <h3>Perfis no Supabase</h3>
    <p>Esta etapa copia ID, nome, e-mail, situação ativa e data de criação. Senhas, sessões, contatos adicionais e vínculos não são enviados. O login e os cadastros continuam funcionando pelo D1.</p>
    <div aria-live="polite">
      {loading && <p>Conferindo perfis nos dois bancos.</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <div className={`publication-check ${preview.ready ? "success" : "danger"}`} role="status">
        <strong>{preview.ready ? "Perfis sincronizados" : "Sincronização pendente"}</strong>
        <p>D1: {preview.sourceCount} · Supabase: {preview.destinationCount} · Iguais: {preview.matchedCount} · Pendentes: {preview.pendingCount}</p>
        <p>{preview.activeCount} ativo(s) na origem. Nenhuma senha ou sessão é transferida.</p>
        {preview.extraDestinationCount > 0 && <p>Há {preview.extraDestinationCount} perfil(is) extras no Supabase. A sincronização foi bloqueada para revisão.</p>}
      </div>}
      {run && <p role="status">Execução concluída: {run.inserted_count} inserido(s), {run.updated_count} atualizado(s) e {run.unchanged_count} inalterado(s).</p>}
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>Atualizar comparação</button>
      <button type="button" disabled={loading || !preview || preview.ready || preview.extraDestinationCount > 0} onClick={() => void sync()}>Sincronizar perfis</button>
    </div>
  </article>;
}
