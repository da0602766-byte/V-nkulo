"use client";

import { useCallback, useEffect, useState } from "react";

type Catalog = { source: number; destination: number; changed: number };
type Status = { enabled: boolean; running: boolean; lastAttemptAt: string | null;
  lastSuccessAt: string | null; nextRunAt: string | null; lastError: string | null;
  lastResult: { tenants: Catalog; profiles: Catalog; memberships: Catalog } | null };
type ScheduleStatus = { installedAt: string | null; lastHeartbeatAt: string | null; jobId: number | null };

export default function SupabaseAutoSync() {
  const [status, setStatus] = useState<Status | null>(null);
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    try {
      const [autoResponse, scheduleResponse] = await Promise.all([
        fetch("/api/proprietario/integracoes/supabase/auto-sync", { cache: "no-store" }),
        fetch("/api/proprietario/integracoes/supabase/schedule", { cache: "no-store" }),
      ]);
      const [autoBody, scheduleBody] = await Promise.all([autoResponse.json(), scheduleResponse.json()]);
      if (!autoResponse.ok) throw new Error(autoBody.error || "Não foi possível consultar a sincronização.");
      if (!scheduleResponse.ok) throw new Error(scheduleBody.error || "Não foi possível consultar o agendamento.");
      setStatus(autoBody.status);
      setSchedule(scheduleBody.status);
      setCheckedAt(Date.now());
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

  async function activateSchedule() {
    if (!window.confirm("Ativar no Supabase uma conferência a cada cinco minutos, mesmo sem acessos ao site? Uma credencial exclusiva de disparo será guardada no Vault.")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/schedule", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível ativar o agendamento.");
      setSchedule(body.status);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível ativar o agendamento."); }
    finally { setLoading(false); }
  }

  const format = (date: string | null) => date ? new Date(date).toLocaleString("pt-BR") : "Ainda não ocorreu";
  const stale = Boolean(schedule?.installedAt && schedule.lastHeartbeatAt && checkedAt - Date.parse(schedule.lastHeartbeatAt) > 15 * 60_000);
  return <article className="publication-panel" aria-busy={loading}>
    <h3>Sincronização automática</h3>
    <p>Confere comunidades, perfis mínimos e vínculos nessa ordem. Após alterações relevantes, a cópia é atualizada em segundo plano. Com o agendamento ativo, uma conferência adicional é disparada a cada cinco minutos, mesmo sem acessos ao site. Login, senhas, sessões e permissões especiais continuam somente no D1.</p>
    <div aria-live="polite">
      {loading && <p>Consultando a sincronização…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <div className={`publication-check ${status.lastError ? "danger" : status.enabled ? "success" : ""}`} role="status">
        <strong>{status.running ? "Sincronizando" : status.enabled ? "Automática ativa" : "Automática pausada"}</strong>
        <p>Última conferência concluída: {format(status.lastSuccessAt)}.</p>
        {status.lastResult && <p>Na última conferência: {status.lastResult.tenants.source} comunidades, {status.lastResult.profiles.source} perfis e {status.lastResult.memberships.source} vínculos. Atualizados: {status.lastResult.tenants.changed}, {status.lastResult.profiles.changed} e {status.lastResult.memberships.changed}, respectivamente.</p>}
        {status.lastError && <p>Revisão necessária: {status.lastError}</p>}
      </div>}
      {schedule && <div className={`publication-check ${stale ? "danger" : schedule.installedAt ? "success" : ""}`} role="status">
        <strong>{schedule.installedAt ? stale ? "Agendamento sem contato recente" : schedule.lastHeartbeatAt ? "Agendamento no Supabase ativo" : "Agendamento instalado; aguardando primeiro chamado" : "Agendamento no Supabase ainda não ativado"}</strong>
        {schedule.installedAt && <p>Instalado em {format(schedule.installedAt)}. Último chamado recebido: {format(schedule.lastHeartbeatAt)}.</p>}
        {stale && <p>Confira o histórico do Cron e as respostas do pg_net no Supabase. O site mantém a sincronização por alterações e acessos.</p>}
      </div>}
    </div>
    <div className="publication-actions">
      <button type="button" className="secondary" disabled={loading} onClick={() => void refresh()}>Atualizar estado</button>
      {status?.enabled ? <>
        <button type="button" className="secondary" disabled={loading || status.running} onClick={() => void act("RECONCILE")}>Conferir agora</button>
        <button type="button" className="secondary" disabled={loading} onClick={() => void act("DISABLE")}>Pausar</button>
        <button type="button" className="secondary" disabled={loading} onClick={() => void activateSchedule()}>{schedule?.installedAt ? "Reativar agendamento" : "Ativar agendamento sem tráfego"}</button>
      </> : <button type="button" className="secondary" disabled={loading || !status} onClick={() => void act("ENABLE")}>Ativar sincronização</button>}
    </div>
  </article>;
}
