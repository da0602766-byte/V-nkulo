"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Statistics = {
  totals: { users: number; communities: number };
  activity: { posts: number; events: number; confirmations: number };
  conversion: { visitors: number; members: number; rate: number };
  growth: {
    users: { mes: string; total: number }[];
    communities: { mes: string; total: number }[];
  };
  generatedAt: string;
};

export default function StatisticsWorkspace() {
  const [data, setData] = useState<Statistics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/estatisticas", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar.");
      }
      setData(result);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const growth = useMemo(
    () => buildGrowth(data?.growth.users || [], data?.growth.communities || [], data?.generatedAt),
    [data],
  );
  const maxGrowth = Math.max(1, ...growth.flatMap((item) => [item.users, item.communities]));
  const hasGrowth = growth.some((item) => item.users > 0 || item.communities > 0);

  return (
    <section className="statistics-workspace">
      <header className="workspace-heading">
        <div>
          <p className="pilot-kicker">ESTATÍSTICAS DA PLATAFORMA</p>
          <h2>Crescimento e participação</h2>
          <p>
            Indicadores agregados para o superadministrador. Nenhum dado
            pessoal é exibido neste painel.
          </p>
        </div>
        <button onClick={load} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </header>
      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <div className="statistics-loading">
          {!error && <span className="pilot-loader" />}
          <p>{error ? "Indicadores indisponíveis. Use Atualizar para tentar novamente." : "Calculando indicadores da plataforma…"}</p>
        </div>
      ) : (
        <>
          <div className="statistics-cards">
            <article>
              <span>USUÁRIOS ATIVOS</span>
              <strong>{data.totals.users}</strong>
              <small>Crescimento de contas ativas</small>
            </article>
            <article>
              <span>COMUNIDADES ATIVAS</span>
              <strong>{data.totals.communities}</strong>
              <small>Tenants ativos na plataforma</small>
            </article>
            <article>
              <span>ATIVIDADE NO FEED</span>
              <strong>{data.activity.posts}</strong>
              <small>Publicações atualmente publicadas</small>
            </article>
            <article>
              <span>EVENTOS</span>
              <strong>{data.activity.events}</strong>
              <small>{data.activity.confirmations} confirmações registradas</small>
            </article>
            <article className="statistics-conversion">
              <span>VISITANTE → MEMBRO</span>
              <strong>{data.conversion.rate}%</strong>
              <small>
                {data.conversion.members} integrados de{" "}
                {data.conversion.visitors} visitantes ativos
              </small>
            </article>
          </div>

          <section className="statistics-growth">
            <header>
              <div>
                <p className="pilot-kicker">ÚLTIMOS 6 MESES</p>
                <h2>Novos usuários e comunidades</h2>
              </div>
              <div className="statistics-legend">
                <span><i />Usuários</span>
                <span><i />Comunidades</span>
              </div>
            </header>
            <div className="statistics-chart" role="group" aria-label="Novos cadastros por mês, conforme a base da plataforma">
              <div className="statistics-chart-scale" aria-hidden="true"><span>0</span><span>Máximo no período: {maxGrowth}</span></div>
              {growth.map((item) => (
                <div className="statistics-chart-row" key={item.month} aria-label={`${formatMonthKey(item.month)}: ${item.users} ${item.users === 1 ? "novo usuário" : "novos usuários"} e ${item.communities} ${item.communities === 1 ? "nova comunidade" : "novas comunidades"}`}>
                  <span className="statistics-chart-month">{formatMonthKey(item.month)}</span>
                  <div className="statistics-chart-pair" aria-hidden="true">
                    <div className="statistics-chart-track"><span className="statistics-chart-bar users" style={{ width: `${(item.users / maxGrowth) * 100}%` }} /></div>
                    <div className="statistics-chart-track"><span className="statistics-chart-bar communities" style={{ width: `${(item.communities / maxGrowth) * 100}%` }} /></div>
                  </div>
                  <div className="statistics-chart-values" aria-hidden="true"><strong>{item.users}</strong><strong>{item.communities}</strong></div>
                </div>
              ))}
            </div>
            {!hasGrowth && <p className="statistics-chart-empty">Nenhum novo cadastro registrado nesse período.</p>}
            <p className="statistics-chart-source">Fonte: datas de criação dos cadastros de usuários e comunidades da plataforma. Zero indica nenhum registro no mês.</p>
          </section>
          <p className="statistics-updated">
            Atualizado em {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            }).format(new Date(data.generatedAt))}
          </p>
        </>
      )}
    </section>
  );
}

function buildGrowth(
  users: { mes: string; total: number }[],
  communities: { mes: string; total: number }[],
  generatedAt?: string,
) {
  const now = generatedAt ? new Date(generatedAt) : new Date();
  const months = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + offset, 1),
    );
    return date.toISOString().slice(0, 7);
  });
  const usersByMonth = new Map(users.map((item) => [item.mes, Number(item.total)]));
  const communitiesByMonth = new Map(
    communities.map((item) => [item.mes, Number(item.total)]),
  );
  return months.map((month) => ({
    month,
    users: usersByMonth.get(month) || 0,
    communities: communitiesByMonth.get(month) || 0,
  }));
}

function formatMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(".", "");
}
