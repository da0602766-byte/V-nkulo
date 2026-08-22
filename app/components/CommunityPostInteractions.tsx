"use client";

import { FormEvent, useCallback, useState } from "react";
import VerifiedOwnerName from "./VerifiedOwnerName";

type Comment = {
  id: number;
  texto: string;
  criadoEm: string;
  autor: string;
  foto: string;
  papel: string;
  ownerVerified?: boolean;
};

export default function CommunityPostInteractions({ postId, initialCount = 0 }: { postId: number; initialCount?: number }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/pilot/publicacoes/${postId}/comentarios`, { cache: "no-store" });
      const payload = await response.json() as { comentarios?: Comment[]; comentariosHabilitados?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os comentários.");
      setComments(payload.comentarios || []);
      setEnabled(Boolean(payload.comentariosHabilitados));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/pilot/publicacoes/${postId}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: data.get("texto"), perfilVisivel: true }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível comentar.");
      form.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="community-comments">
      <button type="button" className="community-comments-toggle" onClick={() => {
        const nextOpen = !open;
        setOpen(nextOpen);
        if (nextOpen) void load();
      }} aria-expanded={open}>
        <span>Comentários</span>
        <b>{open ? comments.length : initialCount}</b>
        <i aria-hidden="true">{open ? "▲" : "▼"}</i>
      </button>
      {open && (
        <div className="community-comments-panel">
          {loading ? <p>Carregando comentários…</p> : comments.map((comment) => (
            <article key={comment.id}>
              {comment.foto ? <img src={comment.foto} alt="" /> : <span>{initials(comment.autor)}</span>}
              <div className="community-comment-body"><header><VerifiedOwnerName name={comment.autor} verified={Boolean(comment.ownerVerified)} /><small>{comment.papel} · {formatDate(comment.criadoEm)}</small></header><p>{comment.texto}</p></div>
            </article>
          ))}
          {!loading && !comments.length && <p>Seja a primeira pessoa a comentar.</p>}
          {enabled ? (
            <form onSubmit={submit}>
              <label><span className="sr-only">Comentário</span><input name="texto" required minLength={2} maxLength={1000} placeholder="Escreva um comentário…" /></label>
              <button
                type="submit"
                disabled={sending}
                aria-label={sending ? "Enviando comentário" : "Enviar comentário"}
                title={sending ? "Enviando comentário" : "Enviar comentário"}
              >
                <span aria-hidden="true" className="community-comment-send-icon">➤</span>
              </button>
            </form>
          ) : <p>Comentários desativados pelo autor.</p>}
          {error && <p className="community-comments-error" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}

function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
