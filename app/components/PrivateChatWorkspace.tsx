"use client";

import { mergeChatMessages } from "../lib/chat-page.mjs";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Person = {
  id: number;
  nome: string;
  foto_perfil: string | null;
  hierarquia: string;
  ministerio: string;
  online: number;
};
type Conversation = {
  id: number;
  participante_id: number;
  participante_nome: string;
  participante_foto: string | null;
  hierarquia: string;
  ministerio: string;
  ultima_mensagem: string;
  nao_lidas: number;
  atualizado_em: string;
  online: number;
};
type Message = {
  fileId?: string;
  driveCreatedTime?: string;
  id: number;
  remetente_id: number;
  remetente_nome: string;
  mensagem: string;
  hierarquia: string;
  ministerio: string;
  criado_em: string;
  lida_em: string | null;
};
type ChatData = {
  people: Person[];
  conversations: Conversation[];
  messages: Message[];
  currentUserId: number;
  cycle: string;
  storage?: "GOOGLE_DRIVE";
  privacyNotice?: string;
  autoLoadRecent?: boolean;
  recentContentLoaded?: boolean;
  partial?: boolean;
  nextPageToken?: string | null;
  syncSince?: string | null;
};

export default function PrivateChatWorkspace() {
  const initialConversation = Number(
    typeof window === "undefined"
      ? 0
      : new URL(window.location.href).searchParams.get("conversation") || 0,
  );
  const [data, setData] = useState<ChatData | null>(null);
  const [activeId, setActiveId] = useState(initialConversation);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const loadRecentRef = useRef(false);
  const dataRef = useRef(data);
  const activeRef = useRef(activeId);
  const inFlightRef = useRef(false);
  const syncRef = useRef<{ since?: string; pageToken?: string }>({});
  const [olderPageToken, setOlderPageToken] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  async function load(
    conversationId = activeId,
    quiet = false,
    forceRecent = loadRecentRef.current,
  ) {
    if (!quiet) setLoading(true);
    if (quiet && inFlightRef.current) return;
    inFlightRef.current = true;
    const params = new URLSearchParams();
    if (conversationId > 0) params.set("conversation", String(conversationId));
    if (forceRecent) params.set("loadRecent", "1");
    if (quiet) {
      params.set("messagesOnly", "1");
      if (syncRef.current.since) params.set("since", syncRef.current.since);
      if (syncRef.current.pageToken) params.set("pageToken", syncRef.current.pageToken);
      params.set("known", (dataRef.current?.messages || []).slice(-200).map(m => m.fileId || "").filter(Boolean).join(","));
    }
    const query = `?${params}`;
    try {
      const response = await fetch(`/api/pilot/chat${query}`, { cache: "no-store" });
      const result = await readResult(response) as ChatData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as mensagens.");
      if (activeRef.current !== conversationId) return;
      if (result.recentContentLoaded) loadRecentRef.current = true;
      if (quiet && conversationId > 0) {
        setData((current) => current ? {
          ...current,
          messages: mergeChatMessages(current.messages, result.messages || []),
          partial: result.partial,
        } : current);
      } else {
        setData(result);
        setOlderPageToken(result.nextPageToken || null);
      }
      if (!result.partial) {
        syncRef.current = quiet && result.nextPageToken
          ? { ...syncRef.current, pageToken: result.nextPageToken }
          : { since: result.syncSince || syncRef.current.since };
      }
      setError(result.partial ? "Carregamento parcial: algumas mensagens não puderam ser lidas. Use Tentar novamente; o histórico não foi apagado." : "");
      if (conversationId > 0) {
        await fetch("/api/pilot/chat", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
      }
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      inFlightRef.current = false;
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void load(activeId), 0);
    const timer = window.setInterval(() => {
      if (
        activeId > 0 &&
        loadRecentRef.current &&
        document.visibilityState === "visible"
      ) void load(activeId, true);
    }, 4_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function openConversation(conversationId: number) {
    loadRecentRef.current = false;
    setSendError("");
    activeRef.current = conversationId;
    syncRef.current = {};
    setOlderPageToken(null);
    setActiveId(conversationId);
    const address = new URL(window.location.href);
    address.searchParams.set("view", "mensagens");
    address.searchParams.set("conversation", String(conversationId));
    window.history.replaceState(window.history.state, "", address);

  }

  async function startConversation(person: Person) {
    const response = await fetch("/api/pilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: person.id }),
    });
    const result = await readResult(response) as { conversationId?: number; error?: string };
    if (!response.ok || !result.conversationId) {
      setError(result.error || "Não foi possível abrir a conversa.");
      return;
    }
    await openConversation(result.conversationId);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") || "").trim();
    const conversation = data?.conversations.find((item) => Number(item.id) === activeId);
    if (!message || !conversation) return;
    setSending(true);
    setSendError("");
    try {
      const response = await fetch("/api/pilot/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: conversation.participante_id, message }),
      });
      const result = await readResult(response) as { error?: string; message?: Message };
      if (!response.ok || !result.message) throw new Error(result.error || "Não foi possível confirmar o envio.");
      if (activeRef.current === conversation.id) setData(current => current ? {
        ...current, messages: mergeChatMessages(current.messages, [result.message!]),
      } : current);
      setDrafts(current => current[conversation.id]?.trim() === message ? { ...current, [conversation.id]: "" } : current);
    } catch (caught) {
      if (activeRef.current === conversation.id) setSendError(`${(caught as Error).message} Seu texto foi mantido para tentar novamente.`);
    } finally { setSending(false); }
  }

  async function loadOlder() {
    if (!olderPageToken || loadingOlder) return;
    setLoadingOlder(true);
    const conversationId = activeId;
    try {
      const params = new URLSearchParams({ conversation: String(activeId), messagesOnly: "1", loadRecent: "1", pageToken: olderPageToken });
      const response = await fetch(`/api/pilot/chat?${params}`, { cache: "no-store" });
      const result = await readResult(response) as ChatData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o histórico.");
      if (activeRef.current !== conversationId) return;
      setData(current => current ? { ...current, messages: mergeChatMessages(current.messages, result.messages || []), partial: result.partial } : current);
      if (!result.partial) setOlderPageToken(result.nextPageToken || null);
      setError(result.partial ? "Histórico parcial. Tente carregar novamente para recuperar as mensagens com erro." : "");
    } catch (caught) { setError((caught as Error).message); }
    finally { setLoadingOlder(false); }
  }

  const filteredPeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const existingParticipants = new Set(
      (data?.conversations || []).map((item) => Number(item.participante_id)),
    );
    return (data?.people || []).filter((person) => {
      if (existingParticipants.has(Number(person.id))) return false;
      if (!term) return true;
      return [person.nome, person.hierarquia, person.ministerio]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [data?.conversations, data?.people, search]);
  const filteredConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return data?.conversations || [];
    return (data?.conversations || []).filter((conversation) =>
      [
        conversation.participante_nome,
        conversation.hierarquia,
        conversation.ministerio,
        conversation.ultima_mensagem,
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [data?.conversations, search]);
  const activeConversation = data?.conversations.find((item) => Number(item.id) === activeId);

  return (
    <section className="private-chat-shell">
      <header className="workspace-heading private-chat-heading">
        <div>
          <p className="pilot-kicker">CONVERSAS PRIVADAS</p>
          <h1>Mensagens</h1>
          <p>O acesso pela plataforma é restrito aos participantes com vínculo ativo. As chaves de leitura são mantidas pelo serviço.</p>
        </div>
        <span>Conversas do mês atual</span>
      </header>
      <p className="private-chat-storage-notice" role="status">
        ☁ {data?.privacyNotice || "Novas mensagens ficam no Google Drive da comunidade. Históricos legados permanecem preservados até a migração revisada."}
      </p>
      {error && <p className="pilot-form-message" role="alert">{error} <button type="button" onClick={() => void load(activeId, true, true)}>Tentar novamente</button></p>}
      <div className={`private-chat-layout ${activeId ? "has-thread" : ""}`}>
        <aside className="private-chat-sidebar">
          <label>
            <span className="sr-only">Pesquisar pessoas</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar nome, função ou ministério" />
          </label>
          <div className="private-chat-conversations">
            {filteredConversations.map((conversation) => (
              <button key={conversation.id} type="button" className={Number(conversation.id) === activeId ? "active" : ""} onClick={() => void openConversation(Number(conversation.id))}>
                <Avatar name={conversation.participante_nome} photo={conversation.participante_foto} online={Boolean(conversation.online)} />
                <div><strong>{conversation.participante_nome}</strong><small>{metadata(conversation.hierarquia, conversation.ministerio)}</small><p>{conversation.ultima_mensagem || "Conversa iniciada"}</p></div>
                {Number(conversation.nao_lidas) > 0 && <b>{conversation.nao_lidas}</b>}
              </button>
            ))}
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
          {loading ? (
            <p className="private-chat-empty">Carregando conversas…</p>
          ) : !activeConversation ? (
            <div className="private-chat-empty"><span>✉</span><strong>Escolha uma pessoa</strong><p>Comece uma conversa privada dentro desta comunidade.</p></div>
          ) : (
            <>
              <header>
                <button type="button" onClick={() => setActiveId(0)} aria-label="Voltar à lista">←</button>
                <Avatar name={activeConversation.participante_nome} photo={activeConversation.participante_foto} online={Boolean(activeConversation.online)} />
                <div><strong>{activeConversation.participante_nome}</strong><small>{metadata(activeConversation.hierarquia, activeConversation.ministerio)} · {activeConversation.online ? "Online" : "Offline"}</small></div>
              </header>
              <div className="private-chat-messages">
                {olderPageToken && <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Carregando…" : "Carregar mensagens antigas"}</button>}
                {data?.recentContentLoaded === false && (
                  <button
                    type="button"
                    className="private-chat-load-recent"
                    onClick={() => {
                      loadRecentRef.current = true;
                      void load(activeId, false, true);
                    }}
                  >
                    Carregar mensagens recentes do Google Drive
                  </button>
                )}
                {(data?.messages || []).map((message) => {
                  const own = Number(message.remetente_id) === Number(data?.currentUserId);
                  return <article key={message.fileId || message.id} className={own ? "own" : ""}>
                    <small>{message.remetente_nome} · {metadata(message.hierarquia, message.ministerio)}</small>
                    <p>{message.mensagem}</p>
                    <time>{formatDate(message.criado_em)}{own ? ` · ${message.lida_em ? "Visualizada" : "Enviada"}` : ""}</time>
                  </article>;
                })}
              </div>
              {sendError && <p role="alert" className="private-chat-send-error">{sendError}</p>}
              <form onSubmit={send}>
                <textarea aria-label="Mensagem" value={drafts[activeId] || ""} onChange={event => setDrafts(current => ({ ...current, [activeId]: event.target.value }))} name="message" rows={2} maxLength={2000} required placeholder="Escreva uma mensagem privada…" />
                <button disabled={sending}>{sending ? "Enviando…" : "Enviar"}</button>
              </form>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function Avatar({ name, photo, online = false }: { name: string; photo: string | null; online?: boolean }) {
  return <span className="private-chat-avatar">{photo ? <img loading="lazy" src={photo} alt="" /> : initials(name)}<i className={online ? "online" : ""} /></span>;
}
function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}
function metadata(hierarchy: string, ministry: string) {
  return ministry ? `${hierarchy} · ${ministry}` : hierarchy;
}
function formatDate(value: string) {
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`)); }
  catch { return value; }
}
async function readResult(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; }
  catch { return { error: "O servidor retornou uma resposta inválida." }; }
}
