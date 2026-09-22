"use client";

import { useCallback, useEffect, useState } from "react";

type Catalog = { source: number; destination: number; changed: number };
type Status = { enabled: boolean; running: boolean; lastAttemptAt: string | null;
  lastSuccessAt: string | null; nextRunAt: string | null; lastError: string | null;
  lastResult: { tenants: Catalog; profiles: Catalog; memberships: Catalog } | null };

export default function SupabaseAutoSync() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/auto-sync", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível consultar a sincronização.");
      setStatus(body.status);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível consultar a sincronização."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(timer); }, [refresh]);

  async function act(action: "ENABLE" | "DISABLE" | "RECONCILE") {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/auto-sync", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível alterar a sincronização.");
      setStatus(body.status);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível alterar a sincronização."); }
    finally { setLoading(false); }
  }

  const format = (date: string | null) => date ? new Date(date).toLocaleString("pt-BR") : "Ainda não ocorreu";
  return <article className="publication-panel" aria-busy={loading}>
    <h3>Sincronização automática</h3>
    <p>Confere comunidades, perfis mínimos e vínculos nessa ordem. Após alterações relevantes, a cópia é atualizada em segundo plano; enquanto houver tráfego, uma conferência adicional ocorre em até cinco minutos. Login, senhas, sessões e permissões especiais continuam somente no D1.</p>
    <div aria-live="polite">
      {loading && <p>Consultando a sincronização…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <div className={`publication-check ${status.lastError ? "danger" : status.enabled ? "success" : ""}`} role="status">
        <strong>{status.running ? "Sincronizando" : status.enabled ? "Automática ativa" : "Automática pausada"}</strong>
        <p>Última conferência concluída: {format(status.lastSuccessAt)}.</p>
        {status.lastResult && <p>Na última conferência: {status.lastResult.tenants.source} comunidades, {status.lastResult.profiles.source} perfis e {status.lastResult.memberships.source} vínculos. Atualizados: {status.lastResult.tenants.changed}, {status.lastResult.profiles.changed} e {status.lastResult.memberships.changed}, respectivamente.</p>}
        {status.lastError && <p>Revisão necessária: {status.lastError}</p>}
      </div>}
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={loading} onClick={() => void refresh()}>Atualizar estado</button>
      {status?.enabled ? <>
        <button type="button" className="secondary" disabled={loading || status.running} onClick={() => void act("RECONCILE")}>Conferir agora</button>
        <button type="button" className="secondary" disabled={loading} onClick={() => void act("DISABLE")}>Pausar</button>
      </> : <button type="button" className="secondary" disabled={loading || !status} onClick={() => void act("ENABLE")}>Ativar sincronização</button>}
    </div>
  </article>;
}
