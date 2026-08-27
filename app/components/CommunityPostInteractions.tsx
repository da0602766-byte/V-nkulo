"use client";

import { FormEvent, KeyboardEvent, useCallback, useRef, useState } from "react";
import VerifiedOwnerName from "./VerifiedOwnerName";

type Comment = {
  id: number;
  texto: string;
  criadoEm: string;
  autor: string;
  foto: string;
  papel: string;
  ownerVerified?: boolean;
  isOwner?: boolean;
};

type FeedComment = Comment & { pending?: boolean };

const MAX_LENGTH = 1000;
const COUNTER_FROM = 900;
const VISIBLE_STEP = 5;
const FIELD_MAX_HEIGHT = 132;
const HIGHLIGHTED_ROLES = ["Administrador", "Proprietário", "Pastoral", "Líder"];

export default function CommunityPostInteractions({
  postId,
  initialCount = 0,
  currentUserName = "",
}: {
  postId: number;
  initialCount?: number;
  currentUserName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Enquanto o painel nunca abriu, o contador do feed é a única fonte; depois
  // disso a lista local manda, inclusive nos comentários recém-enviados.
  const total = loaded ? comments.length : initialCount;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/pilot/publicacoes/${postId}/comentarios`, { cache: "no-store" });
      const payload = await response.json() as { comentarios?: Comment[]; comentariosHabilitados?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os comentários.");
      setComments(payload.comentarios || []);
      setEnabled(Boolean(payload.comentariosHabilitados));
      setLoaded(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [postId]);

  function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !loaded) void load();
  }

  function resizeField() {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, FIELD_MAX_HEIGHT)}px`;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const texto = text.trim();
    if (sending || texto.length < 2) return;
    // Mostra o comentário na hora e reconcilia com o servidor depois, para que
    // ele não desapareça durante a ida e volta da rede.
    const draft: FeedComment = {
      id: -Date.now(),
      texto,
      criadoEm: new Date().toISOString(),
      autor: currentUserName || "Você",
      foto: "",
      papel: "",
      isOwner: true,
      pending: true,
    };
    setComments((current) => [...current, draft]);
    setText("");
    setShowAll(true);
    setSending(true);
    setError("");
    if (fieldRef.current) fieldRef.current.style.height = "auto";
    try {
      const response = await fetch(`/api/pilot/publicacoes/${postId}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, perfilVisivel: true }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível comentar.");
      await load(true);
    } catch (cause) {
      setComments((current) => current.filter((item) => item.id !== draft.id));
      setText(texto);
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }

  const hiddenCount = showAll ? 0 : Math.max(0, comments.length - VISIBLE_STEP);
  const visible = hiddenCount ? comments.slice(hiddenCount) : comments;
  const remaining = MAX_LENGTH - text.length;
  const canSend = !sending && text.trim().length >= 2;

  return (
    <section className="community-comments">
      <button type="button" className="community-comments-toggle" onClick={toggle} aria-expanded={open}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 11.7a8 8 0 0 1-8.6 8 8.7 8.7 0 0 1-3.3-.7L3.5 20.5l1.7-4.9a8 8 0 0 1-1.7-4.9 8 8 0 0 1 8.5-7.9 8 8 0 0 1 8.5 8Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{total ? `${total} ${total === 1 ? "comentário" : "comentários"}` : "Comentar"}</span>
        <i aria-hidden="true">▾</i>
      </button>
      {open && (
        <div className="community-comments-panel">
          {error && <p className="community-comments-error" role="alert">{error}</p>}
          {loading ? (
            <div className="community-comments-skeleton" role="status" aria-label="Carregando comentários">
              <span /><span />
            </div>
          ) : (
            <>
              {hiddenCount > 0 && (
                <button type="button" className="community-comments-more" onClick={() => setShowAll(true)}>
                  Ver {hiddenCount} {hiddenCount === 1 ? "comentário anterior" : "comentários anteriores"}
                </button>
              )}
              <div className="community-comments-list" aria-live="polite">
                {visible.map((comment) => (
                  <article key={comment.id} className="community-comment" data-pending={comment.pending ? "true" : undefined}>
                    {comment.foto
                      ? <img src={comment.foto} alt="" />
                      : <span aria-hidden="true">{initials(comment.autor)}</span>}
                    <div className="community-comment-body">
                      <header>
                        <VerifiedOwnerName className="community-comment-name" name={comment.autor} verified={Boolean(comment.ownerVerified)} />
                        {comment.papel && (
                          <span className="community-comment-role" data-highlight={HIGHLIGHTED_ROLES.includes(comment.papel) ? "true" : undefined}>
                            {comment.papel}
                          </span>
                        )}
                        <span className="community-comment-time" title={fullDate(comment.criadoEm)}>
                          {comment.pending ? "enviando…" : relativeDate(comment.criadoEm)}
                        </span>
                      </header>
                      <p>{comment.texto}</p>
                    </div>
                  </article>
                ))}
              </div>
              {!comments.length && <p className="community-comments-empty">Seja a primeira pessoa a comentar.</p>}
            </>
          )}
          {enabled ? (
            <form className="community-comment-form" onSubmit={submit}>
              <span className="community-comment-form-avatar" aria-hidden="true">{initials(currentUserName || "Você")}</span>
              <label>
                <span className="sr-only">Comentário</span>
                <textarea
                  ref={fieldRef}
                  name="texto"
                  rows={1}
                  required
                  minLength={2}
                  maxLength={MAX_LENGTH}
                  placeholder="Escreva um comentário…"
                  value={text}
                  onChange={(event) => { setText(event.target.value); resizeField(); }}
                  onKeyDown={handleKeyDown}
                />
              </label>
              <button
                type="submit"
                disabled={!canSend}
                aria-label={sending ? "Enviando comentário" : "Enviar comentário"}
                title={sending ? "Enviando comentário" : "Enviar comentário"}
              >
                <span aria-hidden="true" className="community-comment-send-icon">↑</span>
              </button>
            </form>
          ) : <p className="community-comments-empty">Comentários desativados pelo autor.</p>}
          {text.length >= COUNTER_FROM && (
            <small className="community-comment-counter" aria-live="polite">
              {remaining} {remaining === 1 ? "caractere restante" : "caracteres restantes"}
            </small>
          )}
        </div>
      )}
    </section>
  );
}

function initials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]).join("").toUpperCase() || "?";
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fullDate(value: string) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(date) : "";
}

function relativeDate(value: string) {
  const date = parseDate(value);
  if (!date) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `há ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
