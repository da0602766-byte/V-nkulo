"use client";

import { useCallback, useEffect, useState } from "react";
import "./OwnerCommandCenter.css";

type Tendencia = { atual: number; anterior: number; variacao: number; direcao: string };

type Pessoas = {
  janelaDias: number;
  filtros: { comunidadeId: number; planoId: number; perfil: string };
  totais: Record<string, number>;
  novos: Tendencia;
  engajamento: {
    acessaram30d: number;
    taxaAtividade: number;
    semAcesso60d: number;
    taxaAbandono: number;
  };
  porComunidade: { id: number; nome: string; status: string; membros: number; ativos_30d: number }[];
  evolucao: { chave: string; total: number }[];
  coortes: { chave: string; cadastrados: number; retornaram: number; taxa: number }[];
  contasExcluidas: { total: number; restauraveis: number };
  perfis: string[];
  geradoEm: string;
};

const JANELAS = [7, 30, 90, 180, 365];

/**
 * Indicadores agregados de pessoas. Nenhum dado pessoal e nenhum conteúdo de
 * comunidade aparece aqui — só contagens, coortes e distribuição.
 */
export default function OwnerPeopleInsights({
  comunidades,
}: {
  comunidades?: { id: number; nome: string }[];
}) {
  const [data, setData] = useState<Pessoas | null>(null);
  const [dias, setDias] = useState(30);
  const [comunidade, setComunidade] = useState(0);
  const [perfil, setPerfil] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const busca = new URLSearchParams({ dias: String(dias) });
      if (comunidade) busca.set("comunidade", String(comunidade));
      if (perfil) busca.set("perfil", perfil);
      const response = await fetch(`/api/proprietario/pessoas?${busca}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar.");
      setData(result);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [dias, comunidade, perfil]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const maximo = Math.max(1, ...(data?.evolucao || []).map((ponto) => ponto.total));

  return (
    <section className="owner-directory-panel occ-panel" aria-label="Indicadores de pessoas">
      <header className="owner-directory-header">
        <div>
          <strong>Indicadores de pessoas</strong>
          <span>Contagens agregadas · nenhum conteúdo de comunidade é exibido</span>
        </div>
        <div className="occ-filters">
          <label>
            <span className="occ-label">Período</span>
            <select value={dias} onChange={(event) => setDias(Number(event.target.value))}>
              {JANELAS.map((janela) => (
                <option key={janela} value={janela}>
                  {janela} dias
                </option>
              ))}
            </select>
          </label>
          {comunidades && comunidades.length > 0 && (
            <label>
              <span className="occ-label">Comunidade</span>
              <select
                value={comunidade}
                onChange={(event) => setComunidade(Number(event.target.value))}
              >
                <option value={0}>Todas</option>
                {comunidades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="occ-label">Perfil</span>
            <select value={perfil} onChange={(event) => setPerfil(event.target.value)}>
              <option value="">Todos</option>
              {(data?.perfis || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading}>
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
          <strong>{loading ? "Calculando indicadores…" : "Sem dados"}</strong>
        </div>
      ) : (
        <>
          <div className="occ-metrics">
            <article>
              <span>TOTAL DE CONTAS</span>
              <strong>{Number(data.totais.total || 0)}</strong>
              <small>
                {Number(data.totais.ativos || 0)} ativas · {Number(data.totais.inativos || 0)} inativas
              </small>
            </article>
            <article>
              <span>ON-LINE AGORA</span>
              <strong>{Number(data.totais.online_agora || 0)}</strong>
              <small>Com sessão válida neste momento</small>
            </article>
            <article>
              <span>NOVOS CADASTROS</span>
              <strong>{data.novos.atual}</strong>
              <small className={data.novos.direcao === "QUEDA" ? "occ-up" : "occ-down"}>
                {data.novos.variacao > 0 ? "+" : ""}
                {data.novos.variacao}% vs. período anterior
              </small>
            </article>
            <article>
              <span>ATIVIDADE (30 DIAS)</span>
              <strong>{data.engajamento.taxaAtividade}%</strong>
              <small>{data.engajamento.acessaram30d} contas acessaram</small>
            </article>
            <article>
              <span>ABANDONO APARENTE</span>
              <strong>{data.engajamento.taxaAbandono}%</strong>
              <small>{data.engajamento.semAcesso60d} ativas sem acesso há 60 dias</small>
            </article>
            <article>
              <span>BLOQUEADAS</span>
              <strong>{Number(data.totais.bloqueados || 0)}</strong>
              <small>
                {Number(data.totais.tentativas_login || 0)} tentativa(s) de login acumulada(s)
              </small>
            </article>
            <article>
              <span>CONTAS EXCLUÍDAS</span>
              <strong>{data.contasExcluidas.total}</strong>
              <small>{data.contasExcluidas.restauraveis} ainda restaurável(is)</small>
            </article>
          </div>

          <section className="occ-chart-block">
            <header>
              <div>
                <p className="pilot-kicker">ÚLTIMOS 12 MESES</p>
                <h2>Novos cadastros por mês</h2>
              </div>
            </header>
            {data.evolucao.length === 0 ? (
              <p className="occ-quiet">Nenhum cadastro no período selecionado.</p>
            ) : (
              <div className="occ-bars" role="img" aria-label="Novos cadastros por mês">
                {data.evolucao.map((ponto) => (
                  <div key={ponto.chave} className="occ-bar">
                    <i
                      style={{ height: `${Math.max(2, (ponto.total / maximo) * 100)}%` }}
                      title={`${ponto.chave}: ${ponto.total} cadastro(s)`}
                    />
                    <span>{ponto.chave.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="occ-table-block">
            <header>
              <div>
                <p className="pilot-kicker">RETENÇÃO POR COORTE</p>
                <h2>Quem se cadastrou e continua acessando</h2>
              </div>
            </header>
            <p className="occ-quiet">
              De cada mês de cadastro, a proporção que acessou nos últimos 30 dias. É a
              retenção atual da coorte, não retenção em D+30: o registro de sessões não
              guarda histórico suficiente para essa segunda leitura.
            </p>
            {data.coortes.length === 0 ? (
              <p className="occ-quiet">Sem coortes no período.</p>
            ) : (
              <div className="occ-table-scroll">
                <table className="occ-table">
                  <thead>
                    <tr>
                      <th>Mês de cadastro</th>
                      <th>Cadastradas</th>
                      <th>Acessaram (30d)</th>
                      <th>Retenção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.coortes.map((linha) => (
                      <tr key={linha.chave}>
                        <td data-label="Mês">{linha.chave}</td>
                        <td data-label="Cadastradas">{linha.cadastrados}</td>
                        <td data-label="Acessaram">{linha.retornaram}</td>
                        <td data-label="Retenção">
                          <b className={linha.taxa >= 50 ? "occ-tag-ok" : linha.taxa >= 20 ? "occ-tag-warn" : "occ-tag-critical"}>
                            {linha.taxa}%
                          </b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="occ-table-block">
            <header>
              <div>
                <p className="pilot-kicker">DISTRIBUIÇÃO</p>
                <h2>Pessoas por comunidade</h2>
              </div>
            </header>
            {data.porComunidade.length === 0 ? (
              <p className="occ-quiet">Nenhuma comunidade com vínculos.</p>
            ) : (
              <div className="occ-table-scroll">
                <table className="occ-table">
                  <thead>
                    <tr>
                      <th>Comunidade</th>
                      <th>Situação</th>
                      <th>Membros</th>
                      <th>Ativos (30d)</th>
                      <th>Participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porComunidade.map((linha) => {
                      const taxa = linha.membros
                        ? Math.round((linha.ativos_30d / linha.membros) * 100)
                        : 0;
                      return (
                        <tr key={linha.id}>
                          <td data-label="Comunidade">{linha.nome}</td>
                          <td data-label="Situação">{linha.status}</td>
                          <td data-label="Membros">{linha.membros}</td>
                          <td data-label="Ativos">{linha.ativos_30d}</td>
                          <td data-label="Participação">{taxa}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="occ-updated">Atualizado em {formatarData(data.geradoEm)}</p>
        </>
      )}
    </section>
  );
}

function formatarData(value: string) {
  if (!value) return "—";
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}
