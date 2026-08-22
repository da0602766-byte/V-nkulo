"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PdfComposer from "./PdfComposer";

type CustomField = {
  id: string;
  label: string;
  type: "numero" | "texto" | "data" | "sim_nao";
};

type Entry = {
  id: number;
  rotina_id: number;
  registrado_por_nome: string;
  pessoas_culto: number;
  visitantes: number;
  cestas_basicas: number;
  visitas_dia: number;
  visitas_lares: number;
  teens: number;
  adultos: number;
  jovens: number;
  kids: number;
  bebes: number;
  extras: Record<string, string | number>;
  observacoes?: string | null;
  criado_em: string;
};

type Routine = {
  id: number;
  titulo: string;
  data_culto: string;
  horario?: string | null;
  equipe_id: number;
  equipe_nome?: string | null;
  equipe_cor?: string | null;
  registrador_usuario_id: number;
  registrador_nome?: string | null;
  campos_extras: CustomField[];
  observacoes?: string | null;
  status: string;
  pode_registrar: boolean;
  lancamentos: Entry[];
};

type GraphSet = { labels: string[]; values: number[] };
type CultData = {
  rotinas: Routine[];
  equipes: { id: number; nome: string; cor: string }[];
  usuarios: { id: number; nome: string; titulo_eclesiastico?: string }[];
  graficos: Record<"dia" | "semana" | "mes" | "ano", GraphSet>;
  podeGerenciar: boolean;
};

const EMPTY_DATA: CultData = {
  rotinas: [],
  equipes: [],
  usuarios: [],
  graficos: {
    dia: { labels: ["Hoje"], values: [0] },
    semana: { labels: [], values: [] },
    mes: { labels: [], values: [] },
    ano: { labels: [], values: [] },
  },
  podeGerenciar: false,
};

const countFields = [
  ["pessoasCulto", "Pessoas no culto", "pessoas_culto"],
  ["visitantes", "Visitantes", "visitantes"],
  ["cestasBasicas", "Cestas básicas entregues", "cestas_basicas"],
  ["visitasDia", "Visitas realizadas no dia", "visitas_dia"],
  ["visitasLares", "Visitas em lares", "visitas_lares"],
  ["teens", "Teens", "teens"],
  ["adultos", "Adultos", "adultos"],
  ["jovens", "Jovens", "jovens"],
  ["kids", "Kids", "kids"],
  ["bebes", "Bebês", "bebes"],
] as const;

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Não foi possível concluir a operação.");
  if (options?.method === "POST" && typeof window !== "undefined")
    window.dispatchEvent(new Event("adote:refresh-notifications"));
  return body;
}

export default function ChurchServicesModule({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<CultData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [period, setPeriod] = useState<"dia" | "semana" | "mes" | "ano">(
    "semana",
  );
  const [modal, setModal] = useState<"routine" | "entry" | null>(null);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [pdfPeriod, setPdfPeriod] = useState<"dia" | "semana" | "mes" | "ano" | null>(null);

  async function reload() {
    try {
      setData(await api("/api/cultos"));
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void api("/api/cultos")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(
    () =>
      data.rotinas
        .flatMap((routine) => routine.lancamentos)
        .reduce(
          (sum, entry) => ({
            pessoas: sum.pessoas + Number(entry.pessoas_culto || 0),
            visitantes: sum.visitantes + Number(entry.visitantes || 0),
            cestas: sum.cestas + Number(entry.cestas_basicas || 0),
            visitasLares:
              sum.visitasLares + Number(entry.visitas_lares || 0),
            registros: sum.registros + 1,
          }),
          {
            pessoas: 0,
            visitantes: 0,
            cestas: 0,
            visitasLares: 0,
            registros: 0,
          },
        ),
    [data.rotinas],
  );

  useEffect(() => {
    const openFromMobile = () => {
      if (!data.podeGerenciar) return;
      setSelectedRoutine(null);
      setCustomFields([]);
      setModal("routine");
    };
    window.addEventListener("adote:new-cult-routine", openFromMobile);
    return () =>
      window.removeEventListener("adote:new-cult-routine", openFromMobile);
  }, [data.podeGerenciar]);

  function openRoutine(routine: Routine | null = null) {
    setSelectedRoutine(routine);
    setCustomFields(
      routine?.campos_extras.map((field) => ({ ...field })) || [],
    );
    setModal("routine");
  }

  function openEntry(routine: Routine, entry: Entry | null = null) {
    setSelectedRoutine(routine);
    setSelectedEntry(entry);
    setModal("entry");
  }

  async function submitRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const camposExtras = customFields
      .map((field) => ({ ...field, label: field.label.trim() }))
      .filter((field) => field.label);
    const payload = {
      titulo: form.get("titulo"),
      dataCulto: form.get("dataCulto"),
      horario: form.get("horario"),
      equipeId: form.get("equipeId"),
      registradorUsuarioId: form.get("registradorUsuarioId"),
      camposExtras,
      observacoes: form.get("observacoes"),
      status: form.get("status"),
    };
    try {
      await api(
        selectedRoutine ? `/api/cultos/${selectedRoutine.id}` : "/api/cultos",
        {
          method: selectedRoutine ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setModal(null);
      setSelectedRoutine(null);
      await reload();
      notify(
        selectedRoutine ? "Rotina atualizada." : "Rotina do culto criada.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoutine) return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      observacoes: form.get("observacoes"),
      extras: Object.fromEntries(
        selectedRoutine.campos_extras.map((field) => [
          field.id,
          form.get(`extra_${field.id}`),
        ]),
      ),
    };
    for (const [key] of countFields) payload[key] = form.get(key);
    try {
      const base = `/api/cultos/${selectedRoutine.id}/lancamentos`;
      await api(selectedEntry ? `${base}/${selectedEntry.id}` : base, {
        method: selectedEntry ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setModal(null);
      setSelectedEntry(null);
      setSelectedRoutine(null);
      await reload();
      notify(
        selectedEntry
          ? "Registro atualizado."
          : "Novo registro incluído na rotina.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteRoutine(routine: Routine) {
    if (
      !window.confirm(
        `Excluir a rotina “${routine.titulo}” e todos os registros dela?`,
      )
    )
      return;
    try {
      await api(`/api/cultos/${routine.id}`, { method: "DELETE" });
      await reload();
      notify("Rotina excluída.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteEntry(routine: Routine, entry: Entry) {
    if (!window.confirm("Excluir este registro da rotina?")) return;
    try {
      await api(`/api/cultos/${routine.id}/lancamentos/${entry.id}`, {
        method: "DELETE",
      });
      await reload();
      notify("Registro excluído.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  if (loading) {
    return <div className="empty-state">Carregando as rotinas dos cultos…</div>;
  }
  if (loadError) {
    return (
      <div className="empty-state">
        <strong>Não foi possível abrir as rotinas.</strong>
        <span>{loadError}</span>
        <button
          className="primary-button"
          onClick={() => {
            setLoadError("");
            setLoading(true);
            void reload();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const graph = data.graficos[period] || EMPTY_DATA.graficos[period];

  return (
    <section className="content-section cult-module">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ROTINAS E INDICADORES</span>
          <h1>Rotinas dos Cultos</h1>
          <p>
            Equipes responsáveis, registros de público e acompanhamento dos
            cultos em um só lugar.
          </p>
        </div>
        {data.podeGerenciar && (
          <div className="page-heading-actions">
            <button className="secondary-button" onClick={() => setPdfPeriod(period)}>
              ⇩ Relatório em PDF
            </button>
            <button className="primary-button" onClick={() => openRoutine()}>
              + Nova rotina
            </button>
          </div>
        )}
      </div>

      <div className="metrics-grid compact-metrics">
        <Metric label="Pessoas registradas" value={totals.pessoas} icon="◉" />
        <Metric label="Visitantes" value={totals.visitantes} icon="◎" />
        <Metric label="Cestas entregues" value={totals.cestas} icon="▣" />
        <Metric
          label="Visitas em lares"
          value={totals.visitasLares}
          icon="⌂"
        />
        <Metric label="Lançamentos" value={totals.registros} icon="✓" />
      </div>

      <div className="panel cult-chart-panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2>Participação nos cultos</h2>
            <p>Cada novo lançamento é somado ao período selecionado.</p>
          </div>
          <div className="segmented-control" aria-label="Período do gráfico">
            {(["dia", "semana", "mes", "ano"] as const).map((key) => (
              <button
                key={key}
                className={period === key ? "active" : ""}
                onClick={() => setPeriod(key)}
              >
                {key === "mes" ? "Mês" : capitalize(key)}
              </button>
            ))}
          </div>
        </div>
        <CultBarChart graph={graph} />
      </div>

      <div className="section-heading">
        <div>
          <h2>Rotinas cadastradas</h2>
          <p>
            A pessoa escolhida como responsável pode incluir quantos lançamentos
            forem necessários.
          </p>
        </div>
      </div>

      {!data.rotinas.length ? (
        <div className="empty-state">
          <strong>Nenhuma rotina disponível.</strong>
          <span>
            {data.podeGerenciar
              ? "Crie a primeira rotina e escolha quem fará os registros."
              : "Quando uma rotina for atribuída a você, ela aparecerá aqui."}
          </span>
        </div>
      ) : (
        <div className="cult-routine-list">
          {data.rotinas.map((routine) => (
            <article className="panel cult-routine-card" key={routine.id}>
              <div className="cult-routine-top">
                <div>
                  <div className="card-kicker">
                    <span
                      className="team-color-dot"
                      style={{
                        background: routine.equipe_cor || "var(--teal)",
                      }}
                    />
                    {routine.equipe_nome || "Equipe não informada"}
                  </div>
                  <h2>{routine.titulo}</h2>
                  <p>
                    {formatDate(routine.data_culto)}
                    {routine.horario ? ` às ${routine.horario}` : ""} · Registro
                    por{" "}
                    <strong>
                      {routine.registrador_nome || "Pessoa não informada"}
                    </strong>
                  </p>
                </div>
                <div className="card-actions">
                  <span
                    className={`status-pill ${routine.status.toLowerCase()}`}
                  >
                    {routine.status === "ENCERRADA" ? "Encerrada" : "Aberta"}
                  </span>
                  {routine.pode_registrar && routine.status !== "ENCERRADA" && (
                    <button
                      className="primary-button small"
                      onClick={() => openEntry(routine)}
                    >
                      + Registrar dados
                    </button>
                  )}
                  {data.podeGerenciar && (
                    <>
                      <button
                        className="ghost-button small"
                        onClick={() => openRoutine(routine)}
                      >
                        Editar rotina
                      </button>
                      <button
                        className="danger-button small"
                        onClick={() => deleteRoutine(routine)}
                      >
                        Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
              {routine.observacoes && (
                <p className="routine-notes">{routine.observacoes}</p>
              )}
              {!routine.lancamentos.length ? (
                <div className="empty-inline">
                  Ainda não há dados registrados nesta rotina.
                </div>
              ) : (
                <div className="entry-grid">
                  {routine.lancamentos.map((entry) => (
                    <div className="entry-card" key={entry.id}>
                      <div className="entry-card-header">
                        <div>
                          <strong>{entry.pessoas_culto} pessoas</strong>
                          <small>
                            por {entry.registrado_por_nome} ·{" "}
                            {formatDateTime(entry.criado_em)}
                          </small>
                        </div>
                        {routine.pode_registrar && (
                          <div className="card-actions">
                            <button
                              className="text-button"
                              onClick={() => openEntry(routine, entry)}
                            >
                              Editar
                            </button>
                            <button
                              className="text-button danger-text"
                              onClick={() => deleteEntry(routine, entry)}
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="entry-stats">
                        <span>
                          <b>{entry.visitantes}</b> visitantes
                        </span>
                        <span>
                          <b>{entry.adultos}</b> adultos
                        </span>
                        <span>
                          <b>{entry.jovens}</b> jovens
                        </span>
                        <span>
                          <b>{entry.teens}</b> teens
                        </span>
                        <span>
                          <b>{entry.kids}</b> kids
                        </span>
                        <span>
                          <b>{entry.bebes}</b> bebês
                        </span>
                        <span>
                          <b>{entry.cestas_basicas}</b> cestas
                        </span>
                        <span>
                          <b>{entry.visitas_dia}</b> visitas no dia
                        </span>
                        <span>
                          <b>{entry.visitas_lares}</b> visitas em lares
                        </span>
                        {routine.campos_extras.map((field) => (
                          <span key={field.id}>
                            <b>
                              {formatExtraValue(field, entry.extras[field.id])}
                            </b>{" "}
                            {field.label}
                          </span>
                        ))}
                      </div>
                      {entry.observacoes && <p>{entry.observacoes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {modal === "routine" && (
        <div className="modal-overlay" role="presentation">
          <form className="modal-card large-modal" onSubmit={submitRoutine}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">CONFIGURAÇÃO DA ROTINA</span>
                <h2>
                  {selectedRoutine ? "Editar rotina" : "Nova rotina do culto"}
                </h2>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setModal(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="form-grid">
              <label className="field full-field">
                <span>Nome da rotina *</span>
                <input
                  name="titulo"
                  defaultValue={selectedRoutine?.titulo}
                  placeholder="Ex.: Culto de Celebração"
                  required
                />
              </label>
              <label className="field">
                <span>Data do culto *</span>
                <input
                  name="dataCulto"
                  type="date"
                  defaultValue={selectedRoutine?.data_culto}
                  required
                />
              </label>
              <label className="field">
                <span>Horário</span>
                <input
                  name="horario"
                  type="time"
                  defaultValue={selectedRoutine?.horario || ""}
                />
              </label>
              <label className="field">
                <span>Equipe responsável *</span>
                <select
                  name="equipeId"
                  defaultValue={selectedRoutine?.equipe_id || ""}
                  required
                >
                  <option value="">Selecione a diaconia</option>
                  {data.equipes.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Quem fará os registros *</span>
                <select
                  name="registradorUsuarioId"
                  defaultValue={selectedRoutine?.registrador_usuario_id || ""}
                  required
                >
                  <option value="">Selecione uma pessoa cadastrada</option>
                  {data.usuarios.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.nome}
                    </option>
                  ))}
                </select>
                <small>
                  Esta escolha libera a permissão somente para esta rotina.
                </small>
              </label>
              <label className="field">
                <span>Situação</span>
                <select
                  name="status"
                  defaultValue={selectedRoutine?.status || "ABERTA"}
                >
                  <option value="ABERTA">Aberta para registros</option>
                  <option value="ENCERRADA">Encerrada</option>
                </select>
              </label>
              <div className="field full-field custom-fields-builder">
                <div className="custom-fields-heading">
                  <div>
                    <span>Campos personalizados</span>
                    <small>
                      Crie qualquer informação que desejar: nome, quantidade,
                      data ou resposta de sim/não.
                    </small>
                  </div>
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() =>
                      setCustomFields((current) => [
                        ...current,
                        {
                          id: `campo_${Date.now()}_${current.length + 1}`,
                          label: "",
                          type: "texto",
                        },
                      ])
                    }
                  >
                    + Adicionar campo
                  </button>
                </div>
                {customFields.length ? (
                  <div className="custom-field-list">
                    {customFields.map((field, index) => (
                      <div className="custom-field-row" key={field.id}>
                        <label>
                          <span>Nome do campo</span>
                          <input
                            value={field.label}
                            placeholder="Ex.: Nome do pregador"
                            onChange={(event) =>
                              setCustomFields((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Tipo de resposta</span>
                          <select
                            value={field.type}
                            onChange={(event) =>
                              setCustomFields((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        type: event.target
                                          .value as CustomField["type"],
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="texto">Nome ou texto</option>
                            <option value="numero">Número ou quantidade</option>
                            <option value="data">Data</option>
                            <option value="sim_nao">Sim ou não</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="danger-button small custom-field-remove"
                          onClick={() =>
                            setCustomFields((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          aria-label={`Remover ${field.label || `campo ${index + 1}`}`}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="custom-fields-empty">
                    Nenhum campo extra. Use “Adicionar campo” para incluir nome,
                    números ou outra informação na ficha do culto.
                  </div>
                )}
              </div>
              <label className="field full-field">
                <span>Observações</span>
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={selectedRoutine?.observacoes || ""}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="primary-button">Salvar rotina</button>
            </div>
          </form>
        </div>
      )}
      {pdfPeriod && (
        <PdfComposer
          baseUrl={`/api/cultos/pdf?periodo=${pdfPeriod}`}
          initialTitle={`Relatório de Rotinas dos Cultos — ${pdfPeriod === "mes" ? "Mês" : capitalize(pdfPeriod)}`}
          onClose={() => setPdfPeriod(null)}
        />
      )}

      {modal === "entry" && selectedRoutine && (
        <div className="modal-overlay" role="presentation">
          <form className="modal-card large-modal" onSubmit={submitEntry}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">{selectedRoutine.titulo}</span>
                <h2>
                  {selectedEntry
                    ? "Editar dados do culto"
                    : "Registrar dados do culto"}
                </h2>
                <p>Você pode voltar e incluir outro lançamento depois.</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setModal(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="form-grid count-form-grid">
              {countFields.map(([name, label, databaseKey]) => (
                <label className="field" key={name}>
                  <span>{label}</span>
                  <input
                    name={name}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={
                      selectedEntry ? selectedEntry[databaseKey] : 0
                    }
                  />
                </label>
              ))}
              {selectedRoutine.campos_extras.map((field) => (
                <label className="field" key={field.id}>
                  <span>{field.label}</span>
                  {field.type === "sim_nao" ? (
                    <select
                      name={`extra_${field.id}`}
                      defaultValue={selectedEntry?.extras[field.id] ?? ""}
                    >
                      <option value="">Selecione</option>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                  ) : (
                    <input
                      name={`extra_${field.id}`}
                      type={
                        field.type === "numero"
                          ? "number"
                          : field.type === "data"
                            ? "date"
                            : "text"
                      }
                      min={field.type === "numero" ? "0" : undefined}
                      defaultValue={
                        selectedEntry?.extras[field.id] ??
                        (field.type === "numero" ? 0 : "")
                      }
                    />
                  )}
                </label>
              ))}
              <label className="field full-field">
                <span>Observações deste lançamento</span>
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={selectedEntry?.observacoes || ""}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="primary-button">Salvar dados</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function CultBarChart({ graph }: { graph: GraphSet }) {
  const max = Math.max(...graph.values, 1);
  return (
    <div className="cult-bar-chart" aria-label="Gráfico de pessoas nos cultos">
      {graph.labels.map((label, index) => (
        <div className="cult-bar-column" key={`${label}-${index}`}>
          <strong>{graph.values[index] || 0}</strong>
          <div className="cult-bar-track">
            <span
              style={{
                height: `${Math.max(4, ((graph.values[index] || 0) / max) * 100)}%`,
              }}
            />
          </div>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

function formatExtraValue(
  field: CustomField,
  value: string | number | undefined,
) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "—";
  }
  if (field.type === "data") return formatDate(String(value));
  return String(value);
}

function formatDate(value: string) {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string) {
  const date = new Date(
    value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
