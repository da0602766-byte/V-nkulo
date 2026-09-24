"use client";

import { useEffect, useState } from "react";
import type { PushQueueState } from "../lib/push-delivery-types";
import type { DashboardChannel, DashboardPeriod, OperationalDashboard } from "../lib/operational-dashboard-types";
import OperationalDeliveryChart from "./OperationalDeliveryChart";

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
    dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

export default function OwnerPushDelivery() {
  const [data, setData] = useState<OperationalDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [period, setPeriod] = useState<DashboardPeriod>("24h");
  const [channel, setChannel] = useState<DashboardChannel>("all");

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
        const response = await fetch(`/api/proprietario/operacao?period=${period}&channel=${channel}`, { cache: "no-store", signal: controller.signal });
        if (disposed || current !== controller) return;
        if (response.status === 401 || response.status === 403) {
          denied = true;
          setData(null);
          throw new Error("Acesso indisponível. Entre novamente com a conta do proprietário.");
        }
        if (!response.ok) throw new Error("Não foi possível atualizar o diagnóstico. Tente novamente.");
        const next = await response.json() as OperationalDashboard;
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
  }, [refresh, period, channel]);

  return <section className="ops-panel owner-push" aria-labelledby="owner-push-title">
    <header className="ops-panel-title owner-push-header">
      <div><h3 id="owner-push-title">Dashboard operacional</h3><p>Notificações e integrações. Atualização a cada 30 segundos enquanto esta tela estiver visível e conectada.</p></div>
      <button className="oc-button" type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? "Consultando…" : "Atualizar diagnóstico"}</button>
    </header>
    <div className="owner-push-body">
      <div className="opd-filters">
        <label>Período<select value={period} onChange={event => { setData(null); setError(""); setPeriod(event.target.value as DashboardPeriod); }}>
          <option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option>
        </select></label>
        <label>Canal de notificação<select value={channel} onChange={event => { setData(null); setError(""); setChannel(event.target.value as DashboardChannel); }}>
          <option value="all">Todos os canais</option><option value="web">Web</option><option value="android">Android</option>
        </select></label>
      </div>
      {error && <p className="owner-push-error" role="alert">{error}{data ? " Exibindo a última consulta válida." : ""}</p>}
      {!data && !error && <p role="status">Consultando a fila de notificações…</p>}
      {data && <>
        <div className="owner-push-health">
          <span className={`ops-status ${data.schedulerHealthy ? "success" : "neutral"}`}>{data.schedulerHealthy ? "Agendamento ativo" : "Agendamento sem confirmação recente"}</span>
          {data.processing && <span className="ops-status neutral">Processamento em andamento</span>}
        </div>
        {!data.schedulerHealthy && <p>O processamento sem usuários conectados depende do agendamento do servidor. Nenhuma execução foi confirmada nos últimos 12 minutos.</p>}
        <dl className="owner-push-metrics opd-highlights">
          <div><dt>Registros no período</dt><dd>{data.total.toLocaleString("pt-BR")}</dd><small>Por última atualização</small></div>
          <div><dt>Taxa de aceite</dt><dd>{data.acceptanceRate === null ? "—" : `${data.acceptanceRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</dd><small>Entre aceitas, falhas e expiradas</small></div>
          <div><dt>Tempo médio até o aceite</dt><dd>{data.meanAcceptanceSeconds === null ? "—" : `${data.meanAcceptanceSeconds.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`}</dd><small>Inclui espera na fila e novas tentativas</small></div>
        </dl>
        <OperationalDeliveryChart series={data.series} period={data.period} />
        <dl className="owner-push-metrics">{(Object.keys(LABELS) as PushQueueState[]).map(state => <div key={state}>
          <dt>{LABELS[state]}</dt><dd>{data.counts[state].toLocaleString("pt-BR")}</dd>
        </div>)}</dl>
        <p className="owner-push-note">Cada registro corresponde a um aviso para um aparelho, contado pelo estado e pela última atualização no período. O aceite pelo serviço não confirma o recebimento ou a exibição no aparelho. Registros encerrados permanecem por até 7 dias, sujeitos à limpeza e à remoção de inscrições. Estes dados não constituem um histórico completo.</p>
        <p className="owner-push-note">{data.retried.toLocaleString("pt-BR")} registros com mais de uma tentativa. Maior tempo até o aceite: {data.maxAcceptanceSeconds === null ? "sem amostras" : `${data.maxAcceptanceSeconds.toLocaleString("pt-BR")} s`}. A medição tem precisão de segundos; “—” indica ausência de amostras.</p>
        <div className="opd-channels">{data.channels.map(item => <div key={item.channel}><strong>{item.channel === "android" ? "Android" : "Web"}</strong><p>{item.total.toLocaleString("pt-BR")} registros · {item.accepted.toLocaleString("pt-BR")} aceitas · {item.failed.toLocaleString("pt-BR")} com falha</p></div>)}</div>
        <div className="opd-queue"><h4>Fila atual</h4><p>Canal selecionado, independentemente do período.</p>
          <dl className="owner-push-times"><div><dt>Aguardando envio</dt><dd>{data.queue.pending.toLocaleString("pt-BR")}</dd></div><div><dt>Em processamento</dt><dd>{data.queue.processing.toLocaleString("pt-BR")}</dd></div>
            <div><dt>Pendente mais antiga</dt><dd>{data.queue.oldestPendingAt ? date(data.queue.oldestPendingAt) : "Nenhuma na fila"}</dd></div>
            <div><dt>Próxima tentativa elegível</dt><dd>{data.queue.nextAttemptAt ? date(data.queue.nextAttemptAt) : "Nenhuma na fila"}</dd></div></dl>
        </div>
        <div className="opd-integrations"><h4>Estado das integrações</h4><p>Configuração da plataforma; não depende dos filtros de notificações. Exibe a última verificação registrada.</p>
          <div className="opd-connectors">{data.connectors.map(item => <article key={item.id}><h5>{item.name}</h5>
            <span className={`ops-status ${item.status === "connected" ? "success" : "neutral"}`}>{({ connected: "Verificada", not_connected: "Não conectada", paused: "Pausada", attention: "Requer atenção", unavailable: "Indisponível" })[item.status]}</span>
            <p>{item.message}</p><small>Verificação: {date(item.checkedAt)}</small>{item.lastSyncAt && <small>Sincronização: {date(item.lastSyncAt)}</small>}
          </article>)}</div><a className="oc-button" href="/proprietario?tab=integrations">Gerenciar integrações</a>
        </div>
        <dl className="owner-push-times">
          <div><dt>Consulta atual</dt><dd>{date(data.checkedAt)}</dd></div>
          <div><dt>Última execução agendada</dt><dd>{date(data.lastScheduledAt)}</dd></div>
          <div><dt>Último processamento concluído</dt><dd>{date(data.lastFinishedAt)}</dd></div>
          <div><dt>Horários</dt><dd>Brasília (UTC−03)</dd></div>
        </dl>
        <div className="owner-push-recent"><h4>Atividade recente</h4><p>Até 12 registros de entrega, sem conteúdo das mensagens ou identificação dos destinatários.</p>
          {data.recent.length ? <ul>{data.recent.map(item => <li key={item.id}>
            <div><strong>{item.channel === "android" ? "Android" : "Web"} · {LABELS[item.state]}</strong><small>{item.reason ? REASONS[item.reason] || "Consulte o estado da entrega" : "Sem ocorrência adicional"}</small></div>
            <span>{item.attempts} {item.attempts === 1 ? "tentativa" : "tentativas"}{item.lastStatus !== null ? ` · ${item.lastStatus === 0 ? "Sem resposta" : `HTTP ${item.lastStatus}`}` : ""}</span>
            <time>{date(item.updatedAt)}</time>
          </li>)}</ul> : <p className="owner-push-empty">Nenhuma entrega registrada no período e canal selecionados.</p>}
        </div>
      </>}
    </div>
  </section>;
}
