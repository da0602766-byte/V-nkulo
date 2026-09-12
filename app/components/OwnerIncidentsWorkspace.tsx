"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import "./OwnerIncidentsWorkspace.css";

// Central de incidentes: só exibe o que existe no banco. Quando não há
// incidente registrado, o estado vazio diz exatamente isso — nenhum número é
// inventado ou estimado nesta tela.

type Incident = {
  id: number;
  chave: string;
  titulo: string;
  descricao: string;
  area: string;
  modulo: string;
  gravidade: string;
  status: string;
  prioridade: number;
  ocorrencias: number;
  comunidadesAfetadas: number;
  primeiraOcorrencia: string;
  ultimaOcorrencia: string;
  resolucao: string;
  resolvidoEm: string | null;
  resolvidoPor: string | null;
  recorrente: boolean;
};

type Summary = {
  gravidades: Record<string, number>;
  status: Record<string, number>;
  abertos: number;
  recorrentes: number;
};

type Occurrence = {
  id: number;
  comunidade: string | null;
  detalhe: string;
  criadoEm: string;
};

type Detail = {
  incident: Incident;
  occurrences: Occurrence[];
  communities: { id: number; nome: string; ocorrencias: number }[];
};

const AREAS = [
  "MODULO",
  "COMUNIDADE",
  "INTEGRACAO",
  "BANCO",
  "AUTENTICACAO",
  "PUBLICACAO",
  "VERSAO",
  "DESEMPENHO",
];
const GRAVIDADES = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];
const STATUS = ["ABERTO", "EM_ANALISE", "MITIGADO", "RESOLVIDO", "IGNORADO"];

const ROTULO_AREA: Record<string, string> = {
  MODULO: "Módulo",
  COMUNIDADE: "Comunidade",
  INTEGRACAO: "Integração",
  BANCO: "Banco de dados",
  AUTENTICACAO: "Autenticação",
  PUBLICACAO: "Publicação",
  VERSAO: "Versão",
  DESEMPENHO: "Desempenho",
};
const ROTULO_GRAVIDADE: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
};
const ROTULO_STATUS: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANALISE: "Em análise",
  MITIGADO: "Mitigado",
  RESOLVIDO: "Resolvido",
  IGNORADO: "Ignorado",
};

function formatarData(valor: string | null) {
  if (!valor) return "—";
  const data = new Date(valor.includes("T") ? valor : `${valor.replace(" ", "T")}Z`);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OwnerIncidentsWorkspace() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolucao, setResolucao] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    area: "MODULO",
    modulo: "",
    gravidade: "MEDIA",
    descricao: "",
  });
  const [filters, setFilters] = useState({
    status: "ATIVOS",
    gravidade: "",
    area: "",
    periodo: "",
    busca: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      for (const [chave, valor] of Object.entries(filters)) {
        if (valor) query.set(chave, valor);
      }
      const response = await fetch(
        `/api/proprietario/incidentes?${query.toString()}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível carregar os incidentes.");
      setIncidents(result.incidents || []);
      setSummary(result.summary || null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openDetail = useCallback(async (incidentId: number) => {
    setDetailLoading(true);
    setDetail(null);
    setResolucao("");
    try {
      const response = await fetch(
        `/api/proprietario/incidentes?id=${incidentId}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível abrir o incidente.");
      setDetail(result);
    } catch (detailError) {
      setError((detailError as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggle = (incidentId: number) => {
    if (expanded === incidentId) {
      setExpanded(0);
      setDetail(null);
      return;
    }
    setExpanded(incidentId);
    void openDetail(incidentId);
  };

  const act = async (incidentId: number, action: string, extra: object = {}) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/incidentes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: incidentId, action, ...extra }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível aplicar a ação.");
      await load();
      if (expanded === incidentId) await openDetail(incidentId);
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const registrar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/proprietario/incidentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível registrar o incidente.");
      setForm({
        titulo: "",
        area: "MODULO",
        modulo: "",
        gravidade: "MEDIA",
        descricao: "",
      });
      setShowForm(false);
      await load();
    } catch (registerError) {
      setError((registerError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const criticos = summary?.gravidades.CRITICA || 0;
  const altos = summary?.gravidades.ALTA || 0;

  return (
    <section className="owner-directory-panel incident-center" aria-label="Central de incidentes">
      <header className="owner-directory-header">
        <div>
          <p className="pilot-kicker">CENTRAL DE INCIDENTES</p>
          <strong>Problemas da plataforma, agrupados</strong>
          <span>
            Erros semelhantes viram um único incidente com contador de
            ocorrências, em vez de centenas de registros repetidos.
          </span>
        </div>
        <div className="incident-actions">
          <button onClick={() => setShowForm((atual) => !atual)}>
            {showForm ? "Cancelar registro" : "Registrar incidente"}
          </button>
          <button onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {error && (
        <p className="operations-feedback error" role="alert">
          {error}
        </p>
      )}

      {summary && (
        <div className="incident-indicators" aria-label="Indicadores de incidentes">
          <article className="critical">
            <strong>{criticos}</strong>
            <span>Críticos em aberto</span>
          </article>
          <article className="high">
            <strong>{altos}</strong>
            <span>Altos em aberto</span>
          </article>
          <article>
            <strong>{summary.abertos}</strong>
            <span>Total em tratamento</span>
          </article>
          <article>
            <strong>{summary.recorrentes}</strong>
            <span>Recorrentes</span>
          </article>
        </div>
      )}

      {showForm && (
        <form className="incident-form" onSubmit={registrar}>
          <label className="full">
            Título do incidente
            <input
              value={form.titulo}
              onChange={(event) =>
                setForm({ ...form, titulo: event.target.value })
              }
              maxLength={200}
              required
            />
          </label>
          <label>
            Área
            <select
              value={form.area}
              onChange={(event) => setForm({ ...form, area: event.target.value })}
            >
              {AREAS.map((area) => (
                <option key={area} value={area}>
                  {ROTULO_AREA[area]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Módulo
            <input
              value={form.modulo}
              onChange={(event) => setForm({ ...form, modulo: event.target.value })}
              maxLength={80}
            />
          </label>
          <label>
            Gravidade
            <select
              value={form.gravidade}
              onChange={(event) =>
                setForm({ ...form, gravidade: event.target.value })
              }
            >
              {GRAVIDADES.map((gravidade) => (
                <option key={gravidade} value={gravidade}>
                  {ROTULO_GRAVIDADE[gravidade]}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Descrição
            <textarea
              value={form.descricao}
              onChange={(event) =>
                setForm({ ...form, descricao: event.target.value })
              }
              maxLength={2000}
            />
          </label>
          <div className="full incident-actions">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      )}

      <div className="incident-filters">
        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="ATIVOS">Em tratamento</option>
            <option value="">Todos</option>
            {STATUS.map((status) => (
              <option key={status} value={status}>
                {ROTULO_STATUS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gravidade
          <select
            value={filters.gravidade}
            onChange={(event) =>
              setFilters({ ...filters, gravidade: event.target.value })
            }
          >
            <option value="">Todas</option>
            {GRAVIDADES.map((gravidade) => (
              <option key={gravidade} value={gravidade}>
                {ROTULO_GRAVIDADE[gravidade]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select
            value={filters.area}
            onChange={(event) => setFilters({ ...filters, area: event.target.value })}
          >
            <option value="">Todas</option>
            {AREAS.map((area) => (
              <option key={area} value={area}>
                {ROTULO_AREA[area]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Período
          <select
            value={filters.periodo}
            onChange={(event) =>
              setFilters({ ...filters, periodo: event.target.value })
            }
          >
            <option value="">Desde o início</option>
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
          </select>
        </label>
        <label>
          Buscar
          <input
            value={filters.busca}
            onChange={(event) => setFilters({ ...filters, busca: event.target.value })}
            placeholder="Título ou módulo"
            maxLength={80}
          />
        </label>
      </div>

      {loading ? (
        <div className="incident-loading" role="status">
          <span className="pilot-loader" />
          <p>Carregando incidentes registrados…</p>
        </div>
      ) : incidents.length === 0 ? (
        <div className="owner-empty" role="status">
          <span>◌</span>
          <strong>Nenhum incidente registrado</strong>
          <p>
            A central está ativa e pronta para receber registros. Assim que um
            problema for registrado — manualmente ou pelos módulos da
            plataforma — ele aparece aqui agrupado por assinatura, com contagem
            real de ocorrências e de comunidades afetadas.
          </p>
        </div>
      ) : (
        <div className="incident-table-wrap">
          <table className="incident-table">
            <thead>
              <tr>
                <th>Gravidade</th>
                <th>Incidente</th>
                <th>Área / Módulo</th>
                <th>Ocorrências</th>
                <th>Comunidades</th>
                <th>Última ocorrência</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <Fragment key={incident.id}>
                  <tr
                    className={`incident-row severity-${incident.gravidade}${
                      expanded === incident.id ? " expanded" : ""
                    }`}
                  >
                    <td data-label="Gravidade">
                      <span className={`incident-tag sev-${incident.gravidade}`}>
                        {ROTULO_GRAVIDADE[incident.gravidade] || incident.gravidade}
                      </span>
                    </td>
                    <td className="incident-title-cell">
                      <button
                        onClick={() => toggle(incident.id)}
                        aria-expanded={expanded === incident.id}
                      >
                        {incident.titulo}
                      </button>
                      <small>Prioridade {incident.prioridade} de 5</small>
                    </td>
                    <td data-label="Área">
                      {ROTULO_AREA[incident.area] || incident.area}
                      {incident.modulo ? ` · ${incident.modulo}` : ""}
                    </td>
                    <td data-label="Ocorrências">
                      {incident.ocorrencias}
                      {incident.recorrente && (
                        <span className="incident-tag recurrent">recorrente</span>
                      )}
                    </td>
                    <td data-label="Comunidades">{incident.comunidadesAfetadas}</td>
                    <td data-label="Última">{formatarData(incident.ultimaOcorrencia)}</td>
                    <td data-label="Status">
                      <span className={`incident-tag st-${incident.status}`}>
                        {ROTULO_STATUS[incident.status] || incident.status}
                      </span>
                    </td>
                    <td data-label="Ações">
                      <button onClick={() => toggle(incident.id)}>
                        {expanded === incident.id ? "Fechar" : "Tratar"}
                      </button>
                    </td>
                  </tr>
                  {expanded === incident.id && (
                    <tr>
                      <td colSpan={8} className="incident-detail">
                        {detailLoading && !detail ? (
                          <p>Carregando histórico…</p>
                        ) : (
                          <>
                            <div>
                              <h3>Descrição</h3>
                              <p>
                                {incident.descricao ||
                                  "Nenhuma descrição registrada para este incidente."}
                              </p>
                            </div>
                            {incident.resolucao && (
                              <div>
                                <h3>Resolução registrada</h3>
                                <p>
                                  {incident.resolucao}
                                  {incident.resolvidoPor
                                    ? ` — ${incident.resolvidoPor}`
                                    : ""}
                                </p>
                              </div>
                            )}
                            <div>
                              <h3>
                                Histórico de ocorrências ({incident.ocorrencias} no
                                total)
                              </h3>
                              {detail && detail.occurrences.length > 0 ? (
                                <ul className="incident-history">
                                  {detail.occurrences.map((item) => (
                                    <li key={item.id}>
                                      <time>{formatarData(item.criadoEm)}</time>
                                      {item.comunidade
                                        ? `${item.comunidade} — `
                                        : "Sem comunidade vinculada — "}
                                      {item.detalhe || "sem detalhe adicional"}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p>Nenhuma ocorrência detalhada disponível.</p>
                              )}
                            </div>
                            {detail && detail.communities.length > 0 && (
                              <div>
                                <h3>Comunidades afetadas</h3>
                                <p>
                                  {detail.communities
                                    .map(
                                      (item) => `${item.nome} (${item.ocorrencias})`,
                                    )
                                    .join(" · ")}
                                </p>
                              </div>
                            )}
                            <div className="incident-actions">
                              <button
                                onClick={() => void act(incident.id, "ASSUME")}
                                disabled={saving}
                              >
                                Assumir análise
                              </button>
                              <button
                                onClick={() => void act(incident.id, "MITIGATE")}
                                disabled={saving}
                              >
                                Marcar mitigado
                              </button>
                              <button
                                onClick={() => void act(incident.id, "IGNORE")}
                                disabled={saving}
                              >
                                Ignorar
                              </button>
                              <button
                                onClick={() => void act(incident.id, "REOPEN")}
                                disabled={saving}
                              >
                                Reabrir
                              </button>
                            </div>
                            <div className="incident-actions">
                              <label>
                                <select
                                  value={incident.gravidade}
                                  onChange={(event) =>
                                    void act(incident.id, "SET_SEVERITY", {
                                      gravidade: event.target.value,
                                    })
                                  }
                                  disabled={saving}
                                  aria-label="Alterar gravidade"
                                >
                                  {GRAVIDADES.map((gravidade) => (
                                    <option key={gravidade} value={gravidade}>
                                      Gravidade: {ROTULO_GRAVIDADE[gravidade]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <select
                                  value={String(incident.prioridade)}
                                  onChange={(event) =>
                                    void act(incident.id, "SET_PRIORITY", {
                                      prioridade: Number(event.target.value),
                                    })
                                  }
                                  disabled={saving}
                                  aria-label="Alterar prioridade"
                                >
                                  {[1, 2, 3, 4, 5].map((nivel) => (
                                    <option key={nivel} value={nivel}>
                                      Prioridade {nivel}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="incident-resolution">
                              <textarea
                                value={resolucao}
                                onChange={(event) => setResolucao(event.target.value)}
                                placeholder="Descreva como o incidente foi resolvido (obrigatório para resolver)."
                                maxLength={2000}
                              />
                              <div className="incident-actions">
                                <button
                                  className="primary"
                                  disabled={saving || resolucao.trim().length < 5}
                                  onClick={() =>
                                    void act(incident.id, "RESOLVE", { resolucao })
                                  }
                                >
                                  Resolver incidente
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
