"use client";
import { playChatSound } from "../lib/chat-sounds";

import SafeImage from "./SafeImage";
import ChatEmoji, { EmojiText } from "./ChatEmoji";
import { CHAT_EMOJIS } from "../lib/chat-emojis";


import { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
      retryId?: number;
    };

const FALLBACK_RETENTION_NOTICE =
  "Por privacidade, as mensagens desta semana são apagadas por completo na virada da semana, sem exceção.";
const GROUP_GAP_MS = 3 * 60_000;
const MESSAGE_POLL_MS = 3_000;
const LIST_POLL_MS = 8_000;
const CHAT_THEMES = [["brisa", "Brisa", "Leve e azul"], ["jardim", "Jardim", "Verde que acolhe"], ["lavanda", "Lavanda", "Calma em lilás"], ["areia", "Areia", "Luz e aconchego"], ["aurora", "Aurora", "Cores em movimento"], ["oceano", "Oceano", "Ondas tranquilas"], ["por-do-sol", "Pôr do sol", "Um fim de tarde"], ["cosmos", "Cosmos", "Entre as estrelas"], ["sakura", "Sakura", "Pétalas ao vento"], ["montanhas", "Montanhas", "Respire fundo"], ["confete", "Confete", "Pequenas alegrias"], ["liso", "Essencial", "Só o que importa"]];

export default function PrivateChatWorkspace({
  initialTargetUserId = null,
  visible = true,
  openSequence = 0,
  onReadingChange,
  onMinimize,
  onClose,
}: {
  // Quem o painel de presença pediu para abrir. A conversa é criada (ou
  // reaproveitada) no primeiro carregamento; a regra de quem pode falar com
  // quem continua sendo decidida pelo servidor em /api/pilot/chat.
  initialTargetUserId?: number | null;
  visible?: boolean;
  openSequence?: number;
  onReadingChange?: (userId: number | null) => void;
  onMinimize?: () => void;
  onClose?: () => void;
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
  // A new scope also invalidates an earlier visit to the same conversation.
  const activeScopeRef = useRef({ id: initialConversation });
  const aliveRef = useRef(true);
  const messagesRequestRef = useRef(0);
  const openingRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const pollScopeRef = useRef<object | null>(null);
  const pendingIdRef = useRef(0);
  const shellRef = useRef<HTMLElement>(null);
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; }, [visible]);
  const [now, setNow] = useState(() => Date.now());
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState("Expressões");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [wallpaper, setWallpaper] = useState("brisa");
  const [customColor, setCustomColor] = useState("#e8edf5");
  const [preferenceUser, setPreferenceUser] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [visible]);

  useEffect(() => {
    const id = workspace?.currentUserId;
    if (!id) return;
    const timer = window.setTimeout(() => {
      setWallpaper("brisa");
      setCustomColor("#e8edf5");
      try {
        const saved = JSON.parse(window.localStorage.getItem(`vinkulo:chat-appearance:${id}`) || "null");
        if (saved && [...CHAT_THEMES.map(theme => theme[0]), "custom"].includes(saved.wallpaper)) setWallpaper(saved.wallpaper);
        if (/^#[0-9a-f]{6}$/i.test(saved?.color)) setCustomColor(saved.color);
      } catch { /* Preferences are optional when browser storage is unavailable. */ }
      setPreferenceUser(id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspace?.currentUserId]);

  useEffect(() => {
    if (!preferenceUser || preferenceUser !== workspace?.currentUserId) return;
    try { window.localStorage.setItem(`vinkulo:chat-appearance:${preferenceUser}`, JSON.stringify({ wallpaper, color: customColor })); } catch { /* Keep the current session preference. */ }
  }, [wallpaper, customColor, preferenceUser, workspace?.currentUserId]);

  useEffect(() => {
    aliveRef.current = true;
    const openingRequest = openingRequestRef, listRequest = listRequestRef;
    return () => {
      aliveRef.current = false;
      activeScopeRef.current = { id: activeScopeRef.current.id };
      openingRequest.current++;
      listRequest.current++;
    };
  }, []);

  const isCurrentScope = useCallback((scope: { id: number }) => {
    return aliveRef.current && activeScopeRef.current === scope;
  }, []);

  // The keyboard changes the visible viewport without resizing the layout
  // viewport on mobile Safari and Android. Keep the composer inside that area.
  useEffect(() => {
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    if (!shell || !viewport || !visible) return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        // Preserve browser pinch zoom; only follow viewport changes at 1x.
        if (viewport.scale !== 1) return;
        shell.style.setProperty("--chat-visible-height", `${viewport.height}px`);
        shell.style.setProperty("--chat-visible-top", `${viewport.offsetTop}px`);
        const dock = shell.closest<HTMLElement>(".pilot-message-popover");
        dock?.style.setProperty("--chat-visible-height", `${viewport.height}px`);
        dock?.style.setProperty("--chat-visible-top", `${viewport.offsetTop}px`);
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      shell.style.removeProperty("--chat-visible-height");
      shell.style.removeProperty("--chat-visible-top");
    };
  }, [activeId, visible]);
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
  const openedTargetRef = useRef("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function loadWorkspace(conversationId: number) {
    const scope = activeScopeRef.current;
    if (scope.id !== conversationId) return;
    const messagesRequest = ++messagesRequestRef.current;
    const listRequest = ++listRequestRef.current;
    const isInitial = !workspaceLoadedRef.current;
    if (isInitial) setLoading(true);
    if (conversationId > 0) setMessagesLoading(true);
    try {
      const query = conversationId > 0 ? `?conversation=${conversationId}` : "";
      const response = await fetch(`/api/pilot/chat${query}`, { cache: "no-store" });
      const result = (await readResult(response)) as ApiResponse;
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as mensagens.");
      if (!isCurrentScope(scope)) return;
      workspaceLoadedRef.current = true;
      if (listRequest === listRequestRef.current) setWorkspace({
        people: result.people || [],
        conversations: result.conversations || [],
        currentUserId: Number(result.currentUserId || 0),
        retentionNotice: result.retentionNotice || FALLBACK_RETENTION_NOTICE,
        nextPurgeAt: result.nextPurgeAt || null,
      });
      if (conversationId > 0 && messagesRequest === messagesRequestRef.current) {
        seenIdsRef.current = new Set((result.messages || []).map(message => message.id));
        setConfirmed(result.messages || []);
      }
      setError("");
    } catch (loadError) {
      if (isCurrentScope(scope)) setError((loadError as Error).message);
    } finally {
      if (isCurrentScope(scope)) {
        if (isInitial) setLoading(false);
        if (conversationId > 0) setMessagesLoading(false);
      }
    }
  }

  const refreshMessages = useCallback(async (conversationId: number) => {
    if (conversationId <= 0) return;
    const scope = activeScopeRef.current;
    if (scope.id !== conversationId || pollScopeRef.current === scope) return;
    pollScopeRef.current = scope;
    const request = ++messagesRequestRef.current;
    try {
      const response = await fetch(`/api/pilot/chat?conversation=${conversationId}&messagesOnly=1`, { cache: "no-store" });
      const result = (await readResult(response)) as ApiResponse;
      if (!response.ok || !isCurrentScope(scope) || request !== messagesRequestRef.current) return;
      setConfirmed(result.messages || []);
    } catch {
      // Sondagem silenciosa: uma falha passageira não deve interromper a conversa.
    } finally {
      if (pollScopeRef.current === scope) pollScopeRef.current = null;
    }
  }, [isCurrentScope]);

  async function refreshList() {
    if (!workspaceLoadedRef.current || !aliveRef.current) return;
    const request = ++listRequestRef.current;
    try {
      const response = await fetch("/api/pilot/chat", { cache: "no-store" });
      const result = (await readResult(response)) as ApiResponse;
      if (!response.ok || !aliveRef.current || request !== listRequestRef.current) return;
      setWorkspace((current) =>
        current ? { ...current, people: result.people || [], conversations: result.conversations || [], nextPurgeAt: result.nextPurgeAt || current.nextPurgeAt } : current,
      );
    } catch {
      // Idem: a lista tenta de novo no próximo ciclo.
    }
  }

  async function markRead(conversationId: number) {
    if (conversationId <= 0 || !aliveRef.current || !visibleRef.current || document.visibilityState !== "visible" || activeScopeRef.current.id !== conversationId) return;
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
    if (activeId <= 0 || !visible) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshMessages(activeId);
      void markRead(activeId);
    }, MESSAGE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, refreshMessages, visible]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshList();
    };
    const timer = window.setInterval(tick, LIST_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshList();
      if (activeId > 0 && visibleRef.current) {
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
  }, [activeId, refreshMessages]);

  function resetComposer(form: HTMLFormElement) {
    form.reset();
    setHasDraft(false);
    setDraftLength(0);
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
  }

  function changeActiveConversation(conversationId: number) {
    activeScopeRef.current = { id: conversationId };
    openingRequestRef.current++;
    messagesRequestRef.current++;
    setConfirmed([]);
    setPending([]);
    setSending(false);
    setError("");
    setEmojiOpen(false);
    setAppearanceOpen(false);
    if (textareaRef.current?.form) resetComposer(textareaRef.current.form);
    stickToBottomRef.current = true;
    seenIdsRef.current = null;
    statusRef.current = null;
    setFreshIds([]);
    setPulseIds([]);
    setActiveId(conversationId);
    if (conversationId === 0) {
      const address = new URL(window.location.href);
      address.searchParams.delete("conversation");
      window.history.replaceState(window.history.state, "", address);
    }
  }

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
    const incoming = confirmed.filter(message => fresh.includes(message.id) && Number(message.remetente_id) !== currentUserId).at(-1);
    if (incoming && visible) playChatSound("received", incoming.id);
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
  }, [confirmed, workspace?.currentUserId, visible]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [confirmed, pending, activeId]);

  async function openConversation(conversationId: number) {
    changeActiveConversation(conversationId);
    const address = new URL(window.location.href);
    address.searchParams.set("view", "mensagens");
    address.searchParams.set("conversation", String(conversationId));
    window.history.replaceState(window.history.state, "", address);
    await loadWorkspace(conversationId);
    void markRead(conversationId);
  }

  async function openWithUser(userId: number) {
    const request = ++openingRequestRef.current;
    try {
      const response = await fetch("/api/pilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const result = (await readResult(response)) as { conversationId?: number; error?: string };
      if (!aliveRef.current || request !== openingRequestRef.current) return;
      if (!response.ok || !result.conversationId) {
        setError(result.error || "Não foi possível abrir a conversa.");
        return;
      }
      await openConversation(result.conversationId);
    } catch (openError) {
      if (aliveRef.current && request === openingRequestRef.current) setError((openError as Error).message || "Não foi possível abrir a conversa.");
    }
  }

  async function startConversation(person: Person) {
    await openWithUser(person.id);
  }

  useEffect(() => {
    if (!initialTargetUserId || initialTargetUserId <= 0) return;
    const key = `${initialTargetUserId}:${openSequence}`;
    if (openedTargetRef.current === key) return;
    openedTargetRef.current = key;
    void openWithUser(initialTargetUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTargetUserId, openSequence]);


  async function deliver(conversationId: number, participantId: number, text: string, tempId: number) {
    const scope = activeScopeRef.current;
    if (scope.id !== conversationId) return;
    const response = await fetch("/api/pilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: participantId, message: text }),
    });
    const result = (await readResult(response)) as { error?: string; message?: Message };
    if (!response.ok || !result.message) throw new Error(result.error || "Não foi possível enviar a mensagem.");
    playChatSound("sent", result.message.id);
    if (!isCurrentScope(scope)) return;
    // A poll started before this write must not erase the confirmed message.
    messagesRequestRef.current++;
    setError("");
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
    const scope = activeScopeRef.current;
    if (scope.id !== conversation.id) return;
    const tempId = --pendingIdRef.current;
    setPending((current) => [...current, { tempId, mensagem: text, criadoEm: new Date(), status: "sending" }]);
    resetComposer(form);
    setSending(true);
    try {
      await deliver(conversation.id, conversation.participante_id, text, tempId);
    } catch (sendError) {
      if (!isCurrentScope(scope)) return;
      setPending((current) => current.map((item) => (item.tempId === tempId ? { ...item, status: "failed" } : item)));
      setError((sendError as Error).message);
    } finally {
      if (isCurrentScope(scope)) setSending(false);
    }
  }

  async function retryPending(tempId: number) {
    const item = pending.find((candidate) => candidate.tempId === tempId);
    const conversation = workspace?.conversations.find((candidate) => candidate.id === activeId);
    if (!item || !conversation) return;
    const scope = activeScopeRef.current;
    setPending((current) => current.map((candidate) => (candidate.tempId === tempId ? { ...candidate, status: "sending" } : candidate)));
    try {
      await deliver(conversation.id, conversation.participante_id, item.mensagem, tempId);
    } catch {
      if (!isCurrentScope(scope)) return;
      setPending((current) => current.map((candidate) => (candidate.tempId === tempId ? { ...candidate, status: "failed" } : candidate)));
    }
  }

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    setHasDraft(el.value.trim().length > 0);
    setDraftLength(el.value.length);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 140)}px`;
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
  const hasActiveConversation = Boolean(activeConversation);
  const readingUserId = visible && activeConversation ? Number(activeConversation.participante_id) : null;
  useEffect(() => {
    onReadingChange?.(readingUserId);
    return () => onReadingChange?.(null);
  }, [readingUserId, onReadingChange]);
  useEffect(() => {
    const shell = shellRef.current;
    const form = textareaRef.current?.form;
    if (!shell || !form || typeof ResizeObserver === "undefined") return;
    const update = () => shell.style.setProperty("--chat-composer-height", `${form.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(form);
    return () => observer.disconnect();
  }, [activeId, hasActiveConversation]);
  const threadItems = useMemo(
    () => buildThreadItems(confirmed, pending, workspace?.currentUserId || 0, freshIds, pulseIds),
    [confirmed, pending, workspace?.currentUserId, freshIds, pulseIds],
  );
  const purgeTime = workspace?.nextPurgeAt ? Date.parse(workspace.nextPurgeAt) : NaN;
  const remaining = Number.isFinite(purgeTime) ? Math.max(0, purgeTime - now) : null;
  const retentionProgress = remaining === null ? 0 : Math.min(100, Math.max(0, 100 * (1 - remaining / 604800000)));

  useEffect(() => {
    if (!visible || activeId <= 0) return;
    const timer = window.setTimeout(() => {
      void refreshMessages(activeId);
      void markRead(activeId);
    }, 0);
    return () => window.clearTimeout(timer);
    // Resume immediately after restoring the dock; never read while minimized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function insertEmoji(emoji: string) {
    const field = textareaRef.current;
    if (!field || field.value.length - (field.selectionEnd - field.selectionStart) + emoji.length > 2000) return;
    field.setRangeText(emoji, field.selectionStart, field.selectionEnd, "end");
    setHasDraft(Boolean(field.value.trim()));
    setDraftLength(field.value.length);
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight + 2, 140)}px`;
    field.focus();
  }

  return (
    <section ref={shellRef} className={`private-chat-shell chat-redesign ${activeId ? "has-thread" : ""}`} data-wallpaper={wallpaper} style={{ "--chat-custom-color": customColor } as React.CSSProperties} onKeyDown={(event) => { if (event.key === "Escape" && (emojiOpen || appearanceOpen)) { event.stopPropagation(); setEmojiOpen(false); setAppearanceOpen(false); } }}>
      <header className="workspace-heading private-chat-heading">
        <div>
          <p className="pilot-kicker">MENSAGENS</p>
          <h1>Conversas privadas</h1>
          <p>Só você e a outra pessoa têm acesso a cada conversa.</p>
        </div>
      </header>
      {!activeId && <div className="chat-retention" title={Number.isFinite(purgeTime) ? `Limpeza semanal: ${new Date(purgeTime).toLocaleString("pt-BR")}` : undefined}>
        <ChatIcon name="clock" />
        <p>{remaining === null ? "As mensagens são apagadas semanalmente." : remaining === 0 ? "O prazo expirou; atualizando as conversas." : <>As mensagens serão apagadas em <strong>{formatRemaining(remaining)}</strong>.</>}</p>
        <div className="chat-retention-track" role="progressbar" aria-label="Tempo decorrido até a exclusão semanal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(retentionProgress)} aria-valuetext={remaining === null ? "Consultando prazo" : `${formatRemaining(remaining)} restantes`}><span style={{ width: `${retentionProgress}%` }} /></div>
      </div>
      }
      {error && <p className="pilot-form-message" role="alert">{error}</p>}
      <div className={`private-chat-layout ${activeId ? "has-thread" : ""}`}>
        <aside className="private-chat-sidebar">
          <label className="private-chat-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Pesquisar pessoas</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa ou pessoa" />
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
        {activeId > 0 && <section className="private-chat-thread" aria-live="polite">
          {!workspace ? (
            <p className="private-chat-empty">Carregando conversas…</p>
          ) : !activeConversation ? (
            <div className="private-chat-empty">
              <span aria-hidden="true">✉</span>
              <strong>Suas conversas privadas</strong>
              <p>Esta conversa não está mais disponível.</p>
              <button type="button" onClick={() => changeActiveConversation(0)}>Voltar às conversas</button>
            </div>
          ) : (
            <>
              <header>
                <button type="button" onClick={() => changeActiveConversation(0)} aria-label="Voltar à lista">←</button>
                <Avatar name={activeConversation.participante_nome} photo={activeConversation.participante_foto} online={Boolean(activeConversation.online)} />
                <div>
                  <strong>{activeConversation.participante_nome}</strong>
                  <small className={activeConversation.online ? "chat-presence is-online" : "chat-presence"}>{presenceLabel(activeConversation)}</small>
                </div>
                <button className="chat-appearance-toggle" type="button" aria-label="Personalizar fundo" title="Personalizar fundo" aria-expanded={appearanceOpen} aria-controls="chat-appearance" onClick={() => { setAppearanceOpen(!appearanceOpen); setEmojiOpen(false); }}><ChatIcon name="palette" /></button>
                {onMinimize && <button className="chat-thread-control" type="button" aria-label="Minimizar conversas" title="Minimizar" onClick={onMinimize}>−</button>}
                {onClose && <button className="chat-thread-control" type="button" aria-label="Fechar mensagens" title="Fechar" onClick={onClose}>×</button>}
              </header>
              {appearanceOpen && <div className="chat-appearance" id="chat-appearance">
                <div><strong>Encontre seu clima</strong><button type="button" className="chat-panel-close" aria-label="Fechar temas" onClick={() => setAppearanceOpen(false)}>×</button></div>
                <p className="chat-theme-hint">Cores e detalhes só para você, neste navegador.</p>
                <div className="chat-wallpapers" role="group" aria-label="Fundo da conversa">
                  {CHAT_THEMES.map(([id, label, detail]) => <button key={id} type="button" data-wallpaper={id} aria-label={label} title={detail} aria-pressed={wallpaper === id} onClick={() => setWallpaper(id)}><span className="chat-theme-preview" data-theme={id} aria-hidden="true"><i /><i /><b>{wallpaper === id ? "✓" : ""}</b></span><strong>{label}</strong><small>{detail}</small></button>)}
                  <label className="chat-custom-color"><input type="color" aria-label="Cor personalizada do fundo" value={customColor} onChange={(event) => { setCustomColor(event.target.value); setWallpaper("custom"); }} /><span>Sua cor</span></label>
                </div>
              </div>}
              <div className="private-chat-messages" ref={messagesRef} onScroll={handleScroll}>
                {!messagesLoading && !threadItems.length && <div className="chat-welcome"><span><ChatIcon name="message" /></span><strong>Uma boa conversa começa aqui</strong><p>Envie uma mensagem para {activeConversation.participante_nome.split(" ")[0]}.</p><small>Uma conexão de cada vez.</small></div>}
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
                          <p><EmojiText>{item.text}</EmojiText></p>
                          <footer>
                            <time>{item.time}</time>
                            <Tick status={item.status} pulse={item.pulse} />
                          </footer>
                        </div>
                        {item.retryId !== undefined && (
                          <button type="button" className="private-chat-retry" onClick={() => void retryPending(item.retryId!)}>
                            Falha ao enviar · toque para reenviar
                          </button>
                        )}
                      </article>
                    ),
                  )
                )}
              </div>
              {emojiOpen && <div className="chat-emoji-picker" role="group" aria-label="Escolher emoji">
                <div><strong>Diga com um emoji</strong><button type="button" onClick={() => setEmojiOpen(false)} aria-label="Fechar emojis">×</button></div>
                <input className="chat-emoji-search" value={emojiSearch} onChange={event => setEmojiSearch(event.target.value)} placeholder="Buscar emoji…" aria-label="Buscar emoji" />
                <nav className="chat-emoji-categories" aria-label="Categorias de emojis">{["Expressões", "Gestos", "Afeto", "Vida"].map(category => <button key={category} type="button" aria-pressed={emojiCategory === category} onClick={() => { setEmojiCategory(category); setEmojiSearch(""); }}>{category}</button>)}</nav>
                <div className="chat-emoji-grid">{CHAT_EMOJIS.filter(item => emojiSearch ? item.label.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(emojiSearch.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "")) : item.category === emojiCategory).map(({ emoji, label }) => <button type="button" key={emoji} aria-label={`Inserir ${label}`} title={label} onMouseDown={event => event.preventDefault()} onClick={() => insertEmoji(emoji)}><ChatEmoji emoji={emoji} /></button>)}</div>
              </div>}
              <form onSubmit={send}>
                <button type="button" className="chat-emoji-toggle" aria-label="Abrir emojis" aria-expanded={emojiOpen} onClick={() => { setEmojiOpen(!emojiOpen); setAppearanceOpen(false); }}><ChatIcon name="smile" /></button>
                <textarea
                  ref={textareaRef}
                  name="message"
                  aria-label="Mensagem"
                  rows={1}
                  maxLength={2000}
                  required
                  placeholder="Sua mensagem…"
                  enterKeyHint="send"
                  onChange={handleComposerChange}
                  onKeyDown={handleComposerKeyDown}
                />
                {draftLength > 1800 && <span className="private-chat-char-count">{draftLength}/2000</span>}
                <button type="submit" className={hasDraft ? "ready" : ""} disabled={sending || !hasDraft} aria-label="Enviar mensagem"><ChatIcon name="send" /></button>
              </form>
            </>
          )}
        </section>}
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
      {photo ? <SafeImage loading="lazy" fallbackName={name} fallbackKind="avatar" src={photo} alt="" /> : initials(name)}
      {!compact && <i className={online ? "online" : ""} />}
    </span>
  );
}

function Tick({ status, pulse = false }: { status?: TickStatus; pulse?: boolean }) {
  if (!status) return null;
  const labels = { sending: "Enviando", failed: "Falhou", sent: "Enviado", delivered: "Entregue", read: "Visto" };
  return <span className={`private-chat-tick ${status}${pulse ? " is-updated" : ""}`} aria-label={status === "read" ? "Visualizada" : labels[status]} title={status === "read" ? "Mensagem visualizada" : labels[status]}>
    <span className="chat-status-symbol" aria-hidden="true">{status === "sending" ? <i /> : status === "failed" ? "!" : <svg viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path pathLength="1" d="m2 8 4 4L16 2" />{(status === "delivered" || status === "read") && <path pathLength="1" d="m11 10 2 2L23 2" />}</svg>}</span>
    <span>{labels[status]}</span>
  </span>;
}

function ChatIcon({ name }: { name: "clock" | "palette" | "message" | "smile" | "send" }) {
  return <svg className="chat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "clock" && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}
    {name === "message" && <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/><path d="M7 9h10M7 13h7"/></>}
    {name === "smile" && <><circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01"/></>}
    {name === "send" && <><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/></>}
    {name === "palette" && <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.6 1.6 0 0 1 1-2.8h2a4 4 0 0 0 4-4A8.5 8.5 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="7" r=".8"/><circle cx="16" cy="8" r=".8"/></>}
  </svg>;
}
function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total % 86400 / 3600).toString().padStart(2, "0");
  const minutes = Math.floor(total % 3600 / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${days ? days + "d " : ""}${hours}:${minutes}:${seconds}`;
}

function presenceLabel(conversation: Conversation) {
  if (conversation.online) return "Online agora";
  const lastSeen = formatLastSeen(conversation.last_seen);
  if (lastSeen) return lastSeen;
  return "Offline · último acesso indisponível";
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
  const now = new Date();
  const time = formatBubbleTime(date);
  if (isSameDay(date, now)) return `Visto hoje às ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Visto ontem às ${time}`;
  return `Visto em ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)} às ${time}`;
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
  freshIds: number[] = [],
  pulseIds: number[] = [],
): ThreadItem[] {
  const fresh = new Set(freshIds);
  const pulse = new Set(pulseIds);
  type Normalized = { key: string; own: boolean; text: string; date: Date; senderId: number; status?: TickStatus; retryId?: number; fresh: boolean; pulse: boolean };
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
      retryId: item.status === "failed" ? item.tempId : undefined,
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
      retryId: item.retryId,
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
