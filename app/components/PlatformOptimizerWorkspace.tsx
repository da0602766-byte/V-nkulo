"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type OptimizationCounts = {
  expiredSessions: number;
  expiredPasswordResets: number;
  resolvedJoinRequests: number;
  oldAuditRecords: number;
  expiredInvites: number;
  expiredTemporaryAccesses: number;
};

type OptimizerStatus = {
  config: {
    enabled: boolean;
    intervalHours: 24 | 168 | 720;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lockUntil: string | null;
    lastErrorAt: string | null;
    lastResult: {
      finishedAt: string;
      durationMs: number;
      trigger: "MANUAL" | "AUTOMATICO";
      counts: OptimizationCounts;
    } | null;
  };
  candidates: OptimizationCounts;
  retention: { auditDays: number; resolvedJoinRequestDays: number };
  message?: string;
  error?: string;
};

const TASKS: { key: keyof OptimizationCounts; label: string; detail: string; action: string }[] = [
  { key: "expiredSessions", label: "Sessões vencidas", detail: "Tokens que já não dão acesso", action: "excluídas" },
  { key: "expiredPasswordResets", label: "Redefinições vencidas", detail: "Links usados ou fora da validade", action: "excluídas" },
  { key: "resolvedJoinRequests", label: "Solicitações concluídas", detail: "Decisões encerradas há mais de 7 dias", action: "excluídas" },
  { key: "oldAuditRecords", label: "Auditoria antiga", detail: "Registros acima da retenção de 14 dias", action: "excluídos" },
  { key: "expiredInvites", label: "Convites vencidos", detail: "Convites pendentes fora da validade", action: "marcados como expirados" },
  { key: "expiredTemporaryAccesses", label: "Acessos encerrados", detail: "Autorizações cujo horário terminou", action: "marcados como expirados" },
];

const INTERVAL_LABELS: Record<number, string> = {
  24: "Todos os dias",
  168: "Toda semana",
  720: "A cada 30 dias",
};

export default function PlatformOptimizerWorkspace() {
  const [status, setStatus] = useState<OptimizerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "run" | null>(null);
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [intervalHours, setIntervalHours] = useState<24 | 168 | 720>(168);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proprietario/otimizacao", { cache: "no-store" });
      const result = await response.json() as OptimizerStatus;
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o otimizador.");
      setStatus(result);
      setEnabled(result.config.enabled);
      setIntervalHours(result.config.intervalHours);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pendingTotal = useMemo(
    () => TASKS.reduce((total, task) => total + Number(status?.candidates[task.key] || 0), 0),
    [status?.candidates],
  );

  async function mutate(payload: Record<string, unknown>, mode: "save" | "run") {
    setWorking(mode);
    setMessage("");
    try {
      const response = await fetch("/api/proprietario/otimizacao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as OptimizerStatus;
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
      setStatus(result);
      setEnabled(result.config.enabled);
      setIntervalHours(result.config.intervalHours);
      setMessage(result.message || "Alteração concluída.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(null);
    }
  }

  if (loading && !status) {
    return <div className="platform-optimizer-loading" role="status">Verificando a manutenção da plataforma…</div>;
  }

  return (
    <section className="platform-optimizer" aria-labelledby="optimizer-title">
      <header className="platform-optimizer-heading">
        <div>
          <p className="pilot-kicker">MANUTENÇÃO SEGURA</p>
          <h2 id="optimizer-title">Otimizador da plataforma</h2>
          <p>Centraliza as retenções oficiais e encerra credenciais que já perderam a validade.</p>
        </div>
        <span className={status?.config.enabled ? "active" : "paused"}>
          <i aria-hidden="true" />
          {status?.config.enabled ? "Automático ativo" : "Automático pausado"}
        </span>
      </header>

      {message ? <p className="platform-optimizer-feedback" role="status">{message}</p> : null}

      <section className="platform-optimizer-summary" aria-label="Resumo da manutenção">
        <div><small>Itens prontos</small><strong>{pendingTotal}</strong><span>Nenhum dado ativo nesta contagem</span></div>
        <div><small>Última execução</small><strong>{formatDate(status?.config.lastRunAt)}</strong><span>{lastExecutionLabel(status)}</span></div>
        <div><small>Próxima verificação</small><strong>{status?.config.enabled ? formatDate(status?.config.nextRunAt) : "Pausada"}</strong><span>{INTERVAL_LABELS[status?.config.intervalHours || 168]}</span></div>
      </section>

      <div className="platform-optimizer-layout">
        <section className="platform-optimizer-candidates">
          <header><div><h3>Diagnóstico atual</h3><p>Contagem antes da próxima execução.</p></div><button type="button" onClick={() => void load()} disabled={loading || Boolean(working)}>↻ Atualizar</button></header>
          <div>
            {TASKS.map((task) => (
              <article key={task.key}>
                <span>{Number(status?.candidates[task.key] || 0)}</span>
                <div><strong>{task.label}</strong><small>{task.detail}</small></div>
              </article>
            ))}
          </div>
        </section>

        <aside className="platform-optimizer-controls">
          <header><h3>Programação</h3><p>A execução automática ocorre durante o uso normal da plataforma.</p></header>
          <label className="platform-optimizer-switch">
            <span><strong>Manutenção automática</strong><small>Executa somente as seis regras listadas.</small></span>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <i aria-hidden="true" />
          </label>
          <label className="platform-optimizer-frequency">
            <span>Frequência</span>
            <select value={intervalHours} onChange={(event) => setIntervalHours(Number(event.target.value) as 24 | 168 | 720)} disabled={!enabled}>
              <option value={24}>Todos os dias</option>
              <option value={168}>Toda semana</option>
              <option value={720}>A cada 30 dias</option>
            </select>
          </label>
          <button type="button" className="secondary" disabled={Boolean(working)} onClick={() => void mutate({ action: "CONFIGURAR", enabled, intervalHours }, "save")}>{working === "save" ? "Salvando…" : "Salvar programação"}</button>
          <button type="button" disabled={Boolean(working)} onClick={() => void mutate({ action: "EXECUTAR_AGORA" }, "run")}>{working === "run" ? "Executando manutenção…" : "Executar manutenção agora"}</button>
        </aside>
      </div>

      <details className="platform-optimizer-history">
        <summary><span>Último resultado</span><small>{status?.config.lastResult ? `${formatDate(status.config.lastResult.finishedAt)} · ${status.config.lastResult.durationMs} ms` : "Nenhuma execução registrada"}</small><i aria-hidden="true">⌄</i></summary>
        {status?.config.lastResult ? (
          <div>
            {TASKS.map((task) => <span key={task.key}><strong>{Number(status.config.lastResult?.counts[task.key] || 0)}</strong><small>{task.label} {task.action}</small></span>)}
          </div>
        ) : <p>O primeiro relatório aparecerá depois da execução automática ou manual.</p>}
      </details>

      <section className="platform-optimizer-safety" role="note">
        <span aria-hidden="true">✓</span>
        <div><strong>Limites de segurança</strong><p>O otimizador não remove usuários, comunidades, ministérios, publicações, imagens, arquivos ou qualquer registro ativo. Ele também não altera código nem comprime imagens já enviadas.</p></div>
      </section>
    </section>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Ainda não executado";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function lastExecutionLabel(status: OptimizerStatus | null) {
  if (!status?.config.lastResult) return "Aguardando a primeira manutenção";
  return status.config.lastResult.trigger === "MANUAL" ? "Iniciada pelo proprietário" : "Executada automaticamente";
}
