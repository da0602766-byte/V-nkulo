"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import AgendaCalendar from "./AgendaCalendar";
import AgendaDialog from "./AgendaDialog";
import { readAgendaJson, AgendaRequestError, agendaErrorMessage } from "../lib/agenda-request";
import TransientFeedback from "./TransientFeedback";
import styles from "./EventsAgenda.module.css";
import { filterEventDirectory, type EventPeriod } from "../lib/event-directory";

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
  escalas_abrem_em: string | null;
  reservas_abrem_em: string | null;
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

function EventActionIcon({ name }: { name: "check" | "link" | "share" }) {
  return <svg className="event-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "check" ? <path d="m5 12 4 4L19 6" /> : name === "link" ? <><path d="M14 3h7v7m0-7L10 14" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></> : <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m9 10 6-3m-6 7 6 3" /></>}
  </svg>;
}

export default function EventsWorkspace({
  permissions,
  communityName,
  communitySlug,
}: {
  permissions: string[];
  communityName: string;
  communitySlug: string;
}) {
  const introId = useId();
  const [introOpen, setIntroOpen] = useState(false);

  const [eventSearch, setEventSearch] = useState("");
  const [eventStatus, setEventStatus] = useState("TODOS");
  const [eventPeriod, setEventPeriod] = useState<EventPeriod>("PROXIMOS");
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [agendaRevision, setAgendaRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | "form" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [newEventDay, setNewEventDay] = useState("");
  const [newEventDraft, setNewEventDraft] = useState(0);
  const [shareFeedback, setShareFeedback] = useState("");
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [registrantSearchEventId, setRegistrantSearchEventId] = useState<number | null>(null);
  const [registrantSearch, setRegistrantSearch] = useState("");
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const eventsRequestRef = useRef<AbortController | null>(null);
  const eventsSignatureRef = useRef("");
  const canManage = permissions.includes("events.manage");
  const canRsvp = permissions.includes("events.rsvp");
  const displayedEvents = useMemo(() => filterEventDirectory(events, eventSearch, eventStatus, eventPeriod, now), [events, eventSearch, eventStatus, eventPeriod, now]);
  const hasDirectoryFilters = Boolean(eventSearch.trim()) || eventStatus !== "TODOS" || eventPeriod !== "TODOS";
  const requestedEventRef = useRef<number | null>(null);
  const scrolledEventRef = useRef<number | null>(null);
  const registrantSearchEvent = useMemo(
    () => events.find((item) => item.id === registrantSearchEventId) || null,
    [events, registrantSearchEventId],
  );
  const actionMenuEvent = useMemo(
    () => events.find((item) => item.id === actionMenuId) || null,
    [actionMenuId, events],
  );
  const filteredRegistrants = useMemo(() => {
    if (!registrantSearchEvent) return [];
    const term = registrantSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return registrantSearchEvent.inscritos;
    return registrantSearchEvent.inscritos.filter((person) =>
      person.nome.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [registrantSearch, registrantSearchEvent]);

  const loadEvents = useCallback(async (quiet = false) => {
    if (quiet && eventsRequestRef.current) return;
    eventsRequestRef.current?.abort();
    const request = new AbortController(); eventsRequestRef.current = request;
    if (!quiet) setLoading(true);
    try {
      const result = await readAgendaJson<ApiResult>("/api/pilot/eventos", request.signal);
      if (request.signal.aborted) return;
      const signature = JSON.stringify(result.eventos || []);
      setEvents(result.eventos || []); setNow(Date.now()); setLoadError("");
      if (!quiet || signature !== eventsSignatureRef.current) setAgendaRevision(value => value + 1);
      eventsSignatureRef.current = signature;
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof AgendaRequestError && [401, 403].includes(error.status)) setEvents([]);
      setLoadError(agendaErrorMessage(error));
    } finally {
      if (eventsRequestRef.current === request) { eventsRequestRef.current = null; setLoading(false); }
    }
  }, []);
  useEffect(() => () => eventsRequestRef.current?.abort(), []);
  useEffect(() => {
    const resume = () => { if (document.visibilityState === "visible") void loadEvents(true); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [loadEvents]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadEvents(), 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadEvents(true);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [loadEvents]);

  useEffect(() => {
    if (!actionMenuId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMenuId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionMenuId]);

  useEffect(() => {
    if (!events.length || typeof window === "undefined") return;
    const requestedId = Number(new URLSearchParams(window.location.search).get("evento"));
    if (!requestedId || scrolledEventRef.current === requestedId) return;
    if (requestedEventRef.current !== requestedId) {
      requestedEventRef.current = requestedId;
      setEventPeriod("TODOS");
      setEventSearch("");
      setEventStatus("TODOS");
    }
    const target = document.getElementById(`event-${requestedId}`);
    if (!target) return;
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      scrolledEventRef.current = requestedId;
    }, 80);
    return () => window.clearTimeout(timer);
  }, [events, eventPeriod]);

  useEffect(() => {
    if (!canManage) return;
    const open = () => {
      setEditing(null);
      setNewEventDay("");
      setNewEventDraft((value) => value + 1);
      setPollEnabled(false);
      setPollOptions(["", ""]);
      setEventFormOpen(true);
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
      escalasAbremEm: localDateToIso(String(form.get("escalasAbremEm") || "")),
      reservasAbremEm: localDateToIso(String(form.get("reservasAbremEm") || "")),
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
      setEventFormOpen(false);
      await loadEvents();
    } catch (saveError) {
      setError(agendaErrorMessage(saveError, true));
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
    const previous = events;
    setEvents((current) => current.map((event) => event.id !== item.id || !event.enquete ? event : {
      ...event,
      enquete: {
        ...event.enquete,
        minha_opcao: option,
        total_votos: event.enquete.total_votos + (event.enquete.minha_opcao ? 0 : 1),
        opcoes: event.enquete.opcoes.map((choice) => ({
          ...choice,
          votos: choice.id === option
            ? choice.votos + (event.enquete?.minha_opcao === option ? 0 : 1)
            : choice.id === event.enquete?.minha_opcao ? Math.max(0, choice.votos - 1) : choice.votos,
        })),
      },
    }));
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
      await loadEvents(true);
    } catch (cause) {
      setEvents(previous);
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
      setEventFormOpen(true);
  }

  return (
    <section className={`events-workspace events-studio ${styles.workspace}`}>
      <div id={introId} className={styles.intro} data-open={introOpen} aria-hidden={!introOpen} inert={!introOpen}>
        <div className={styles.introClip}>
          <div className={styles.introContent}>
            <div>
              <p className="pilot-kicker">ENCONTROS QUE APROXIMAM</p>
              <h2>Vamos nos encontrar.</h2>
              <p>
                A programação de {communityName}, suas escalas e seus compromissos em um só lugar.
              </p>
            </div>
            <div className="events-studio-count"><strong>{events.filter(item => item.status === "PUBLICADO" && Date.parse(item.inicia_em) >= now).length}</strong><span>próximos eventos</span></div>
          </div>
        </div>
      </div>

      {/* O calendário reúne, em camadas, o que já existe espalhado: eventos da
          comunidade, as escalas desta pessoa e os compromissos que ela mesma
          marcou. A lista de gestão de eventos continua abaixo. */}
      <AgendaCalendar
        headingContent={<div className={styles.titlebar}>
        <h1>Agenda</h1>
        <button
          type="button"
          className={styles.introToggle}
          aria-expanded={introOpen}
          aria-controls={introId}
          onClick={() => setIntroOpen((value) => !value)}
        >
          {introOpen ? "Fechar resumo" : "Sobre"}
          <span aria-hidden="true">{introOpen ? "−" : "+"}</span>
        </button>
      </div>}
        atualizacao={agendaRevision}
        podeVerEventos={permissions.includes("events.view")}
        podeAprovar={canManage}
        aoCriarEvento={
          canManage
            ? (dia) => {
                setEditing(null);
                setNewEventDay(dia || "");
                setNewEventDraft((value) => value + 1);
                setPollEnabled(false);
                setPollOptions(["", ""]);
                setError("");
                setFeedback("");
                setEventFormOpen(true);
              }
            : undefined
        }
      />



      {canManage && eventFormOpen && (
        <AgendaDialog title={editing ? `Editar: ${editing.titulo}` : "Novo evento"} wide busy={workingId === "form"} onClose={() => setEventFormOpen(false)} key={editing?.id || `new-${newEventDraft}`}>
        <div className={styles.eventDialogForm}>
          <form className="pilot-form event-form" onSubmit={saveEvent} onInvalidCapture={event=>{const parent=(event.target as HTMLElement).closest("details");if(parent)parent.open=true;}}>
            <div className="event-form-section-title"><span>01</span><div><h3>Sobre o encontro</h3><p>Nome e categoria do evento.</p></div></div>
            <label className="event-wide-field">
              Título*
              <input
                name="titulo"
                placeholder="Ex.: Culto de celebração"
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
            <div className="event-form-section-title"><span>02</span><div><h3>Quando e onde</h3><p>Defina os horários e a capacidade.</p></div></div>
            <label>
              Início*
              <input
                name="iniciaEm"
                type="datetime-local"
                required
                defaultValue={editing ? toLocalInput(editing.inicia_em) : newEventDay ? `${newEventDay}T09:00` : ""}
              />
            </label>
            <label>
              Término
              <input
                name="terminaEm"
                type="datetime-local"
                defaultValue={editing ? toLocalInput(editing.termina_em) : newEventDay ? `${newEventDay}T10:00` : ""}
              />
            </label>
            <label>
              Local
              <input
                name="local"
                placeholder="Ex.: Templo principal"
                maxLength={180}
                defaultValue={editing?.local || ""}
              />
            </label>
            <label>
              Capacidade
              <input
                name="capacidade"
                placeholder="Sem limite definido"
                type="number"
                min={1}
                max={100000}
                defaultValue={editing?.capacidade || ""}
              />
            </label>
            <details className="event-advanced event-wide-field" open={Boolean(editing?.escalas_abrem_em || editing?.reservas_abrem_em)}><summary>Liberação de escalas e estacionamento <small>Opcional</small></summary><div>
            <label>
              Escalas disponíveis em
              <input
                name="escalasAbremEm"
                type="datetime-local"
                defaultValue={toLocalInput(editing?.escalas_abrem_em)}
              />
              <small>Horário exibido para a equipe antes do evento.</small>
            </label>
            <label>
              Reservas do estacionamento em
              <input
                name="reservasAbremEm"
                type="datetime-local"
                defaultValue={toLocalInput(editing?.reservas_abrem_em)}
              />
              <small>Somente pessoas confirmadas poderão reservar após este horário.</small>
            </label>
            </div></details>
            <div className="event-form-section-title"><span>03</span><div><h3>Publicação</h3><p>Escolha como o evento será apresentado.</p></div></div>
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
            <details className="event-advanced event-wide-field" open={pollEnabled}><summary>Votação do evento <small>Opcional</small></summary><fieldset className={`event-poll-field event-wide-field ${pollEnabled ? "is-enabled" : ""}`}>
              <legend>Votação</legend>
              <button
                type="button"
                className="event-poll-toggle"
                aria-expanded={pollEnabled}
                onClick={() => setPollEnabled((enabled) => !enabled)}
              >
                <span className="event-poll-toggle-icon" aria-hidden="true"><i /><i /><i /></span>
                <span className="event-poll-toggle-copy">
                  <strong>{pollEnabled ? "Votação adicionada" : "Adicionar votação"}</strong>
                  <small>{pollEnabled ? "Defina a pergunta e as respostas" : "Colete respostas junto com o evento"}</small>
                </span>
                <span className="event-poll-toggle-action" aria-hidden="true">
                  <em>{pollEnabled ? "Remover" : "Adicionar"}</em>
                  <b>{pollEnabled ? "−" : "+"}</b>
                </span>
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
            </fieldset></details>
            <label className="event-wide-field">
              Descrição
              <textarea
                name="descricao"
                placeholder="O que os participantes precisam saber?"
                rows={4}
                maxLength={2000}
                defaultValue={editing?.descricao || ""}
              />
            </label>
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className="event-form-actions">
              {!editing && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setPollEnabled(false);
                    setPollOptions(["", ""]);
                    setEventFormOpen(false);
                  }}
                >
                  Fechar
                </button>
              )}
              {editing && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setEditing(null);
                    setPollEnabled(false);
                    setPollOptions(["", ""]);
                    setEventFormOpen(false);
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
        </div></AgendaDialog>
      )}

      {feedback && (
        <TransientFeedback className="operations-feedback" role="status">
          {feedback}
        </TransientFeedback>
      )}
      {error && (
        <TransientFeedback className="operations-feedback error" role="alert">
          <span>{error}</span>
          <button className="event-inline-action" onClick={() => void loadEvents()}>
            Tentar novamente
          </button>
        </TransientFeedback>
      )}
      {loadError && (
        <div className={styles.syncNotice} role="status">
          <span>{loadError}</span>
          <button type="button" className="event-inline-action" onClick={() => void loadEvents()}>
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
      ) : events.length ? (<>
        <section className={styles.directory} aria-label="Buscar na programação">
          <div className={styles.directoryHeading}><small>PROGRAMAÇÃO DA COMUNIDADE</small><h2>Encontros e eventos</h2><p>Consulte os eventos por período. Esta busca não altera o calendário acima.</p></div>
          <div className={styles.directoryFilters}>
            <label>Buscar eventos<input type="search" value={eventSearch} onChange={event => setEventSearch(event.target.value)} placeholder="Título, local ou descrição" /></label>
            <label>Período dos eventos<select value={eventPeriod} onChange={event => setEventPeriod(event.target.value as EventPeriod)}><option value="PROXIMOS">Em andamento e próximos</option><option value="ANTERIORES">Anteriores</option><option value="TODOS">Todos os períodos</option></select></label>
            <label>Situação<select value={eventStatus} onChange={event=>setEventStatus(event.target.value)}><option value="TODOS">Todas as situações</option><option value="PUBLICADO">Publicados</option>{canManage && <option value="RASCUNHO">Rascunhos</option>}<option value="CANCELADO">Cancelados</option></select></label>
          </div>
          <div className={styles.directorySummary}><span role="status">{displayedEvents.length} {displayedEvents.length === 1 ? "evento encontrado" : "eventos encontrados"}</span>{hasDirectoryFilters && <button type="button" onClick={() => { setEventSearch(""); setEventStatus("TODOS"); setEventPeriod("TODOS"); }}>Limpar busca e filtros</button>}</div>
        </section>
        {!displayedEvents.length && <div className={styles.directoryEmpty}><strong>{loadError ? "Não foi possível confirmar os resultados." : eventPeriod === "PROXIMOS" && !eventSearch.trim() && eventStatus === "TODOS" ? "Nenhum evento em andamento ou futuro." : "Nenhum evento encontrado com esses filtros."}</strong><p>{loadError ? "Tente atualizar a programação novamente." : "Você pode consultar os eventos anteriores ou ajustar a busca."}</p><button type="button" onClick={() => { if (loadError) void loadEvents(); else { setEventSearch(""); setEventStatus("TODOS"); setEventPeriod("TODOS"); } }}>{loadError ? "Tentar novamente" : "Ver todos os eventos"}</button></div>}
        <div className="event-grid">
          {displayedEvents.map((item) => {
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
                      <div className="event-card-menu">
                        <button
                          type="button"
                          className="event-card-menu-trigger"
                          aria-label={`Abrir ações de ${item.titulo}`}
                          aria-expanded={actionMenuId === item.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionMenuId(item.id);
                          }}
                        >•••</button>
                      </div>
                    )}
                  </div>
                  <h2>{item.titulo}</h2>
                  <div className={styles.eventSummary}><time dateTime={item.inicia_em}>{formatDateTimeRange(item.inicia_em, item.termina_em)}</time><span>{item.local || "Local a definir"}</span></div>
                  <details className="event-card-details">
                    <summary>
                      <span>
                        {item.enquete && isPublished
                          ? item.enquete.minha_opcao
                            ? "Opinião registrada"
                            : "Sua opinião é necessária"
                          : "Ver informações do evento"}
                      </span>
                      <i aria-hidden="true">⌄</i>
                    </summary>
                    <div className="event-card-expanded">
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
                    <div>
                      <dt>Escalas disponíveis</dt>
                      <dd>{item.escalas_abrem_em ? formatShortDate(item.escalas_abrem_em) : "Ao publicar"}</dd>
                    </div>
                    <div>
                      <dt>Reservas disponíveis</dt>
                      <dd>{item.reservas_abrem_em ? formatShortDate(item.reservas_abrem_em) : "Após confirmar presença"}</dd>
                    </div>
                  </dl>
                  <div className="event-actions">
                    {canRsvp && isPublished && (
                      <button
                        type="button"
                        className={`event-attendance-action${isConfirmed ? " is-confirmed" : ""}`}
                        disabled={workingId === item.id || (isFull && !isConfirmed)}
                        onClick={() =>
                          void updateConfirmation(
                            item,
                            isConfirmed ? "CANCELADO" : "CONFIRMADO",
                          )
                        }
                      >
                        <EventActionIcon name="check" /><span className="event-action-label">{workingId === item.id
                          ? "Atualizando…"
                          : isConfirmed
                            ? "Cancelar presença"
                            : isFull
                              ? "Lotado"
                              : "Confirmar presença"}</span>
                      </button>
                    )}
                    {isPublished && (
                      <a
                        className="event-link-action"
                        href={eventUrl(item)}
                        target="_blank"
                        rel="noreferrer"
                      aria-label="Abrir link próprio" title="Link próprio"><EventActionIcon name="link" /><span className="event-action-label">Link próprio</span></a>
                    )}
                    {isPublished && (
                      <button
                        type="button"
                        className="event-link-action event-share-action"
                        onClick={() => void shareEvent(item)}
                      aria-label="Compartilhar inscrição" title="Compartilhar inscrição"><EventActionIcon name="share" /><span className="event-action-label">Compartilhar inscrição</span></button>
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
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      </>) : loadError ? (
        <div className="pilot-empty-state event-empty">
          <strong>Eventos indisponíveis no momento</strong>
          <p>Não foi possível consultar a programação da comunidade.</p>
          <button type="button" className="event-inline-action" onClick={() => void loadEvents()}>Tentar novamente</button>
        </div>
      ) : (
        <div className="pilot-empty-state event-empty">
          <strong>Nenhum evento nesta comunidade</strong>
          <p>
            A comunidade ainda não publicou sua programação. Os próximos encontros aparecerão aqui.
          </p>
        </div>
      )}
      {actionMenuEvent && typeof document !== "undefined" && createPortal(
        <div className="event-action-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setActionMenuId(null);
        }}>
          <section className="event-action-dialog" role="dialog" aria-modal="true" aria-labelledby="event-action-title">
            <header>
              <div><small>AÇÕES DO EVENTO</small><strong id="event-action-title">{actionMenuEvent.titulo}</strong></div>
              <button type="button" onClick={() => setActionMenuId(null)} aria-label="Fechar ações">×</button>
            </header>
            <div role="menu">
              {actionMenuEvent.status !== "CANCELADO" && <>
                <button type="button" onClick={() => { setActionMenuId(null); startEditing(actionMenuEvent); }}>Editar evento</button>
                <button type="button" className="danger-link" disabled={workingId === actionMenuEvent.id} onClick={() => { setActionMenuId(null); void cancelEvent(actionMenuEvent); }}>Cancelar evento</button>
              </>}
              <button type="button" className="danger-link" disabled={workingId === actionMenuEvent.id} onClick={() => { setActionMenuId(null); void deleteEvent(actionMenuEvent); }}>Excluir evento</button>
              {Boolean(actionMenuEvent.can_view_registrants) && <button type="button" onClick={() => {
                setActionMenuId(null);
                setRegistrantSearch("");
                setRegistrantSearchEventId(actionMenuEvent.id);
              }}>Pesquisar inscritos</button>}
            </div>
          </section>
        </div>,
        document.body,
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
      {shareFeedback && <TransientFeedback className="operations-feedback" role="status">{shareFeedback}</TransientFeedback>}
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
