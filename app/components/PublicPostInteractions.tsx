"use client";

import Link from "./StableLink";
import { FormEvent, useState } from "react";
import VerifiedOwnerName from "./VerifiedOwnerName";

type CommentItem = {
  id: number;
  texto: string;
  criadoEm: string;
  autor: string;
  papel: string | null;
  email: string | null;
  isOwner: boolean;
  ownerVerified?: boolean;
};

export default function PublicPostInteractions({
  postId,
  enabled,
  initialCount,
}: {
  postId: number;
  enabled: boolean;
  initialCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [canComment, setCanComment] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState(initialCount);

  async function toggleComments() {
    const next = !open;
    setOpen(next);
    if (!next || comments.length || loading) return;
    await loadComments();
  }

  async function loadComments() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/publicacoes/${postId}/comentarios`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        error?: string;
        comentarios?: CommentItem[];
        canComment?: boolean;
        loginRequired?: boolean;
      };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar.");
      }
      setComments(result.comentarios || []);
      setCount((result.comentarios || []).length);
      setCanComment(Boolean(result.canComment));
      setLoginRequired(Boolean(result.loginRequired));
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setWorking(true);
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/publicacoes/${postId}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: form.get("texto"),
          perfilVisivel: form.get("perfilVisivel") === "on",
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível comentar.");
      }
      formElement.reset();
      await loadComments();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="public-post-interactions">
      <button
        type="button"
        className="comments-toggle"
        onClick={toggleComments}
        aria-expanded={open}
      >
        <span aria-hidden="true">○</span>
        {enabled
          ? `${count} ${count === 1 ? "comentário" : "comentários"}`
          : "Comentários desativados"}
      </button>
      {open && enabled && (
        <div className="public-comments-panel">
          {loading ? (
            <p className="comments-message">Carregando comentários…</p>
          ) : (
            <>
              <div className="public-comments-list">
                {comments.map((comment) => (
                  <article key={comment.id}>
                    <span>{comment.autor.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <header>
                        <VerifiedOwnerName name={comment.autor} verified={Boolean(comment.ownerVerified)} />
                        {comment.papel && <small>{comment.papel}</small>}
                        <time dateTime={comment.criadoEm}>
                          {formatCommentDate(comment.criadoEm)}
                        </time>
                      </header>
                      <p>{comment.texto}</p>
                      {comment.email && (
                        <small className="superadmin-profile-detail">
                          Perfil básico: {comment.email}
                        </small>
                      )}
                    </div>
                  </article>
                ))}
                {!comments.length && (
                  <p className="comments-message">
                    Seja a primeira pessoa a comentar.
                  </p>
                )}
              </div>
              {canComment ? (
                <form className="public-comment-form" onSubmit={submitComment}>
                  <label>
                    Comentário
                    <textarea
                      name="texto"
                      required
                      maxLength={600}
                      rows={3}
                      placeholder="Escreva com respeito e clareza"
                    />
                  </label>
                  <label className="comment-profile-choice">
                    <input type="checkbox" name="perfilVisivel" />
                    <span>Mostrar meu nome e perfil neste comentário</span>
                  </label>
                  <button disabled={working}>
                    {working ? "Enviando…" : "Comentar"}
                  </button>
                </form>
              ) : loginRequired ? (
                <p className="comments-message">
                  <Link href="/login">Entre na plataforma</Link> para comentar.
                </p>
              ) : null}
            </>
          )}
          {error && (
            <p className="comments-message error" role="status">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function formatCommentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
