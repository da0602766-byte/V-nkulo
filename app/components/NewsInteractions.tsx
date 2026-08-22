"use client";

import { FormEvent, useState } from "react";

type Reaction = { emoji: string; total: number; minha: boolean };
type Comment = { id: number; nome: string; texto: string; criado_em: string; pode_excluir: boolean };

function array<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  try { return typeof value === "string" ? JSON.parse(value) as T[] : []; } catch { return []; }
}

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível registrar a interação.");
}

export default function NewsInteractions({ notice, onChanged, notify }: { notice: Record<string, unknown>; onChanged: () => Promise<void>; notify: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const reactions = array<Reaction>(notice.reacoes);
  const comments = array<Comment>(notice.comentarios);

  async function react(emoji: string) {
    if (busy) return;
    setBusy(true);
    try {
      await request(`/api/avisos/${notice.id}/interacoes`, { method: "POST", body: JSON.stringify({ tipo: "reacao", emoji }) });
      await onChanged();
    } catch (error) { notify((error as Error).message); } finally { setBusy(false); }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await request(`/api/avisos/${notice.id}/interacoes`, { method: "POST", body: JSON.stringify({ tipo: "comentario", texto: form.get("texto") }) });
      event.currentTarget.reset();
      await onChanged();
    } catch (error) { notify((error as Error).message); } finally { setBusy(false); }
  }

  async function remove(commentId: number) {
    if (!window.confirm("Excluir este comentário?")) return;
    setBusy(true);
    try {
      await request(`/api/avisos/${notice.id}/comentarios/${commentId}`, { method: "DELETE" });
      await onChanged();
    } catch (error) { notify((error as Error).message); } finally { setBusy(false); }
  }

  return <div className="news-interactions">
    <div className="reaction-bar" aria-label="Reações">
      {reactions.map((reaction) => <button type="button" disabled={busy} className={reaction.minha ? "selected" : ""} key={reaction.emoji} onClick={() => react(reaction.emoji)}><span>{reaction.emoji}</span>{reaction.total > 0 && <b>{reaction.total}</b>}</button>)}
    </div>
    <details className="comments-panel">
      <summary>Comentários {comments.length ? `(${comments.length})` : ""}</summary>
      <div className="comments-list">{comments.map((commentItem) => <article key={commentItem.id}><div><strong>{commentItem.nome}</strong><time>{new Date(commentItem.criado_em).toLocaleDateString("pt-BR")}</time></div><p>{commentItem.texto}</p>{commentItem.pode_excluir && <button type="button" onClick={() => remove(commentItem.id)}>Excluir</button>}</article>)}{!comments.length && <p className="empty-inline">Seja a primeira pessoa a comentar.</p>}</div>
      <form className="comment-form" onSubmit={comment}><input name="texto" maxLength={500} required placeholder="Escreva um comentário" /><button disabled={busy}>Enviar</button></form>
    </details>
  </div>;
}
