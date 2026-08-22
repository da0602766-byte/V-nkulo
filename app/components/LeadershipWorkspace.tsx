"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setMessage("");
    try {
      const [leadershipResponse, peopleResponse, dashboardResponse] = await Promise.all([
        fetch("/api/pilot/leadership", { cache: "no-store" }),
        fetch("/api/pilot/pessoas", { cache: "no-store" }),
        mode === "pastoral"
          ? fetch("/api/pilot/pastoral-dashboard", { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      const leadership = await responseJson(leadershipResponse) as { error?: string; leaders?: Leader[]; history?: HistoryItem[]; canManage?: boolean };
      const peopleData = await responseJson(peopleResponse) as { error?: string; people?: Person[]; canManage?: boolean };
      if (!leadershipResponse.ok) {
        throw new Error(leadership.error || "Falha ao carregar liderança.");
      }
      setLeaders(leadership.leaders || []);
      setHistory(leadership.history || []);
      setCanManage(Boolean(leadership.canManage && peopleData.canManage));
      if (peopleResponse.ok) setPeople(peopleData.people || []);
      if (dashboardResponse) {
        const dashboardData = await responseJson(dashboardResponse) as PastoralDashboard & { error?: string };
        if (!dashboardResponse.ok) throw new Error(dashboardData.error || "Falha ao carregar indicadores pastorais.");
        setDashboard(dashboardData as PastoralDashboard);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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

  async function addLeader() {
    const person = people.find(
      (item) => item.membership_id === Number(selectedMembership),
    );
    if (!person) return;
    setWorking(true);
    setMessage("");
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
      await load(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function updatePastoralAccess(userId: number, enabled: boolean) {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/pastoral-dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enabled }),
      });
      const result = await responseJson(response) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar o acesso.");
      setMessage(enabled ? "Acesso aos gráficos concedido." : "Acesso aos gráficos removido.");
      await load(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <div className="people-loading">Carregando painel de liderança…</div>;
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
            {communityName}: funções e alterações validadas no servidor, sem
            conceder acesso além da comunidade ativa.
          </p>
        </div>
        <span>{mode === "pastoral" ? pastoral.length : leaders.length}</span>
      </header>

      <div className="leadership-metrics">
        <article><small>Lideranças ativas</small><strong>{leaders.length}</strong></article>
        <article><small>Pastoral</small><strong>{pastoral.length}</strong></article>
        <article><small>Alterações recentes</small><strong>{history.length}</strong></article>
      </div>

      {mode === "pastoral" && dashboard && (
        <PastoralCommunityDashboard
          data={dashboard}
          working={working}
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
          <label>
            Pessoa
            <select
              value={selectedMembership}
              onChange={(event) => setSelectedMembership(event.target.value)}
            >
              <option value="">Selecione um membro</option>
              {candidates.map((person) => (
                <option key={person.membership_id} value={person.membership_id}>
                  {person.nome} · {person.email}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selectedMembership || working}
            onClick={() => void addLeader()}
          >
            {working ? "Salvando…" : "Adicionar líder"}
          </button>
        </section>
      )}

      {message && <p className="operations-feedback" role="status">{message}</p>}

      <div className="leadership-content-grid">
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
                    <img src={leader.foto_perfil} alt="" />
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
      </div>
    </section>
  );
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
      <header><div><p className="pilot-kicker">SAÚDE DA COMUNIDADE</p><h2>Indicadores pastorais</h2><p>Dados isolados da comunidade ativa. Nenhuma informação de outra comunidade entra nestes totais.</p></div><span>Últimos 6 meses</span></header>
      <div className="pastoral-kpi-grid">
        {[
          ["Membros ativos", metrics.members], ["Visitantes", metrics.visitors],
          ["Publicações · 30 dias", metrics.posts30d], ["Próximos eventos", metrics.upcomingEvents],
          ["Ministérios", metrics.ministries], ["Células", metrics.cells],
        ].map(([label, value]) => <article key={String(label)}><small>{label}</small><strong>{value}</strong></article>)}
      </div>
      <div className="pastoral-activity-chart" role="img" aria-label="Atividade mensal no feed e nos eventos">
        <div><p className="pilot-kicker">ATIVIDADE</p><h3>Feed e eventos</h3></div>
        <div className="pastoral-chart-bars">
          {series.map((item) => (
            <div key={item.month}>
              <span style={{ "--bar-posts": `${Math.max(4, (item.posts / maxActivity) * 100)}%`, "--bar-events": `${Math.max(4, (item.events / maxActivity) * 100)}%` } as React.CSSProperties}><i title={`${item.posts} publicações`} /><b title={`${item.events} eventos`} /></span>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
        <footer><span><i /> Publicações</span><span><i /> Eventos</span></footer>
      </div>
      <section className="pastoral-cell-reports-v2">
        <header><div><p className="pilot-kicker">RELATÓRIOS DAS CÉLULAS</p><h3>Acompanhamento semanal</h3></div><span>{(data.cellReports || []).length} recentes</span></header>
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
