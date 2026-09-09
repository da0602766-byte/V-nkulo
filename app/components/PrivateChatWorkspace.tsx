"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Person = {
  id: number;
  nome: string;
  foto_perfil: string | null;
  hierarquia: string;
  ministerio: string;
  online: number;
  last_seen: string | null;
};
type Conversation = {
  id: number;
  participante_id: number;
  participante_nome: string;
  participante_foto: string | null;
  hierarquia: string;
  ministerio: string;
  ultima_mensagem: string | null;
  ultimo_remetente_id: number | null;
  nao_lidas: number;
  atualizado_em: string;
  online: number;
  last_seen: string | null;
};
type Message = {
  id: number;
  remetente_id: number;
  remetente_nome: string;
  mensagem: string;
  criado_em: string;
  entregue_em: string | null;
  lida_em: string | null;
};
type Workspace = {
  people: Person[];
  conversations: Conversation[];
  currentUserId: number;
  retentionNotice: string;
  nextPurgeAt: string | null;
};
type ApiResponse = {
  people?: Person[];
  conversations?: Conversation[];
  messages?: Message[];
  currentUserId?: number;
  retentionNotice?: string;
  nextPurgeAt?: string;
  error?: string;
};
type TickStatus = "sending" | "failed" | "sent" | "delivered" | "read";
type PendingMessage = {
  tempId: number;
  mensagem: string;
  criadoEm: Date;
  status: "sending" | "failed";
};
type ThreadItem =
  | { kind: "separator"; key: string; label: string }
  | {
      kind: "message";
      key: string;
      own: boolean;
      text: string;
      time: string;
      showAvatar: boolean;
      tight: boolean;
      fresh: boolean;
      pulse: boolean;
      status?: TickStatus;
      onRetry?: () => void;
    };

const FALLBACK_RETENTION_NOTICE =
  "Por privacidade, as mensagens desta semana são apagadas por completo na virada da semana, sem exceção.";
const GROUP_GAP_MS = 3 * 60_000;
const MESSAGE_POLL_MS = 3_000;
const LIST_POLL_MS = 8_000;

export default function PrivateChatWorkspace({
  initialTargetUserId = null,
}: {
  // Quem o painel de presença pediu para abrir. A conversa é criada (ou
  // reaproveitada) no primeiro carregamento; a regra de quem pode falar com
  // quem continua sendo decidida pelo servidor em /api/pilot/chat.
  initialTargetUserId?: number | null;
} = {}) {
  const initialConversation = Number(
    typeof window === "undefined"
      ? 0
      : new URL(window.location.href).searchParams.get("conversation") || 0,
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [confirmed, setConfirmed] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [activeId, setActiveId] = useState(initialConversation);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftLength, setDraftLength] = useState(0);
  const [error, setError] = useState("");
  const workspaceLoadedRef = useRef(false);
  // Mensagens que acabaram de chegar (ou de ser enviadas) entram animando.
  // O primeiro carregamento não anima nada: abrir a conversa não pode virar
  // uma cascata de bolhas.
  const [freshIds, setFreshIds] = useState<number[]>([]);
  const [pulseIds, setPulseIds] = useState<number[]>([]);
  const seenIdsRef = useRef<Set<number> | null>(null);
  const statusRef = useRef<Map<number, TickStatus | undefined> | null>(null);
  const openedTargetRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function loadWorkspace(conversationId: number) {
    const isInitial = !workspaceLoadedRef.current;
    if (isInitial) setLoading(true);
    if (conversationId > 0) setMessagesLoading(true);
    try {
      const query = conversationId > 0 ? `?conversation=${conversationId}` : "";
      const response = await fetch(`/api/pilot/chat${query}`, { cache: "no-store" });
      const result = (await readResult(response)) as ApiResponse;
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as mensagens.");
      workspaceLoadedRef.current = true;
      setWorkspace({
        people: result.people || [],
        conversations: result.conversations || [],
        currentUserId: Number(result.currentUserId || 0),
        retentionNotice: result.retentionNotice || FALLBACK_RETENTION_NOTICE,
        nextPurgeAt: result.nextPurgeAt || null,
      });
      if (conversationId > 0) setConfirmed(result.messages || []);
      setError("");
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      if (isInitial) setLoading(false);
      if (conversationId > 0) setMessagesLoading(false);
    }
  }

  async function refreshMessages(conversationId: number) {
    if (conversationId <= 0) return;
    try {
      const response = await fetch(`/api/pilot/chat?conversation=${conversationId}&messagesOnly=1`, { cache: "no-store" });
      const result = (await readResult(response)) as ApiResponse;
      if (!response.ok) return;
      setConfirmed(result.messages || []);
    } catch {
      // Sondagem silenciosa: uma falha passageira não deve interromper a conversa.
    }
  }

  async function refreshList() {
    try {
      const response = await fetch("/api/pilot/chat", { cache: "no-store" });
      const result = (await readResult(response)) as ApiResponse;
      if (!response.ok) return;
      setWorkspace((current) =>
        current ? { ...current, people: result.people || [], conversations: result.conversations || [] } : current,
      );
    } catch {
      // Idem: a lista tenta de novo no próximo ciclo.
    }
  }

  async function markRead(conversationId: number) {
    if (conversationId <= 0) return;
    try {
      await fetch("/api/pilot/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
    } catch {
      // Melhor esforço: o próximo PATCH tenta de novo.
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace(initialConversation).then(() => {
        if (initialConversation > 0) void markRead(initialConversation);
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId <= 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshMessages(activeId);
      void markRead(activeId);
    }, MESSAGE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshList();
    };
    const timer = window.setInterval(tick, LIST_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshList();
      if (activeId > 0) {
        void refreshMessages(activeId);
        void markRead(activeId);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [activeId]);

  useEffect(() => {
    stickToBottomRef.current = true;
    seenIdsRef.current = null;
    statusRef.current = null;
    setFreshIds([]);
    setPulseIds([]);
  }, [activeId]);

  useEffect(() => {
    const currentUserId = workspace?.currentUserId || 0;
    const statuses = new Map(
      confirmed.map((message) => [message.id, messageStatus(message, currentUserId)]),
    );
    const knownIds = seenIdsRef.current;
    const knownStatus = statusRef.current;
    statusRef.current = statuses;
    if (!knownIds) {
      seenIdsRef.current = new Set(statuses.keys());
      return;
    }
    const fresh = [...statuses.keys()].filter((id) => !knownIds.has(id));
    for (const id of fresh) knownIds.add(id);
    // O tique só pula quando o estado muda de fato (enviada → entregue →
    // lida). Sem isso, abrir a conversa faria todos os tiques antigos
    // pularem de uma vez, como se tudo tivesse acabado de acontecer.
    const pulsed = [...statuses.entries()]
      .filter(([id, status]) => knownStatus?.has(id) && knownStatus.get(id) !== status)
      .map(([id]) => id);
    if (!fresh.length && !pulsed.length) return;
    setFreshIds(fresh);
    setPulseIds(pulsed);
    const timer = window.setTimeout(() => {
      setFreshIds([]);
      setPulseIds([]);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [confirmed, workspace?.currentUserId]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [confirmed, pending, activeId]);

  async function openConversation(conversationId: number) {
    setActiveId(conversationId);
    setConfirmed([]);
    setPending([]);
    const address = new URL(window.location.href);
    address.searchParams.set("view", "mensagens");
    address.searchParams.set("conversation", String(conversationId));
    window.history.replaceState(window.history.state, "", address);
    await loadWorkspace(conversationId);
    void markRead(conversationId);
  }

  async function openWithUser(userId: number) {
    const response = await fetch("/api/pilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: userId }),
    });
    const result = (await readResult(response)) as { conversationId?: number; error?: string };
    if (!response.ok || !result.conversationId) {
      setError(result.error || "Não foi possível abrir a conversa.");
      return;
    }
    await openConversation(result.conversationId);
  }

  async function startConversation(person: Person) {
    await openWithUser(person.id);
  }

  useEffect(() => {
    if (!initialTargetUserId || initialTargetUserId <= 0) return;
    if (openedTargetRef.current === initialTargetUserId) return;
    openedTargetRef.current = initialTargetUserId;
    void openWithUser(initialTargetUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTargetUserId]);

  function resetComposer(form: HTMLFormElement) {
    form.reset();
    setHasDraft(false);
    setDraftLength(0);
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
  }

  async function deliver(conversationId: number, participantId: number, text: string, tempId: number) {
    const response = await fetch("/api/pilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: participantId, message: text }),
    });
    const result = (await readResult(response)) as { error?: string; message?: Message };
    if (!response.ok || !result.message) throw new Error(result.error || "Não foi possível enviar a mensagem.");
    setConfirmed((current) => mergeMessages(current, [result.message!]));
    setPending((current) => current.filter((item) => item.tempId !== tempId));
    void refreshList();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("message") || "").trim();
    const conversation = workspace?.conversations.find((item) => item.id === activeId);
    if (!text || !conversation) return;
    const tempId = -Date.now();
    setPending((current) => [...current, { tempId, mensagem: text, criadoEm: new Date(), status: "sending" }]);
    resetComposer(form);
    setSending(true);
    try {
      await deliver(conversation.id, conversation.participante_id, text, tempId);
    } catch (sendError) {
      setPending((current) => current.map((item) => (item.tempId === tempId ? { ...item, status: "failed" } : item)));
      setError((sendError as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function retryPending(tempId: number) {
    const item = pending.find((candidate) => candidate.tempId === tempId);
    const conversation = workspace?.conversations.find((candidate) => candidate.id === activeId);
    if (!item || !conversation) return;
    setPending((current) => current.map((candidate) => (candidate.tempId === tempId ? { ...candidate, status: "sending" } : candidate)));
    try {
      await deliver(conversation.id, conversation.participante_id, item.mensagem, tempId);
    } catch {
      setPending((current) => current.map((candidate) => (candidate.tempId === tempId ? { ...candidate, status: "failed" } : candidate)));
    }
  }

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    setHasDraft(el.value.trim().length > 0);
    setDraftLength(el.value.length);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleScroll() {
    const el = messagesRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  const filteredPeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const existingParticipants = new Set(
      (workspace?.conversations || []).map((item) => Number(item.participante_id)),
    );
    return (workspace?.people || []).filter((person) => {
      if (existingParticipants.has(Number(person.id))) return false;
      if (!term) return true;
      return [person.nome, person.hierarquia, person.ministerio]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [workspace?.conversations, workspace?.people, search]);
  const filteredConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return workspace?.conversations || [];
    return (workspace?.conversations || []).filter((conversation) =>
      [
        conversation.participante_nome,
        conversation.hierarquia,
        conversation.ministerio,
        conversation.ultima_mensagem || "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [workspace?.conversations, search]);
  const activeConversation = workspace?.conversations.find((item) => Number(item.id) === activeId);
  const threadItems = useMemo(
    () => buildThreadItems(confirmed, pending, workspace?.currentUserId || 0, retryPending, freshIds, pulseIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmed, pending, workspace?.currentUserId, freshIds, pulseIds],
  );
  const purgeCountdown = useMemo(() => formatPurgeCountdown(workspace?.nextPurgeAt || null), [workspace?.nextPurgeAt]);
  const purgeShort = useMemo(() => formatPurgeShort(workspace?.nextPurgeAt || null), [workspace?.nextPurgeAt]);

  return (
    <section className={`private-chat-shell ${activeId ? "has-thread" : ""}`}>
      <header className="workspace-heading private-chat-heading">
        <div>
          <p className="pilot-kicker">MENSAGENS</p>
          <h1>Conversas privadas</h1>
          <p>Só você e a outra pessoa têm acesso a cada conversa.</p>
        </div>
      </header>
      <p className="private-chat-retention-banner" role="status">
        <span aria-hidden="true">🕓</span>
        <span className="private-chat-retention-full">
          {workspace?.retentionNotice || FALLBACK_RETENTION_NOTICE}
          {purgeCountdown ? <strong> Próxima limpeza {purgeCountdown}.</strong> : null}
        </span>
        {/* No celular a tela é dos contatos: o aviso vira uma tarja de uma
            linha, com o essencial — quando some e o que fazer antes disso. */}
        <span className="private-chat-retention-short">
          {purgeShort
            ? <>Tudo é apagado <strong>{purgeShort}</strong> — salve o que precisar.</>
            : "As mensagens são apagadas na virada da semana — salve o que precisar."}
        </span>
      </p>
      {error && <p className="pilot-form-message" role="alert">{error}</p>}
      <div className={`private-chat-layout ${activeId ? "has-thread" : ""}`}>
        <aside className="private-chat-sidebar">
          <label className="private-chat-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Pesquisar pessoas</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar nome, função ou ministério" />
          </label>
          <div className="private-chat-conversations">
            {loading ? (
              <p className="private-chat-list-hint">Carregando conversas…</p>
            ) : filteredConversations.length === 0 ? (
              <p className="private-chat-list-hint">{search ? "Nada encontrado." : "Nenhuma conversa nesta semana ainda."}</p>
            ) : (
              filteredConversations.map((conversation) => {
                const ownLast = workspace ? Number(conversation.ultimo_remetente_id) === Number(workspace.currentUserId) : false;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={Number(conversation.id) === activeId ? "active" : ""}
                    onClick={() => void openConversation(Number(conversation.id))}
                  >
                    <Avatar name={conversation.participante_nome} photo={conversation.participante_foto} online={Boolean(conversation.online)} />
                    <div className="private-chat-row-main">
                      <div className="private-chat-row-top">
                        <strong>{conversation.participante_nome}</strong>
                        <time>{formatListTime(conversation.atualizado_em)}</time>
                      </div>
                      <div className="private-chat-row-bottom">
                        <p>{ownLast ? "Você: " : ""}{conversation.ultima_mensagem || "Conversa iniciada"}</p>
                        {Number(conversation.nao_lidas) > 0 && <b>{conversation.nao_lidas}</b>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="private-chat-people">
            <strong>Iniciar conversa</strong>
            {filteredPeople.map((person) => (
              <button key={person.id} type="button" onClick={() => void startConversation(person)}>
                <Avatar name={person.nome} photo={person.foto_perfil} online={Boolean(person.online)} />
                <span><strong>{person.nome}</strong><small>{metadata(person.hierarquia, person.ministerio)}</small></span>
              </button>
            ))}
          </div>
        </aside>
        <section className="private-chat-thread" aria-live="polite">
          {!workspace ? (
            <p className="private-chat-empty">Carregando conversas…</p>
          ) : !activeConversation ? (
            <div className="private-chat-empty">
              <span aria-hidden="true">✉</span>
              <strong>Suas conversas privadas</strong>
              <p>Escolha uma conversa na lista ao lado ou comece uma nova.</p>
            </div>
          ) : (
            <>
              <header>
                <button type="button" onClick={() => setActiveId(0)} aria-label="Voltar à lista">←</button>
                <Avatar name={activeConversation.participante_nome} photo={activeConversation.participante_foto} online={Boolean(activeConversation.online)} />
                <div>
                  <strong>{activeConversation.participante_nome}</strong>
                  <small>{presenceLabel(activeConversation)}</small>
                </div>
              </header>
              <div className="private-chat-messages" ref={messagesRef} onScroll={handleScroll}>
                {messagesLoading && !threadItems.length ? (
                  <p className="private-chat-list-hint">Carregando mensagens…</p>
                ) : (
                  threadItems.map((item) =>
                    item.kind === "separator" ? (
                      <div key={item.key} className="private-chat-day"><span>{item.label}</span></div>
                    ) : (
                      <article
                        key={item.key}
                        className={[
                          item.own ? "own" : "",
                          item.tight ? "tight" : "",
                          item.status === "failed" ? "failed" : "",
                          item.fresh ? "is-new" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        {!item.own && (
                          <Avatar
                            compact
                            hidden={!item.showAvatar}
                            name={activeConversation.participante_nome}
                            photo={activeConversation.participante_foto}
                          />
                        )}
                        <div className="private-chat-bubble">
                          <p>{item.text}</p>
                          <footer>
                            <time>{item.time}</time>
                            <Tick status={item.status} pulse={item.pulse} />
                          </footer>
                        </div>
                        {item.onRetry && (
                          <button type="button" className="private-chat-retry" onClick={item.onRetry}>
                            Falha ao enviar · toque para reenviar
                          </button>
                        )}
                      </article>
                    ),
                  )
                )}
              </div>
              <form onSubmit={send}>
                <textarea
                  ref={textareaRef}
                  name="message"
                  rows={1}
                  maxLength={2000}
                  required
                  placeholder="Escreva uma mensagem privada…"
                  enterKeyHint="send"
                  onChange={handleComposerChange}
                  onKeyDown={handleComposerKeyDown}
                />
                {draftLength > 1800 && <span className="private-chat-char-count">{draftLength}/2000</span>}
                <button type="submit" className={hasDraft ? "ready" : ""} disabled={sending || !hasDraft} aria-label="Enviar mensagem">➤</button>
              </form>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function Avatar({
  name,
  photo,
  online = false,
  compact = false,
  hidden = false,
}: {
  name: string;
  photo: string | null;
  online?: boolean;
  compact?: boolean;
  hidden?: boolean;
}) {
  return (
    <span className={`private-chat-avatar${compact ? " compact" : ""}${hidden ? " placeholder" : ""}`} aria-hidden={hidden || undefined}>
      {photo ? <img loading="lazy" src={photo} alt="" /> : initials(name)}
      {!compact && <i className={online ? "online" : ""} />}
    </span>
  );
}

function Tick({ status, pulse = false }: { status?: TickStatus; pulse?: boolean }) {
  if (!status) return null;
  const base = `private-chat-tick${pulse ? " is-updated" : ""}`;
  if (status === "sending") return <span className={`${base} pending`} aria-label="Enviando">⋯</span>;
  if (status === "failed") return <span className={`${base} failed`} aria-label="Falha ao enviar">!</span>;
  if (status === "sent") return <span className={base} aria-label="Enviada">✓</span>;
  if (status === "delivered") return <span className={base} aria-label="Entregue">✓✓</span>;
  return <span className={`${base} read`} aria-label="Visualizada">✓✓</span>;
}

function presenceLabel(conversation: Conversation) {
  if (conversation.online) return "Online agora";
  const lastSeen = formatLastSeen(conversation.last_seen);
  if (lastSeen) return lastSeen;
  return metadata(conversation.hierarquia, conversation.ministerio) || "Offline";
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function metadata(hierarchy: string, ministry: string) {
  return ministry ? `${hierarchy} · ${ministry}` : hierarchy;
}

function parseServerDate(value: string) {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatBubbleTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatListTime(value: string) {
  const date = parseServerDate(value);
  if (!date) return "";
  const now = new Date();
  if (isSameDay(date, now)) return formatBubbleTime(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatDaySeparator(date: Date) {
  const now = new Date();
  if (isSameDay(date, now)) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Ontem";
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  const label = new Intl.DateTimeFormat("pt-BR", options).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatLastSeen(value: string | null) {
  const date = value ? parseServerDate(value) : null;
  if (!date) return null;
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `Visto há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Visto há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Visto ontem";
  if (days < 7) return `Visto há ${days} dias`;
  return null;
}

// A virada da semana acontece em horário universal, então o dia e a hora
// exibidos são sempre os do fuso de quem lê — daí mostrar data e hora
// completas em vez de repetir um dia da semana que só vale em parte do mundo.
function formatPurgeCountdown(nextPurgeAt: string | null) {
  if (!nextPurgeAt) return null;
  const date = new Date(nextPurgeAt);
  if (!Number.isFinite(date.getTime())) return null;
  const when = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return `hoje — ${when}`;
  if (days === 1) return `amanhã — ${when}`;
  return `em ${days} dias — ${when}`;
}

// Versão curta do prazo para a tarja do celular: "domingo, 13/09 às 21:00".
function formatPurgeShort(nextPurgeAt: string | null) {
  if (!nextPurgeAt) return null;
  const date = new Date(nextPurgeAt);
  if (!Number.isFinite(date.getTime())) return null;
  const day = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(date);
  const hour = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day} às ${hour}`;
}

// Estado do tique de uma mensagem própria: lida > entregue > enviada. Nas
// mensagens recebidas não há tique (quem recebeu não confirma para si).
function messageStatus(message: Message, currentUserId: number): TickStatus | undefined {
  if (Number(message.remetente_id) !== Number(currentUserId)) return undefined;
  if (message.lida_em) return "read";
  if (message.entregue_em) return "delivered";
  return "sent";
}

function buildThreadItems(
  confirmed: Message[],
  pending: PendingMessage[],
  currentUserId: number,
  retry: (tempId: number) => void,
  freshIds: number[] = [],
  pulseIds: number[] = [],
): ThreadItem[] {
  const fresh = new Set(freshIds);
  const pulse = new Set(pulseIds);
  type Normalized = { key: string; own: boolean; text: string; date: Date; senderId: number; status?: TickStatus; onRetry?: () => void; fresh: boolean; pulse: boolean };
  const normalized: Normalized[] = [
    ...confirmed.map((message): Normalized => ({
      key: `m${message.id}`,
      own: Number(message.remetente_id) === Number(currentUserId),
      text: message.mensagem,
      date: parseServerDate(message.criado_em) || new Date(0),
      senderId: Number(message.remetente_id),
      status: messageStatus(message, currentUserId),
      fresh: fresh.has(message.id),
      pulse: pulse.has(message.id),
    })),
    ...pending.map((item): Normalized => ({
      key: `p${item.tempId}`,
      own: true,
      text: item.mensagem,
      date: item.criadoEm,
      senderId: currentUserId,
      status: item.status,
      onRetry: item.status === "failed" ? () => retry(item.tempId) : undefined,
      fresh: true,
      pulse: false,
    })),
  ];

  const startsGroup = normalized.map((item, index) => {
    const previous = normalized[index - 1];
    if (!previous || !isSameDay(previous.date, item.date)) return true;
    return previous.senderId !== item.senderId || item.date.getTime() - previous.date.getTime() >= GROUP_GAP_MS;
  });

  const items: ThreadItem[] = [];
  normalized.forEach((item, index) => {
    const isNewGroup = startsGroup[index];
    const previous = normalized[index - 1];
    if (!previous || !isSameDay(previous.date, item.date)) {
      items.push({ kind: "separator", key: `sep-${item.key}`, label: formatDaySeparator(item.date) });
    }
    const endsGroup = index === normalized.length - 1 || startsGroup[index + 1];
    items.push({
      kind: "message",
      key: item.key,
      own: item.own,
      text: item.text,
      time: formatBubbleTime(item.date),
      showAvatar: endsGroup,
      tight: !isNewGroup,
      fresh: item.fresh,
      pulse: item.pulse,
      status: item.status,
      onRetry: item.onRetry,
    });
  });
  return items;
}

async function readResult(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: "O servidor retornou uma resposta inválida." };
  }
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
