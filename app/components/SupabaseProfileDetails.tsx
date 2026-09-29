"use client";

import { useCallback, useEffect, useState } from "react";

type Preview = { sourceCount: number; destinationCount: number; matchedCount: number;
  pendingCount: number; extraDestinationCount: number; ready: boolean };
type Run = { inserted_count: number; updated_count: number; unchanged_count: number };
const endpoint = "/api/proprietario/integracoes/supabase/profile-details";

export default function SupabaseProfileDetails() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [copyTracked, setCopyTracked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível comparar os dados cadastrais.");
      setPreview(data.preview);
      setAutoSyncEnabled(data.autoSyncEnabled === true);
      setCopyTracked(data.copyTracked === true);
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
      if (data.preview?.destinationCount > 0) setCopyTracked(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível transferir os dados cadastrais."); }
    finally { setLoading(false); }
  }

  async function removeCopy() {
    if (!preview || !copyTracked || !window.confirm("Remover do Supabase toda a cópia dos dados cadastrais? A origem no D1 será preservada.")) return;
    setLoading(true); setError(""); setRun(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "REMOVER_COPIA_DADOS_CADASTRAIS", destinationCount: preview.destinationCount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível remover a cópia dos dados cadastrais.");
      setPreview(data.preview); setCopyTracked(false); setAutoSyncEnabled(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível remover a cópia dos dados cadastrais."); }
    finally { setLoading(false); }
  }

  async function changeAutoSync(action: "ENABLE" | "DISABLE") {
    if (action === "ENABLE" && !window.confirm("Manter os dados cadastrais copiados no Supabase após futuras alterações no D1?")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar a sincronização dos dados cadastrais.");
      setAutoSyncEnabled(data.autoSyncEnabled === true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível alterar a sincronização dos dados cadastrais."); }
    finally { setLoading(false); }
  }

  return <article className="publication-panel" aria-busy={loading}>
    <h3>Dados cadastrais no Supabase</h3>
    <p>Compare e copie contatos, endereço, campos personalizados de cadastro, ministério e preferências dos perfis. O destino fica restrito ao servidor. As tabelas de senhas, sessões, tokens e identidade CPF não entram nesta carga. O cadastro continua operando pelo D1 até a migração do módulo.</p>
    <div aria-live="polite">
      {loading && <p>Conferindo os dados cadastrais nos dois bancos.</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <div className={`publication-check ${preview.ready ? "success" : "danger"}`} role="status">
        <strong>{preview.ready ? "Dados conferidos" : "Cópia pendente"}</strong>
        <p>D1: {preview.sourceCount} · Supabase: {preview.destinationCount} · Iguais: {preview.matchedCount} · Pendentes: {preview.pendingCount}</p>
        {preview.extraDestinationCount > 0 && <p>Há {preview.extraDestinationCount} registro(s) extras no Supabase; a cópia está bloqueada para revisão.</p>}
      </div>}
      {run && <p role="status">Execução concluída: {run.inserted_count} inserido(s), {run.updated_count} atualizado(s) e {run.unchanged_count} inalterado(s).</p>}
      <p role="status">Cópia contínua dos dados cadastrais: {autoSyncEnabled ? "ativada" : "desativada"}. {autoSyncEnabled ? "Executada quando a sincronização automática geral estiver ativa." : "Ative após a primeira cópia conferida."}</p>
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>Atualizar comparação</button>
      <button type="button" disabled={loading || !preview || preview.ready || preview.extraDestinationCount > 0} onClick={() => void sync()}>Transferir dados cadastrais</button>
      {autoSyncEnabled
        ? <button type="button" className="secondary" disabled={loading} onClick={() => void changeAutoSync("DISABLE")}>Pausar cópia contínua</button>
        : <button type="button" className="secondary" disabled={loading || !preview?.ready} onClick={() => void changeAutoSync("ENABLE")}>Manter cópia atualizada</button>}
      {copyTracked && <button type="button" className="secondary" disabled={loading} onClick={() => void removeCopy()}>Remover cópia do Supabase</button>}
    </div>
  </article>;
}
