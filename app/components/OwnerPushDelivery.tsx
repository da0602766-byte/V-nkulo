"use client";

import { useEffect, useState } from "react";
import type { PushQueueState, PushQueueStatus } from "../lib/push-delivery-types";

const LABELS: Record<PushQueueState, string> = {
  PENDENTE: "Na fila", PROCESSANDO: "Em processamento", ACEITO: "Aceitas pelo serviço",
  FALHA: "Com falha", EXPIRADA: "Prazo encerrado", CANCELADA: "Canceladas",
};
const REASONS: Record<string, string> = {
  PRAZO_EXPIRADO: "Prazo de envio encerrado", LIMITE_TENTATIVAS: "Limite de tentativas atingido",
  ACESSO_OU_AVISO_INDISPONIVEL: "Aviso lido ou acesso indisponível", DESTINO_INVALIDO: "Serviço de push inválido",
  ASSINATURA_EXPIRADA: "Inscrição do aparelho expirada", RECUSADO_PELO_PROVEDOR: "Recusada pelo serviço",
  ESPERA_EXCEDE_PRAZO: "Espera solicitada excede o prazo", REDE_OU_TIMEOUT: "Aguardando nova tentativa de conexão",
  REENVIO_AGENDADO: "Nova tentativa agendada",
};

function date(value: string | null) {
  if (!value) return "Ainda não registrado";
  const parsed = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "medium",
  }).format(parsed);
}

export default function OwnerPushDelivery() {
  const [data, setData] = useState<PushQueueStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let disposed = false, denied = false, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: AbortController | null = null;
    const available = () => !disposed && document.visibilityState === "visible" && navigator.onLine;
    const stop = () => { clearTimeout(timer); current?.abort(); current = null; };
    async function load() {
      if (!available() || denied || current) return;
      const controller = new AbortController();
      current = controller;
      setLoading(true);
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch("/api/proprietario/notificacoes", { cache: "no-store", signal: controller.signal });
        if (disposed || current !== controller) return;
        if (response.status === 401 || response.status === 403) {
          denied = true;
          setData(null);
          throw new Error("Acesso indisponível. Entre novamente com a conta do proprietário.");
        }
        if (!response.ok) throw new Error("Não foi possível atualizar o diagnóstico. Tente novamente.");
        const next = await response.json() as PushQueueStatus;
        if (current !== controller || !available()) return;
        setData(next);
        setError("");
        failures = 0;
      } catch (reason) {
        if (!disposed && current === controller && available()) {
          failures++;
          setError(controller.signal.aborted ? "A consulta demorou mais que o esperado. Tente novamente." :
            reason instanceof Error ? reason.message : "Diagnóstico temporariamente indisponível.");
        }
      } finally {
        clearTimeout(timeout);
        if (!disposed && current === controller) {
          current = null;
          setLoading(false);
          if (available() && !denied) timer = setTimeout(() => void load(), Math.min(120_000, 30_000 * 2 ** Math.min(failures, 2)));
        }
      }
    }
    function resume() {
      stop();
      if (!navigator.onLine) setError("Sem conexão. Os dados serão atualizados quando a conexão voltar.");
      if (available()) void load();
      else setLoading(false);
    }
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    resume();
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [refresh]);

  return <section className="ops-panel owner-push" aria-labelledby="owner-push-title">
    <header className="ops-panel-title owner-push-header">
      <div><h3 id="owner-push-title">Entrega de notificações</h3><p>Atualização a cada 30 segundos enquanto esta tela estiver visível e conectada.</p></div>
      <button className="oc-button" type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? "Consultando…" : "Atualizar diagnóstico"}</button>
    </header>
    <div className="owner-push-body">
      {error && <p className="owner-push-error" role="alert">{error}{data ? " Exibindo a última consulta válida." : ""}</p>}
      {!data && !error && <p role="status">Consultando a fila de notificações…</p>}
      {data && <>
        <div className="owner-push-health">
          <span className={`ops-status ${data.configured ? "success" : "danger"}`}>{data.configured ? "Envio configurado" : "Envio não configurado"}</span>
          <span className={`ops-status ${data.schedulerHealthy ? "success" : "neutral"}`}>{data.schedulerHealthy ? "Agendamento ativo" : "Agendamento sem confirmação recente"}</span>
          {data.processing && <span className="ops-status neutral">Processamento em andamento</span>}
        </div>
        {!data.configured && <p>As credenciais do serviço de push precisam ser configuradas no servidor para habilitar o envio.</p>}
        {!data.schedulerHealthy && <p>O processamento sem usuários conectados depende do agendamento do servidor. Nenhuma execução foi confirmada nos últimos 12 minutos.</p>}
        {data.lastError && <p className="owner-push-error">{data.lastError}</p>}
        <dl className="owner-push-metrics">{(Object.keys(LABELS) as PushQueueState[]).map(state => <div key={state}>
          <dt>{LABELS[state]}</dt><dd>{data.counts[state].toLocaleString("pt-BR")}</dd>
        </div>)}</dl>
        <p className="owner-push-note">Cada entrega corresponde a um aviso para um aparelho. O aceite pelo serviço não confirma a exibição no aparelho. Os registros encerrados são mantidos por até 7 dias, sujeitos à limpeza e à remoção de inscrições.</p>
        <dl className="owner-push-times">
          <div><dt>Consulta atual</dt><dd>{date(data.checkedAt)}</dd></div>
          <div><dt>Última execução agendada</dt><dd>{date(data.lastScheduledAt)}</dd></div>
          <div><dt>Último processamento concluído</dt><dd>{date(data.lastFinishedAt)}</dd></div>
          <div><dt>Próxima tentativa elegível</dt><dd>{data.nextAttemptAt ? date(data.nextAttemptAt) : "Nenhuma na fila"}</dd></div>
        </dl>
        <div className="owner-push-recent"><h4>Atividade recente</h4><p>Até 12 registros de entrega, sem conteúdo das mensagens ou identificação dos destinatários.</p>
          {data.recent.length ? <ul>{data.recent.map(item => <li key={item.id}>
            <div><strong>{LABELS[item.state]}</strong><small>{item.reason ? REASONS[item.reason] || "Consulte o estado da entrega" : "Sem ocorrência adicional"}</small></div>
            <span>{item.attempts} {item.attempts === 1 ? "tentativa" : "tentativas"}{item.lastStatus !== null ? ` · ${item.lastStatus === 0 ? "Sem resposta" : `HTTP ${item.lastStatus}`}` : ""}</span>
            <time>{date(item.updatedAt)}</time>
          </li>)}</ul> : <p className="owner-push-empty">Nenhuma entrega registrada nesta fila. Novos avisos individuais entram quando há um aparelho habilitado.</p>}
        </div>
      </>}
    </div>
  </section>;
}
