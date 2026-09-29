"use client";

import { useCallback, useEffect, useState } from "react";

type Preview = { sourceCount: number; destinationCount: number; matchedCount: number;
  pendingCount: number; extraDestinationCount: number; ready: boolean };
type Run = { inserted_count: number; updated_count: number; unchanged_count: number };
const endpoint = "/api/proprietario/integracoes/supabase/profile-details";

export default function SupabaseProfileDetails() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível comparar os dados cadastrais.");
      setPreview(data.preview);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível comparar os dados cadastrais."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function sync() {
    if (!preview || preview.extraDestinationCount || !window.confirm("Transferir ao Supabase os dados cadastrais completos dos perfis conferidos? Senhas, sessões e tokens não serão enviados.")) return;
    setLoading(true); setError(""); setRun(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "SINCRONIZAR_DADOS_CADASTRAIS", sourceCount: preview.sourceCount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível transferir os dados cadastrais.");
      setPreview(data.preview); setRun(data.run);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível transferir os dados cadastrais."); }
    finally { setLoading(false); }
  }

  return <article className="publication-panel" aria-busy={loading}>
    <h3>Dados cadastrais no Supabase</h3>
    <p>Compare e copie contatos, endereço, dados de cadastro, ministério e preferências dos perfis. O destino fica restrito ao servidor. Senhas, sessões, CPF e tokens não entram nesta carga. O cadastro continua operando pelo D1 até a migração do módulo.</p>
    <div aria-live="polite">
      {loading && <p>Conferindo os dados cadastrais nos dois bancos.</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <div className={`publication-check ${preview.ready ? "success" : "danger"}`} role="status">
        <strong>{preview.ready ? "Dados conferidos" : "Cópia pendente"}</strong>
        <p>D1: {preview.sourceCount} · Supabase: {preview.destinationCount} · Iguais: {preview.matchedCount} · Pendentes: {preview.pendingCount}</p>
        {preview.extraDestinationCount > 0 && <p>Há {preview.extraDestinationCount} registro(s) extras no Supabase; a cópia está bloqueada para revisão.</p>}
      </div>}
      {run && <p role="status">Execução concluída: {run.inserted_count} inserido(s), {run.updated_count} atualizado(s) e {run.unchanged_count} inalterado(s).</p>}
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>Atualizar comparação</button>
      <button type="button" disabled={loading || !preview || preview.ready || preview.extraDestinationCount > 0} onClick={() => void sync()}>Transferir dados cadastrais</button>
    </div>
  </article>;
}
