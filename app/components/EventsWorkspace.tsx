"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type CommunityEvent = {
  id: number;
  titulo: string;
  descricao: string;
  categoria: string;
  inicia_em: string;
  termina_em: string | null;
  local: string;
  publico: boolean | number;
  status: "RASCUNHO" | "PUBLICADO" | "CANCELADO";
  capacidade: number | null;
  confirmacoes: number;
  minha_confirmacao: "CONFIRMADO" | "CANCELADO" | null;
  can_view_registrants: number;
  criado_por?: number;
  enquete?: {
    pergunta: string;
    opcoes: Array<{ id: number; label: string; votos: number }>;
    minha_opcao: number | null;
    total_votos: number;
  } | null;
  inscritos: Array<{
    usuario_id: number;
    nome: string;
    status: string;
    atualizado_em: string;
    is_member?: number;
  }>;
};

type ApiResult = {
  eventos?: CommunityEvent[];
  canManage?: boolean;
  error?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  CULTO: "Culto",
  CELULA: "Célula",
  TREINAMENTO: "Treinamento",
  CONFERENCIA: "Conferência",
  ACAO_COMUNITARIA: "Ação comunitária",
  OUTRO: "Outro",
};

export default function EventsWorkspace({
  permissions,
  communityName,
  communitySlug,
}: {
  permissions: string[];
  communityName: string;
  communitySlug: string;
}) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | "form" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [shareFeedback, setShareFeedback] = useState("");
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [registrantSearchEventId, setRegistrantSearchEventId] = useState<number | null>(null);
  const [registrantSearch, setRegistrantSearch] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const canManage = permissions.includes("events.manage");
  const canRsvp = permissions.includes("events.rsvp");
  const registrantSearchEvent = useMemo(
    () => events.find((item) => item.id === registrantSearchEventId) || null,
    [events, registrantSearchEventId],
  );
  const filteredRegistrants = useMemo(() => {
    if (!registrantSearchEvent) return [];
    const term = registrantSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return registrantSearchEvent.inscritos;
    return registrantSearchEvent.inscritos.filter((person) =>
      person.nome.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [registrantSearch, registrantSearchEvent]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/eventos", {
        cache: "no-store",
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar os eventos.");
      }
      setEvents(result.eventos || []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadEvents(), 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents]);

  useEffect(() => {
    if (!events.length || typeof window === "undefined") return;
    const requestedId = Number(new URLSearchParams(window.location.search).get("evento"));
    if (!requestedId) return;
    const target = document.getElementById(`event-${requestedId}`);
    if (target) window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [events]);

  useEffect(() => {
    if (!canManage) return;
    const open = () => {
      setEditing(null);
      setPollEnabled(false);
      setPollOptions(["", ""]);
      if (!detailsRef.current) return;
      detailsRef.current.open = true;
      window.requestAnimationFrame(() =>
        detailsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    };
    window.addEventListener("vinkulo:new-event", open);
    return () => window.removeEventListener("vinkulo:new-event", open);
  }, [canManage]);

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setWorkingId("form");
    setFeedback("");
    setError("");
    const form = new FormData(formElement);
    const pollQuestion = String(form.get("enquetePergunta") || "").trim();
    const pollChoices = form
      .getAll("enqueteOpcao")
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (pollEnabled && (!pollQuestion || pollChoices.length < 2)) {
      setError("Informe a pergunta e pelo menos duas opções para publicar a votação.");
      setWorkingId(null);
      return;
    }
    const body = {
      titulo: form.get("titulo"),
      descricao: form.get("descricao"),
      categoria: form.get("categoria"),
      iniciaEm: localDateToIso(String(form.get("iniciaEm") || "")),
      terminaEm: localDateToIso(String(form.get("terminaEm") || "")),
      local: form.get("local"),
      capacidade: form.get("capacidade"),
      publico: form.get("publico") === "on",
      status: form.get("status"),
      enquete: pollEnabled
        ? {
            pergunta: pollQuestion,
            opcoes: pollChoices,
          }
        : null,
    };
    try {
      const response = await fetch(
        editing ? `/api/pilot/eventos/${editing.id}` : "/api/pilot/eventos",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível salvar o evento.");
      }
      setFeedback(editing ? "Evento atualizado." : "Evento criado.");
      setEditing(null);
      formElement.reset();
      setPollEnabled(false);
      setPollOptions(["", ""]);
      if (detailsRef.current) detailsRef.current.open = false;
      await loadEvents();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  function eventUrl(item: CommunityEvent) {
    const path = item.publico
      ? `/comunidades/${communitySlug}#evento-${item.id}`
      : `/painel?view=eventos&evento=${item.id}`;
    return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  }

  async function shareEvent(item: CommunityEvent) {
    const url = eventUrl(item);
    setShareFeedback("");
    try {
      if (navigator.share) {
        await navigator.share({ title: item.titulo, text: `Inscreva-se em ${item.titulo}`, url });
        setShareFeedback("Link do evento compartilhado.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareFeedback("Link de inscrição copiado.");
      }
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setShareFeedback("Não foi possível compartilhar o link.");
    }
  }

  async function votePoll(item: CommunityEvent, option: number) {
    setWorkingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/pilot/eventos/${item.id}/votacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opcao: option }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar o voto.");
      setFeedback("Voto registrado.");
      await loadEvents();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  async function updateConfirmation(
    item: CommunityEvent,
    status: "CONFIRMADO" | "CANCELADO",
  ) {
    setWorkingId(item.id);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(
        `/api/pilot/eventos/${item.id}/confirmacao`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível atualizar.");
      }
      setFeedback(
        status === "CONFIRMADO"
          ? "Participação confirmada."
          : "Confirmação cancelada.",
      );
      await loadEvents();
    } catch (confirmationError) {
      setError((confirmationError as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  async function cancelEvent(item: CommunityEvent) {
    if (!window.confirm(`Cancelar o evento “${item.titulo}”?`)) return;
    setWorkingId(item.id);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/eventos/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "CANCELAR" }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível cancelar.");
      }
      setFeedback("Evento cancelado sem apagar o histórico.");
      await loadEvents();
    } catch (cancelError) {
      setError((cancelError as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteEvent(item: CommunityEvent) {
    if (
      !window.confirm(
        `Excluir definitivamente o evento “${item.titulo}” e suas confirmações? Esta ação será auditada.`,
      )
    ) return;
    setWorkingId(item.id);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(`/api/pilot/eventos/${item.id}`, { method: "DELETE" });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o evento.");
      setFeedback("Evento excluído definitivamente com registro na auditoria.");
      await loadEvents();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  function startEditing(item: CommunityEvent) {
    setEditing(item);
    setPollEnabled(Boolean(item.enquete));
    setPollOptions(item.enquete?.opcoes.map((option) => option.label) || ["", ""]);
    setError("");
    setFeedback("");
    window.requestAnimationFrame(() => {
      if (!detailsRef.current) return;
      detailsRef.current.open = true;
      detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <section className="events-workspace">
      <header className="workspace-heading">
        <div>
          <p className="pilot-kicker">EVENTOS E CALENDÁRIO</p>
          <h1>Agenda de {communityName}</h1>
          <p>
            Eventos persistentes no tenant ativo, com confirmação individual e
            cancelamento auditado.
          </p>
        </div>
        <span className="scope-badge">Escopo do servidor</span>
      </header>

      <div className="operations-notice">
        <strong>Dados separados por comunidade</strong>
        <span>
          A página pública recebe somente eventos marcados como públicos e
          publicados.
        </span>
      </div>

      {canManage && (
        <details
          className="operations-form-card event-form-card"
          ref={detailsRef}
          key={editing?.id || "new"}
        >
          <summary>
            {editing ? `Editar: ${editing.titulo}` : "Criar novo evento"}
          </summary>
          <form className="pilot-form event-form" onSubmit={saveEvent}>
            <label className="event-wide-field">
              Título*
              <input
                name="titulo"
                required
                maxLength={140}
                defaultValue={editing?.titulo || ""}
              />
            </label>
            <label>
              Categoria
              <select
                name="categoria"
                defaultValue={editing?.categoria || "CULTO"}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Início*
              <input
                name="iniciaEm"
                type="datetime-local"
                required
                defaultValue={toLocalInput(editing?.inicia_em)}
              />
            </label>
            <label>
              Término
              <input
                name="terminaEm"
                type="datetime-local"
                defaultValue={toLocalInput(editing?.termina_em)}
              />
            </label>
            <label>
              Local
              <input
                name="local"
                maxLength={180}
                defaultValue={editing?.local || ""}
              />
            </label>
            <label>
              Capacidade
              <input
                name="capacidade"
                type="number"
                min={1}
                max={100000}
                defaultValue={editing?.capacidade || ""}
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={editing?.status || "RASCUNHO"}>
                <option value="RASCUNHO">Rascunho</option>
                <option value="PUBLICADO">Publicado</option>
              </select>
            </label>
            <label className="event-checkbox">
              <input
                name="publico"
                type="checkbox"
                defaultChecked={Boolean(editing?.publico)}
              />
              Exibir na página pública
            </label>
            <fieldset className={`event-poll-field event-wide-field ${pollEnabled ? "is-enabled" : ""}`}>
              <legend>Votação</legend>
              <button
                type="button"
                className="event-poll-toggle"
                aria-expanded={pollEnabled}
                onClick={() => setPollEnabled((enabled) => !enabled)}
              >
                <span aria-hidden="true">▥</span>
                <span>
                  <strong>{pollEnabled ? "Votação adicionada" : "Adicionar votação"}</strong>
                  <small>{pollEnabled ? "Defina a pergunta e as respostas" : "Colete respostas junto com o evento"}</small>
                </span>
                <b aria-hidden="true">{pollEnabled ? "−" : "+"}</b>
              </button>
              {pollEnabled && (
                <div className="event-poll-builder">
                  <label>
                    Pergunta da votação
                    <input
                      name="enquetePergunta"
                      required
                      maxLength={180}
                      defaultValue={editing?.enquete?.pergunta || ""}
                      placeholder="Ex.: Você participará do culto?"
                    />
                  </label>
                  <div className="event-poll-option-list">
                    <span>Opções de resposta</span>
                    {pollOptions.map((option, index) => (
                      <label key={`${editing?.id || "new"}-poll-${index}`}>
                        <span aria-hidden="true">{index + 1}</span>
                        <input
                          name="enqueteOpcao"
                          required={index < 2}
                          maxLength={80}
                          value={option}
                          onChange={(changeEvent) => setPollOptions((current) =>
                            current.map((value, optionIndex) => optionIndex === index ? changeEvent.target.value : value),
                          )}
                          placeholder={`Opção ${index + 1}`}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            aria-label={`Remover opção ${index + 1}`}
                            onClick={() => setPollOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))}
                          >×</button>
                        )}
                      </label>
                    ))}
                    {pollOptions.length < 6 && (
                      <button
                        type="button"
                        className="event-add-poll-option"
                        onClick={() => setPollOptions((current) => [...current, ""])}
                      >+ Adicionar opção</button>
                    )}
                  </div>
                </div>
              )}
            </fieldset>
            <label className="event-wide-field">
              Descrição
              <textarea
                name="descricao"
                rows={4}
                maxLength={2000}
                defaultValue={editing?.descricao || ""}
              />
            </label>
            <div className="event-form-actions">
              {editing && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setEditing(null);
                    setPollEnabled(false);
                    setPollOptions(["", ""]);
                    if (detailsRef.current) detailsRef.current.open = false;
                  }}
                >
                  Sair da edição
                </button>
              )}
              <button disabled={workingId === "form"}>
                {workingId === "form"
                  ? "Salvando…"
                  : editing
                    ? "Salvar alterações"
                    : "Criar evento"}
              </button>
            </div>
          </form>
        </details>
      )}

      {feedback && (
        <p className="operations-feedback" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <div className="operations-feedback error" role="alert">
          <span>{error}</span>
          <button className="event-inline-action" onClick={() => void loadEvents()}>
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div className="event-skeleton-grid" aria-label="Carregando eventos">
          <span />
          <span />
          <span />
        </div>
      ) : events.length ? (
        <div className="event-grid">
          {events.map((item) => {
            const isPublished = item.status === "PUBLICADO";
            const isConfirmed = item.minha_confirmacao === "CONFIRMADO";
            const isFull =
              Boolean(item.capacidade) &&
              Number(item.confirmacoes) >= Number(item.capacidade);
            return (
              <article id={`event-${item.id}`} key={item.id} className={`event-card status-${item.status.toLowerCase()}`}>
                <div className="event-date">
                  <strong>{formatDay(item.inicia_em)}</strong>
                  <span>{formatMonth(item.inicia_em)}</span>
                </div>
                <div className="event-card-content">
                  <div className="event-card-topline">
                    <div className="event-card-meta">
                      <span className="status-pill">
                        {CATEGORY_LABELS[item.categoria] || "Outro"}
                      </span>
                      <span className={`status-pill status-${item.status.toLowerCase()}`}>
                        {statusLabel(item.status)}
                      </span>
                      {item.publico ? <span className="event-public-label">Público</span> : null}
                    </div>
                    {canManage && (
                      <details className="event-card-menu">
                        <summary aria-label={`Abrir ações de ${item.titulo}`}>•••</summary>
                        <div>
                          {item.status !== "CANCELADO" && (
                            <>
                              <button type="button" onClick={() => startEditing(item)}>Editar evento</button>
                              <button
                                type="button"
                                className="danger-link"
                                disabled={workingId === item.id}
                                onClick={() => void cancelEvent(item)}
                              >Cancelar evento</button>
                            </>
                          )}
                          <button
                            type="button"
                            className="danger-link"
                            disabled={workingId === item.id}
                            onClick={() => void deleteEvent(item)}
                          >Excluir evento</button>
                          {Boolean(item.can_view_registrants) && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.currentTarget.closest("details")?.removeAttribute("open");
                                setRegistrantSearch("");
                                setRegistrantSearchEventId(item.id);
                              }}
                            >Pesquisar inscritos</button>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                  <h2>{item.titulo}</h2>
                  <p>{item.descricao || "Sem descrição adicional."}</p>
                  <dl>
                    <div>
                      <dt>Quando</dt>
                      <dd>{formatDateTimeRange(item.inicia_em, item.termina_em)}</dd>
                    </div>
                    <div>
                      <dt>Local</dt>
                      <dd>{item.local || "A definir"}</dd>
                    </div>
                    <div>
                      <dt>Confirmações</dt>
                      <dd>
                        {item.confirmacoes}
                        {item.capacidade ? ` de ${item.capacidade}` : ""}
                      </dd>
                    </div>
                  </dl>
                  <div className="event-actions">
                    {canRsvp && isPublished && (
                      <button
                        disabled={workingId === item.id || (isFull && !isConfirmed)}
                        onClick={() =>
                          void updateConfirmation(
                            item,
                            isConfirmed ? "CANCELADO" : "CONFIRMADO",
                          )
                        }
                      >
                        {workingId === item.id
                          ? "Atualizando…"
                          : isConfirmed
                            ? "Cancelar presença"
                            : isFull
                              ? "Lotado"
                              : "Confirmar presença"}
                      </button>
                    )}
                    {isPublished && (
                      <a
                        className="event-link-action"
                        href={eventUrl(item)}
                        target="_blank"
                        rel="noreferrer"
                      >Link próprio</a>
                    )}
                    {isPublished && (
                      <button
                        type="button"
                        className="event-link-action event-share-action"
                        onClick={() => void shareEvent(item)}
                      ><span aria-hidden="true">➤</span> Compartilhar inscrição</button>
                    )}
                  </div>
                  {item.enquete && isPublished && (
                    <section className="event-poll" aria-label="Votação do evento">
                      <header><strong>{item.enquete.pergunta}</strong><small>{item.enquete.total_votos} voto(s)</small></header>
                      <div>
                        {item.enquete.opcoes.map((option) => (
                          <button
                            type="button"
                            key={option.id}
                            className={item.enquete?.minha_opcao === option.id ? "selected" : ""}
                            disabled={!canRsvp || workingId === item.id}
                            onClick={() => void votePoll(item, option.id)}
                          >
                            <span>{option.label}</span><em>{option.votos}</em>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {Boolean(item.can_view_registrants) && (
                    <details className="event-registrants">
                      <summary>
                        Ver inscritos confirmados <span>{item.inscritos.length}</span>
                      </summary>
                      <div className="event-registrants-preview">
                        {item.inscritos.slice(0, 5).map((person) => (
                          <article key={person.usuario_id}>
                            <span>{getInitials(person.nome)}</span>
                            <div>
                              <strong>{person.nome}</strong>
                              <small>
                                Presença confirmada · {formatShortDate(person.atualizado_em)}
                                {!person.is_member && <em className="event-external-attendee">Pessoa externa · não está na comunidade</em>}
                              </small>
                            </div>
                          </article>
                        ))}
                        {!item.inscritos.length && (
                          <p>Nenhuma inscrição confirmada neste evento.</p>
                        )}
                      </div>
                      {item.inscritos.length > 5 && <small className="event-registrants-more">Mostrando 5 de {item.inscritos.length}. Use os três pontos para pesquisar.</small>}
                    </details>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="pilot-empty-state event-empty">
          <strong>Nenhum evento nesta comunidade</strong>
          <p>
            O calendário começa vazio e não reutiliza registros de outro
            tenant.
          </p>
        </div>
      )}
      {registrantSearchEvent && typeof document !== "undefined" && createPortal(
        <div className="event-registrant-search-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRegistrantSearchEventId(null);
        }}>
          <section className="event-registrant-search-dialog" role="dialog" aria-modal="true" aria-labelledby="event-registrant-search-title">
            <header>
              <div><small>INSCRITOS CONFIRMADOS</small><strong id="event-registrant-search-title">{registrantSearchEvent.titulo}</strong></div>
              <button type="button" onClick={() => setRegistrantSearchEventId(null)} aria-label="Fechar pesquisa">×</button>
            </header>
            <label>
              <span className="sr-only">Pesquisar inscrito</span>
              <input type="search" value={registrantSearch} onChange={(event) => setRegistrantSearch(event.target.value)} placeholder="Pesquisar pelo nome" autoFocus />
            </label>
            <div className="event-registrant-search-results">
              {filteredRegistrants.map((person) => (
                <article key={person.usuario_id}>
                  <span>{getInitials(person.nome)}</span>
                  <div><strong>{person.nome}</strong><small>Presença confirmada · {formatShortDate(person.atualizado_em)}</small></div>
                </article>
              ))}
              {!filteredRegistrants.length && <p>Nenhum inscrito encontrado.</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}
      {shareFeedback && <p className="operations-feedback" role="status">{shareFeedback}</p>}
    </section>
  );
}

function localDateToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(value))
    .replace(".", "")
    .toUpperCase();
}

function formatDateTimeRange(start: string, end: string | null) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
  const startLabel = formatter.format(new Date(start));
  return end ? `${startLabel} até ${formatter.format(new Date(end))}` : startLabel;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusLabel(value: CommunityEvent["status"]) {
  if (value === "PUBLICADO") return "Publicado";
  if (value === "CANCELADO") return "Cancelado";
  return "Rascunho";
}
