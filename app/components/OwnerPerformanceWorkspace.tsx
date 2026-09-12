"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./OwnerCommandCenter.css";

type Serie = { chave: string; total: number };
type Tendencia = { atual: number; anterior: number; variacao: number; direcao: string };

type Desempenho = {
  janelaDias: number;
  falhas: {
    serie: Serie[];
    tendencia: Tendencia;
    anomalias: (Serie & { desvio: number })[];
    totalAcoes: number;
    taxa: number;
    porEvento: { evento: string; resultado: string; total: number; ultima: string }[];
  };
  autenticacao: {
    bloqueados_agora: number;
    contas_com_falha: number;
    tentativas_acumuladas: number;
  };
  incidentes: { abertos: number; criticos: number; ocorrencias: number };
  incidentesPorArea: { area: string; gravidade: string; total: number; ocorrencias: number }[];
  indisponiveis: { indicador: string; origem: string }[];
  geradoEm: string;
};

const JANELAS = [7, 14, 30, 90];

export default function OwnerPerformanceWorkspace() {
  const [data, setData] = useState<Desempenho | null>(null);
  const [dias, setDias] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (janela: number) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/proprietario/desempenho?dias=${janela}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar.");
      setData(result);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(dias), 0);
    return () => window.clearTimeout(timer);
  }, [load, dias]);

  const anomalias = useMemo(
    () => new Set((data?.falhas.anomalias || []).filter((item) => item.desvio > 0).map((item) => item.chave)),
    [data],
  );
  const maximo = Math.max(1, ...(data?.falhas.serie || []).map((ponto) => ponto.total));

  return (
    <section className="owner-directory-panel occ-panel" aria-label="Desempenho e saúde do sistema">
      <header className="owner-directory-header">
        <div>
          <strong>Desempenho e saúde do sistema</strong>
          <span>Sinais registrados pela própria plataforma · janela de {data?.janelaDias || dias} dias</span>
        </div>
        <div className="occ-filters">
          <label>
            <span className="occ-label">Período</span>
            <select
              value={dias}
              onChange={(event) => setDias(Number(event.target.value))}
              aria-label="Janela de análise em dias"
            >
              {JANELAS.map((janela) => (
                <option key={janela} value={janela}>
                  {janela} dias
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void load(dias)} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}

      {!data ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>{loading ? "Lendo os sinais registrados…" : "Sem dados"}</strong>
          <p>Os indicadores são calculados sobre a trilha de auditoria e a central de incidentes.</p>
        </div>
      ) : (
        <>
          <div className="occ-metrics">
            <article>
              <span>FALHAS E NEGAÇÕES</span>
              <strong>{data.falhas.tendencia.atual}</strong>
              <small className={data.falhas.tendencia.direcao === "ALTA" ? "occ-up" : data.falhas.tendencia.direcao === "QUEDA" ? "occ-down" : ""}>
                {data.falhas.tendencia.variacao > 0 ? "+" : ""}
                {data.falhas.tendencia.variacao}% vs. período anterior
              </small>
            </article>
            <article>
              <span>TAXA SOBRE AÇÕES</span>
              <strong>{data.falhas.taxa}%</strong>
              <small>{data.falhas.totalAcoes} ações auditadas no período</small>
            </article>
            <article>
              <span>INCIDENTES ABERTOS</span>
              <strong>{data.incidentes.abertos}</strong>
              <small>{data.incidentes.criticos} crítico(s)</small>
            </article>
            <article>
              <span>CONTAS BLOQUEADAS</span>
              <strong>{data.autenticacao.bloqueados_agora}</strong>
              <small>{data.autenticacao.contas_com_falha} conta(s) com falha de login</small>
            </article>
          </div>

          <section className="occ-chart-block">
            <header>
              <div>
                <p className="pilot-kicker">FALHAS POR DIA</p>
                <h2>Evolução das falhas e negações registradas</h2>
              </div>
              {anomalias.size > 0 && (
                <span className="occ-chart-note">
                  {anomalias.size} dia(s) fora do padrão destacado(s)
                </span>
              )}
            </header>
            {data.falhas.tendencia.atual === 0 ? (
              <p className="occ-quiet">
                Nenhuma falha ou negação registrada nesta janela. O gráfico aparece assim que houver ocorrências.
              </p>
            ) : (
              <div className="occ-bars" role="img" aria-label="Falhas registradas por dia">
                {data.falhas.serie.map((ponto) => (
                  <div key={ponto.chave} className={anomalias.has(ponto.chave) ? "occ-bar occ-bar-alert" : "occ-bar"}>
                    <i
                      style={{ height: `${Math.max(2, (ponto.total / maximo) * 100)}%` }}
                      title={`${ponto.chave}: ${ponto.total} falha(s)`}
                    />
                    <span>{ponto.chave.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
            {anomalias.size > 0 && (
              <p className="occ-correlation" role="note">
                Dias destacados ficaram acima do comportamento da própria série. Isso é
                correlação, não causa: confira publicações e incidentes do mesmo dia antes
                de concluir a origem.
              </p>
            )}
          </section>

          <section className="occ-table-block">
            <header>
              <p className="pilot-kicker">ONDE AS FALHAS ACONTECEM</p>
              <h2>Ações que mais falharam ou foram negadas</h2>
            </header>
            {data.falhas.porEvento.length === 0 ? (
              <p className="occ-quiet">Nenhuma ação com falha no período.</p>
            ) : (
              <div className="occ-table-scroll">
                <table className="occ-table">
                  <thead>
                    <tr>
                      <th>Ação</th>
                      <th>Resultado</th>
                      <th>Ocorrências</th>
                      <th>Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.falhas.porEvento.map((item) => (
                      <tr key={`${item.evento}-${item.resultado}`}>
                        <td data-label="Ação">{humanize(item.evento)}</td>
                        <td data-label="Resultado">
                          <b className={item.resultado === "ERRO" ? "occ-tag-critical" : "occ-tag-warn"}>
                            {item.resultado}
                          </b>
                        </td>
                        <td data-label="Ocorrências">{item.total}</td>
                        <td data-label="Última">{formatarData(item.ultima)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.incidentesPorArea.length > 0 && (
            <section className="occ-table-block">
              <header>
                <p className="pilot-kicker">INCIDENTES EM ABERTO</p>
                <h2>Concentração por área</h2>
              </header>
              <div className="occ-table-scroll">
                <table className="occ-table">
                  <thead>
                    <tr>
                      <th>Área</th>
                      <th>Gravidade</th>
                      <th>Incidentes</th>
                      <th>Ocorrências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incidentesPorArea.map((item) => (
                      <tr key={`${item.area}-${item.gravidade}`}>
                        <td data-label="Área">{humanize(item.area)}</td>
                        <td data-label="Gravidade">{item.gravidade}</td>
                        <td data-label="Incidentes">{item.total}</td>
                        <td data-label="Ocorrências">{item.ocorrencias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="occ-gap-block">
            <header>
              <p className="pilot-kicker">LACUNAS CONHECIDAS</p>
              <h2>Indicadores que dependem de infraestrutura ainda não conectada</h2>
            </header>
            <p className="occ-quiet">
              Estes indicadores não aparecem acima porque a plataforma ainda não recebe o
              dado. Nenhum valor é estimado para preencher o espaço.
            </p>
            <ul className="occ-gap-list">
              {data.indisponiveis.map((item) => (
                <li key={item.indicador}>
                  <strong>{item.indicador}</strong>
                  <span>Fonte necessária: {item.origem}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="occ-updated">Atualizado em {formatarData(data.geradoEm)}</p>
        </>
      )}
    </section>
  );
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatarData(value: string) {
  if (!value) return "—";
  const data = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(data.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}
