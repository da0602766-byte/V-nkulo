"use client";
import SafeImage from "./SafeImage";


import TransientFeedback from "./TransientFeedback";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { matchesDirectorySearch } from "../lib/directory-search";
import "./leadership-member-ux.css";

type Leader = {
  membership_id: number;
  usuario_id: number;
  nome: string;
  email: string;
  foto_perfil?: string | null;
  papel: string;
  titulo: string;
};

type Person = {
  membership_id: number;
  nome: string;
  email: string;
  papel: string;
  oficial: number;
};

type HistoryItem = {
  id: number;
  evento: string;
  resultado: string;
  metadados: string;
  criado_em: string;
  autor_nome: string | null;
};

type PastoralDashboard = {
  canViewCharts: boolean;
  canManageAccess: boolean;
  metrics?: {
    members: number;
    visitors: number;
    posts30d: number;
    upcomingEvents: number;
    ministries: number;
    cells: number;
  };
  series?: Array<{
    month: string;
    label: string;
    members: number;
    visitors: number;
    posts: number;
    events: number;
  }>;
  pastors?: Array<{
    usuario_id: number;
    nome: string;
    email: string;
    acesso_concedido: number;
  }>;
  cellReports?: Array<{
    id: number;
    data_reuniao: string;
    aconteceu: number;
    presentes: number;
    visitantes: number;
    observacoes: string;
    celula_nome: string;
    enviado_por_nome: string;
  }>;
};

export default function LeadershipWorkspace({
  mode,
  communityName,
}: {
  mode: "leader" | "pastoral";
  communityName: string;
}) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState("");
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState<PastoralDashboard | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [candidateReady, setCandidateReady] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(mode === "pastoral");
  const [dashboardError, setDashboardError] = useState("");
  const [actionError, setActionError] = useState("");
  const leadershipRequest = useRef<AbortController | null>(null);
  const candidateRequest = useRef<AbortController | null>(null);
  const dashboardRequest = useRef<AbortController | null>(null);
  const mutationRef = useRef(false);

  const loadCandidates = useCallback(async () => {
    candidateRequest.current?.abort();
    const controller = new AbortController();
    candidateRequest.current = controller;
    setCandidateLoading(true); setCandidateError(""); setCandidateReady(false);
    try {
      const all: Person[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      do {
        const address = new URL("/api/pilot/pessoas", window.location.origin);
        address.searchParams.set("aba", "membros"); address.searchParams.set("limite", "50");
        if (cursor) address.searchParams.set("cursor", cursor);
        const response = await fetch(address, { cache: "no-store", signal: controller.signal });
        const data = await responseJson(response) as { error?: string; people?: Person[]; canManage?: boolean; nextCursor?: string | null };
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar os membros disponíveis.");
        if (!data.canManage) { if (!controller.signal.aborted) setPeople([]); return; }
        if (!Array.isArray(data.people)) throw new Error("A lista de membros chegou incompleta. Tente novamente.");
        all.push(...data.people);
        cursor = data.nextCursor || null;
        if (cursor && (typeof cursor !== "string" || seen.has(cursor) || seen.size >= 60)) throw new Error("Não foi possível completar a lista de membros. Tente novamente.");
        if (cursor) seen.add(cursor);
      } while (cursor && !controller.signal.aborted);
      if (controller.signal.aborted) return;
      setPeople([...new Map(all.map(person => [person.membership_id, person])).values()]);
      setCandidateReady(true);
      setSelectedMembership(current => all.some(person => String(person.membership_id) === current) ? current : "");
    } catch (cause) {
      if (!controller.signal.aborted) setCandidateError((cause as Error).message);
    } finally {
      if (candidateRequest.current === controller) { candidateRequest.current = null; setCandidateLoading(false); }
    }
  }, []);

  const load = useCallback(async () => {
    leadershipRequest.current?.abort();
    const controller = new AbortController(); leadershipRequest.current = controller;
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/pilot/leadership", { cache: "no-store", signal: controller.signal });
      const data = await responseJson(response) as { error?: string; leaders?: Leader[]; history?: HistoryItem[]; canManage?: boolean };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar a liderança.");
      if (!Array.isArray(data.leaders) || !Array.isArray(data.history)) throw new Error("O painel chegou incompleto. Tente novamente.");
      if (controller.signal.aborted) return;
      setLeaders(data.leaders); setHistory(data.history); setCanManage(Boolean(data.canManage)); setLoaded(true);
      if (data.canManage) void loadCandidates();
      else { candidateRequest.current?.abort(); setCandidateReady(false); setCandidateError(""); setPeople([]); }
    } catch (cause) {
      if (!controller.signal.aborted) setLoadError((cause as Error).message);
    } finally {
      if (leadershipRequest.current === controller) { leadershipRequest.current = null; setLoading(false); }
    }
  }, [loadCandidates]);

  const loadDashboard = useCallback(async () => {
    dashboardRequest.current?.abort();
    const controller = new AbortController(); dashboardRequest.current = controller;
    setDashboardLoading(true); setDashboardError("");
    try {
      const response = await fetch("/api/pilot/pastoral-dashboard", { cache: "no-store", signal: controller.signal });
      const data = await responseJson(response) as PastoralDashboard & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os indicadores.");
      if ([data.series, data.cellReports, data.pastors].some(value => value !== undefined && !Array.isArray(value))) throw new Error("Os indicadores chegaram incompletos. Tente novamente.");
      if (typeof data.canViewCharts !== "boolean" || (data.canViewCharts && (!data.metrics || ![data.metrics.members, data.metrics.visitors, data.metrics.posts30d, data.metrics.upcomingEvents, data.metrics.ministries, data.metrics.cells].every(value => typeof value === "number" && Number.isFinite(value))))) throw new Error("Os indicadores chegaram incompletos. Tente novamente.");
      if (controller.signal.aborted) return;
      setDashboard(data);
    } catch (cause) {
      if (!controller.signal.aborted) setDashboardError((cause as Error).message);
    } finally {
      if (dashboardRequest.current === controller) { dashboardRequest.current = null; setDashboardLoading(false); }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); if (mode === "pastoral") void loadDashboard(); else setDashboard(null); }, 0);
    return () => { window.clearTimeout(timer); leadershipRequest.current?.abort(); candidateRequest.current?.abort(); dashboardRequest.current?.abort(); };
  }, [load, loadDashboard, mode]);

  const candidates = useMemo(
    () =>
      people.filter(
        (person) =>
          !["LIDER", "PASTOR", "ADMIN_COMUNIDADE", "SUPERADMIN"].includes(
            person.papel,
          ),
      ),
    [people],
  );

  const visibleCandidates = candidates.filter(person => matchesDirectorySearch(candidateSearch, person.nome, person.email));

  async function addLeader() {
    if (mutationRef.current || !canManage || !candidateReady || candidateLoading || candidateError || loading || loadError) return;
    const person = people.find(
      (item) => item.membership_id === Number(selectedMembership),
    );
    if (!person || !candidates.some(candidate => candidate.membership_id === person.membership_id)) return;
    mutationRef.current = true;
    setWorking(true);
    setMessage(""); setActionError("");
    try {
      const response = await fetch("/api/pilot/pessoas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: person.membership_id,
          oficial: true,
          papel: "LIDER",
          titulo: "LÍDER",
          permissions: [],
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível adicionar o líder.");
      }
      setSelectedMembership("");
      setMessage("Líder adicionado com registro no histórico.");
      await load();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      mutationRef.current = false; setWorking(false);
    }
  }

  async function updatePastoralAccess(userId: number, enabled: boolean) {
    if (mutationRef.current || !dashboard?.canManageAccess || dashboardLoading || dashboardError) return;
    mutationRef.current = true;
    setWorking(true);
    setMessage(""); setActionError("");
    try {
      const response = await fetch("/api/pilot/pastoral-dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enabled }),
      });
      const result = await responseJson(response) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar o acesso.");
      setMessage(enabled ? "Acesso aos gráficos concedido." : "Acesso aos gráficos removido.");
      await loadDashboard();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      mutationRef.current = false; setWorking(false);
    }
  }

  const pastoral = leaders.filter((item) => item.papel === "PASTOR");
  return (
    <section className="leadership-workspace">
      <header className="leadership-hero">
        <div>
          <p className="pilot-kicker">
            {mode === "pastoral" ? "PAINEL PASTORAL" : "PAINEL DE LIDERANÇA"}
          </p>
          <h1>
            {mode === "pastoral"
              ? "Cuidado, direção e histórico"
              : "Liderança e organização"}
          </h1>
          <p>
            {communityName}: acompanhe a equipe, os indicadores disponíveis e as alterações recentes.
          </p>
        </div>
        <button type="button" className="leadership-refresh" disabled={loading || working} onClick={() => { void load(); if (mode === "pastoral") void loadDashboard(); }}>Atualizar painel</button>
      </header>

      {loading && <p className="leadership-query-status" role="status">{loaded ? "Atualizando equipe e histórico…" : "Carregando equipe e histórico…"}</p>}
      {loadError && <LoadError message={loadError} retained={loaded} onRetry={() => void load()} />}
      {loaded && <div className="leadership-metrics">
        <article><small>Lideranças ativas</small><strong>{leaders.length}</strong></article>
        <article><small>Pastoral</small><strong>{pastoral.length}</strong></article>
        <article><small>Alterações recentes</small><strong>{history.length}</strong></article>
      </div>}

      {mode === "pastoral" && dashboardLoading && <p className="leadership-query-status" role="status">Carregando indicadores…</p>}
      {mode === "pastoral" && dashboardError && <LoadError message={dashboardError} retained={Boolean(dashboard)} onRetry={() => void loadDashboard()} />}
      {mode === "pastoral" && dashboard && (
        <PastoralCommunityDashboard
          data={dashboard}
          working={working || dashboardLoading || Boolean(dashboardError)}
          onAccessChange={updatePastoralAccess}
        />
      )}

      {canManage && (
        <section className="leadership-add-card">
          <div>
            <p className="pilot-kicker">NOVA LIDERANÇA</p>
            <h2>Adicionar líder</h2>
            <p>Somente membros ativos desta comunidade podem ser selecionados.</p>
          </div>
          {candidateLoading && <p role="status">Carregando todos os membros disponíveis…</p>}
          {candidateError && <LoadError message={candidateError} onRetry={() => void loadCandidates()} />}
          {!candidateLoading && !candidateError && !candidateReady && <p>A gestão de membros não está disponível para o seu perfil.</p>}
          {candidateReady && !candidateError && <><label>Buscar membro<input type="search" value={candidateSearch} onChange={event => { setCandidateSearch(event.target.value); setSelectedMembership(""); }} placeholder="Nome ou e-mail" /></label>
          <label>
            Pessoa
            <select
              disabled={working || candidateLoading || loading || Boolean(loadError)}
              value={selectedMembership}
              onChange={(event) => setSelectedMembership(event.target.value)}
            >
              <option value="">Selecione um membro</option>
              {visibleCandidates.map((person) => (
                <option key={person.membership_id} value={person.membership_id}>
                  {person.nome} · {person.email}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selectedMembership || working || candidateLoading || loading || Boolean(loadError)}
            onClick={() => void addLeader()}
          >
            {working ? "Salvando…" : "Adicionar líder"}
          </button>
          {!visibleCandidates.length && <p>{candidateSearch ? "Nenhum membro corresponde à busca." : "Nenhum membro disponível para adicionar à liderança."}</p>}
          </>}
        </section>
      )}

      {actionError && <p className="leadership-query-error" role="alert">{actionError}</p>}
      {message && <TransientFeedback className="operations-feedback" role="status">{message}</TransientFeedback>}

      {loaded && <div className="leadership-content-grid">
        <section className="leadership-list-card">
          <header>
            <div>
              <p className="pilot-kicker">EQUIPE</p>
              <h2>Lideranças da comunidade</h2>
            </div>
          </header>
          <div>
            {leaders.map((leader) => (
              <article key={leader.membership_id}>
                <span>
                  {leader.foto_perfil ? (
                    <SafeImage loading="lazy" fallbackName={leader.nome} fallbackKind="avatar" src={leader.foto_perfil} alt="" />
                  ) : (
                    initials(leader.nome)
                  )}
                </span>
                <div>
                  <strong>{leader.nome}</strong>
                  <small>{leader.titulo || roleLabel(leader.papel)}</small>
                </div>
                <em>{roleLabel(leader.papel)}</em>
              </article>
            ))}
            {!leaders.length && <p className="platform-post-empty">Nenhuma liderança disponível para consulta.</p>}
          </div>
        </section>

        <section className="leadership-history-card">
          <header>
            <div>
              <p className="pilot-kicker">AUDITORIA</p>
              <h2>Histórico de alterações</h2>
            </div>
          </header>
          <div>
            {history.map((item) => (
              <article key={item.id}>
                <span aria-hidden="true">↗</span>
                <div>
                  <strong>{historyLabel(item.evento)}</strong>
                  <small>
                    {item.autor_nome || "Sistema"} · {formatDate(item.criado_em)}
                  </small>
                </div>
                <em>{item.resultado}</em>
              </article>
            ))}
            {!history.length && (
              <p className="platform-post-empty">Nenhuma alteração registrada.</p>
            )}
          </div>
        </section>
      </div>}
    </section>
  );
}

function LoadError({message, retained = false, onRetry}: {message: string; retained?: boolean; onRetry: () => void}) {
  return <div className="leadership-query-error" role="alert"><p>{retained ? "Os dados anteriores continuam visíveis. " : ""}{message}</p><button type="button" onClick={onRetry}>Tentar novamente</button></div>;
}

function PastoralCommunityDashboard({
  data,
  working,
  onAccessChange,
}: {
  data: PastoralDashboard;
  working: boolean;
  onAccessChange: (userId: number, enabled: boolean) => Promise<void>;
}) {
  if (!data.canViewCharts) {
    return (
      <section className="pastoral-dashboard-locked">
        <span aria-hidden="true">◇</span>
        <div><p className="pilot-kicker">INDICADORES RESTRITOS</p><h2>Acesso ainda não liberado</h2><p>Somente quem criou esta comunidade pode liberar os gráficos para outros pastores.</p></div>
      </section>
    );
  }
  const metrics = data.metrics!;
  const series = data.series || [];
  const maxActivity = Math.max(1, ...series.flatMap((item) => [item.posts, item.events]));
  return (
    <section className="pastoral-community-dashboard">
      <header><div><p className="pilot-kicker">SAÚDE DA COMUNIDADE</p><h2>Indicadores pastorais</h2><p>Acompanhe a participação e as atividades desta comunidade.</p></div></header>
      <div className="pastoral-kpi-grid">
        {[
          ["Membros ativos", metrics.members], ["Visitantes", metrics.visitors],
          ["Publicações · 30 dias", metrics.posts30d], ["Próximos eventos", metrics.upcomingEvents],
          ["Ministérios", metrics.ministries], ["Células", metrics.cells],
        ].map(([label, value]) => <article key={String(label)}><small>{label}</small><strong>{value}</strong></article>)}
      </div>
      <div className="pastoral-activity-chart" role="img" aria-label="Atividade mensal no feed e nos eventos">
        <div><p className="pilot-kicker">ATIVIDADE · ÚLTIMOS 6 MESES</p><h3>Feed e eventos</h3></div>
        <div className="pastoral-chart-bars">
          {series.map((item) => (
            <div key={item.month}>
              <span style={{ "--bar-posts": `${Math.max(0, (item.posts / maxActivity) * 100)}%`, "--bar-events": `${Math.max(0, (item.events / maxActivity) * 100)}%` } as React.CSSProperties}><i title={`${item.posts} publicações`} /><b title={`${item.events} eventos`} /></span>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
        <footer><span><i /> Publicações</span><span><i /> Eventos</span></footer>
      </div>
      <details className="pastoral-chart-data"><summary>Ver valores por mês</summary><table><caption>Publicações e eventos nos últimos seis meses</caption><thead><tr><th scope="col">Mês</th><th scope="col">Publicações</th><th scope="col">Eventos</th></tr></thead><tbody>{series.map(item => <tr key={item.month}><th scope="row">{item.label}</th><td>{item.posts}</td><td>{item.events}</td></tr>)}</tbody></table>{!series.length && <p>Não há dados mensais disponíveis.</p>}</details>
      <section className="pastoral-cell-reports-v2">
        <header><div><p className="pilot-kicker">RELATÓRIOS DAS CÉLULAS</p><h3>Acompanhamento semanal</h3></div><span>{Math.min((data.cellReports || []).length, 10)} {(data.cellReports || []).length === 1 ? "recente" : "recentes"}</span></header>
        <div>{(data.cellReports || []).slice(0, 10).map((report) => <article key={report.id}><time>{new Date(`${report.data_reuniao}T12:00:00`).toLocaleDateString("pt-BR")}</time><div><strong>{report.celula_nome}</strong><small>{report.aconteceu ? `${report.presentes} presentes · ${report.visitantes} visitantes` : "Encontro não realizado"}</small></div><p>{report.observacoes || `Enviado por ${report.enviado_por_nome}`}</p></article>)}{!(data.cellReports || []).length && <p>Nenhum relatório semanal recebido.</p>}</div>
      </section>
      {data.canManageAccess && (
        <details className="pastoral-access-manager">
          <summary>Gerenciar acesso de outros pastores</summary>
          <p>O criador da comunidade mantém acesso permanente. Cada liberação abaixo vale somente para esta comunidade.</p>
          <div>{(data.pastors || []).map((pastor) => (
            <article key={pastor.usuario_id}><div><strong>{pastor.nome}</strong><small>{pastor.email}</small></div><button type="button" disabled={working} className={pastor.acesso_concedido ? "danger" : ""} onClick={() => void onAccessChange(pastor.usuario_id, !pastor.acesso_concedido)}>{pastor.acesso_concedido ? "Remover acesso" : "Liberar gráficos"}</button></article>
          ))}</div>
        </details>
      )}
    </section>
  );
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("A resposta do servidor chegou incompleta. Tente novamente.");
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function roleLabel(role: string) {
  return (
    {
      LIDER: "Líder",
      PASTOR: "Pastoral",
      ADMIN_COMUNIDADE: "Administrador",
      SUPERADMIN: "Proprietário",
    }[role] || role
  );
}

function historyLabel(event: string) {
  return (
    {
      OFICIAL_COMUNIDADE_ATUALIZADO: "Função ou permissão atualizada",
      PERFIL_DA_COMUNIDADE_ATUALIZADO: "Perfil da comunidade atualizado",
      TEMA_DA_COMUNIDADE_ATUALIZADO: "Tema da comunidade atualizado",
      PROPRIETARIO_REMOVEU_MEMBRO_DA_COMUNIDADE:
        "Pessoa removida da comunidade",
    }[event] || event.replaceAll("_", " ")
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
