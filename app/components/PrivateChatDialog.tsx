"use client";

import { FormEvent, useEffect, useState } from "react";

type Conversation = {
  id: number;
  participante_id: number;
  participante_nome: string;
  participante_foto: string | null;
  hierarquia: string;
  ministerio: string;
};
type Message = {
  id: number;
  remetente_id: number;
  mensagem: string;
  criado_em: string;
};
type ChatData = {
  conversations: Conversation[];
  messages: Message[];
  currentUserId: number;
};

export default function PrivateChatDialog({
  targetUserId,
  conversationId,
  onClose,
}: {
  targetUserId?: number | null;
  conversationId?: number | null;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState(Number(conversationId || 0));
  const [data, setData] = useState<ChatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        let id = Number(conversationId || 0);
        if (!id && targetUserId) {
          const openResponse = await fetch("/api/pilot/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetUserId }),
          });
          const opened = await readResult(openResponse) as { conversationId?: number; error?: string };
          if (!openResponse.ok || !opened.conversationId) {
            throw new Error(opened.error || "Não foi possível abrir a conversa.");
          }
          id = opened.conversationId;
        }
        if (!id) throw new Error("Conversa não encontrada.");
        const response = await fetch(`/api/pilot/chat?conversation=${id}`, { cache: "no-store" });
        const result = await readResult(response) as ChatData & { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar a conversa.");
        if (!active) return;
        setActiveId(id);
        setData(result);
        await fetch("/api/pilot/chat", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: id }),
        });
      } catch (loadError) {
        if (active) setError((loadError as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [conversationId, targetUserId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") || "").trim();
    const conversation = data?.conversations.find((item) => Number(item.id) === activeId);
    if (!message || !conversation) return;
    setSending(true);
    setError("");
    const response = await fetch("/api/pilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: conversation.participante_id, message }),
    });
    const result = await readResult(response) as { error?: string; message?: Message };
    if (!response.ok) {
      setError(result.error || "Não foi possível enviar a mensagem.");
      setSending(false);
      return;
    }
    form.reset();
    if (result.message) {
      setData((current) => current ? { ...current, messages: [...current.messages, result.message!] } : current);
    }
    setSending(false);
  }

  const conversation = data?.conversations.find((item) => Number(item.id) === activeId);
  function openMessageCenter() {
    window.location.assign(`/painel?view=mensagens&conversation=${activeId}`);
  }

  return (
    <div className="private-chat-dialog-backdrop" role="presentation">
      <section
        className={`private-chat-dialog ${minimized ? "minimized" : ""} ${maximized ? "maximized" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-label="Conversa privada"
      >
        <header>
          <div>
            <small>CONVERSA PRIVADA</small>
            <strong>{conversation?.participante_nome || "Mensagem"}</strong>
            {conversation && <span>{[conversation.hierarquia, conversation.ministerio].filter(Boolean).join(" · ")}</span>}
          </div>
          <div className="private-chat-window-actions">
            <button type="button" onClick={openMessageCenter} aria-label="Abrir central de mensagens" title="Abrir central de mensagens">↗</button>
            <button type="button" onClick={() => setMaximized((value) => !value)} aria-label={maximized ? "Restaurar janela" : "Maximizar janela"} title={maximized ? "Restaurar" : "Maximizar"}>{maximized ? "↙" : "□"}</button>
            <button type="button" onClick={() => setMinimized((value) => !value)} aria-label={minimized ? "Restaurar conversa" : "Minimizar conversa"} title={minimized ? "Restaurar" : "Minimizar"}>{minimized ? "▣" : "−"}</button>
            <button type="button" onClick={onClose} aria-label="Fechar conversa" title="Fechar">×</button>
          </div>
        </header>
        {!minimized && (loading ? (
          <p className="private-chat-dialog-empty">Carregando conversa…</p>
        ) : error && !conversation ? (
          <p className="private-chat-dialog-empty error" role="alert">{error}</p>
        ) : (
          <>
            <div className="private-chat-dialog-messages" aria-live="polite">
              {!data?.messages.length && <p>Nenhuma mensagem ainda. Escreva para iniciar.</p>}
              {(data?.messages || []).map((message) => (
                <article key={message.id} className={Number(message.remetente_id) === Number(data?.currentUserId) ? "own" : ""}>
                  <p>{message.mensagem}</p>
                  <time>{formatDate(message.criado_em)}</time>
                </article>
              ))}
            </div>
            {error && <p className="private-chat-dialog-error" role="alert">{error}</p>}
            <form onSubmit={send}>
              <label>
                <span className="sr-only">Mensagem</span>
                <textarea name="message" rows={2} maxLength={2000} required placeholder="Escreva sua mensagem…" />
              </label>
              <button type="submit" disabled={sending || !conversation}>{sending ? "Enviando…" : "Enviar"}</button>
            </form>
          </>
        ))}
      </section>
    </div>
  );
}

async function readResult(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; }
  catch { return { error: "O servidor retornou uma resposta inválida." }; }
}
function formatDate(value: string) {
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(`${value.replace(" ", "T")}Z`)); }
  catch { return value; }
}
