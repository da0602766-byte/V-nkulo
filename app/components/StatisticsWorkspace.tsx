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
    () => buildGrowth(data?.growth.users || [], data?.growth.communities || []),
    [data],
  );
  const maxGrowth = Math.max(
    1,
    ...growth.flatMap((item) => [item.users, item.communities]),
  );

  return (
    <section className="statistics-workspace">
      <header className="workspace-heading">
        <div>
          <p className="pilot-kicker">ESTATÍSTICAS DA PLATAFORMA</p>
          <h1>Crescimento e participação</h1>
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
          <span className="pilot-loader" />
          <p>Calculando indicadores da comunidade ativa…</p>
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
            <div className="statistics-bars" aria-label="Gráfico de crescimento">
              {growth.map((item) => (
                <div key={item.month}>
                  <div>
                    <i
                      style={{ height: `${Math.max(5, (item.users / maxGrowth) * 100)}%` }}
                      title={`${item.users} novos usuários`}
                    />
                    <i
                      style={{
                        height: `${Math.max(5, (item.communities / maxGrowth) * 100)}%`,
                      }}
                      title={`${item.communities} novas comunidades`}
                    />
                  </div>
                  <span>{formatMonthKey(item.month)}</span>
                </div>
              ))}
            </div>
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
) {
  const now = new Date();
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
