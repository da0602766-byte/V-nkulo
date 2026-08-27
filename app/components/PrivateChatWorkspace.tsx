"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

  async function load(conversationId = activeId, quiet = false) {
    if (!quiet) setLoading(true);
    const latestId = quiet
      ? Math.max(0, ...(data?.messages || []).filter((item) => item.id > 0).map((item) => item.id))
      : 0;
    const query = quiet && conversationId > 0
      ? `?conversation=${conversationId}&messagesOnly=1&after=${latestId}`
      : conversationId > 0
        ? `?conversation=${conversationId}`
        : "";
    try {
      const response = await fetch(`/api/pilot/chat${query}`, { cache: "no-store" });
      const result = await readResult(response) as ChatData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as mensagens.");
      if (quiet && conversationId > 0) {
        setData((current) => current ? {
          ...current,
          messages: mergeMessages(current.messages, result.messages || []),
        } : current);
      } else {
        setData(result);
      }
      setError("");
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
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void load(initialConversation), 0);
    const timer = window.setInterval(() => {
      if (activeId > 0 && document.visibilityState === "visible") void load(activeId, true);
    }, 4_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function openConversation(conversationId: number) {
    setActiveId(conversationId);
    const address = new URL(window.location.href);
    address.searchParams.set("view", "mensagens");
    address.searchParams.set("conversation", String(conversationId));
    window.history.replaceState(window.history.state, "", address);
    await load(conversationId);
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
    const temporaryId = -Date.now();
    const temporaryMessage: Message = {
      id: temporaryId,
      remetente_id: Number(data?.currentUserId || 0),
      remetente_nome: "Você",
      mensagem: message,
      hierarquia: "",
      ministerio: "",
      criado_em: new Date().toISOString(),
      lida_em: null,
    };
    setData((current) =>
      current ? { ...current, messages: [...current.messages, temporaryMessage] } : current,
    );
    form.reset();
    setSending(true);
    const response = await fetch("/api/pilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: conversation.participante_id, message }),
    });
    const result = await readResult(response) as { error?: string; message?: Message };
    setSending(false);
    if (!response.ok) {
      setData((current) =>
        current
          ? { ...current, messages: current.messages.filter((item) => item.id !== temporaryId) }
          : current,
      );
      setError(result.error || "Não foi possível enviar a mensagem.");
      return;
    }
    if (result.message) {
      setData((current) => current ? {
        ...current,
        messages: current.messages.map((item) => item.id === temporaryId ? result.message! : item),
      } : current);
    }
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
          <p>Somente você e a outra pessoa podem acessar cada conversa.</p>
        </div>
        <span>Conversas do mês atual</span>
      </header>
      {error && <p className="pilot-form-message" role="alert">{error}</p>}
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
                {(data?.messages || []).map((message) => {
                  const own = Number(message.remetente_id) === Number(data?.currentUserId);
                  return <article key={message.id} className={own ? "own" : ""}>
                    <small>{message.remetente_nome} · {metadata(message.hierarquia, message.ministerio)}</small>
                    <p>{message.mensagem}</p>
                    <time>{formatDate(message.criado_em)}{own ? ` · ${message.lida_em ? "Visualizada" : "Enviada"}` : ""}</time>
                  </article>;
                })}
              </div>
              <form onSubmit={send}>
                <textarea name="message" rows={2} maxLength={2000} required placeholder="Escreva uma mensagem privada…" />
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
  return <span className="private-chat-avatar">{photo ? <img src={photo} alt="" /> : initials(name)}<i className={online ? "online" : ""} /></span>;
}
function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}
function metadata(hierarchy: string, ministry: string) {
  return ministry ? `${hierarchy} · ${ministry}` : hierarchy;
}
function formatDate(value: string) {
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(`${value.replace(" ", "T")}Z`)); }
  catch { return value; }
}
async function readResult(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; }
  catch { return { error: "O servidor retornou uma resposta inválida." }; }
}
function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
