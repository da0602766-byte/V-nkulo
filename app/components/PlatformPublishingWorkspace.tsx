"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import NativeImageUpload from "./NativeImageUpload";
import ResponsiveFeedImage from "./ResponsiveFeedImage";

type PlatformPost = {
  id: number;
  titulo: string;
  resumo: string;
  conteudo: string;
  categoria: string;
  status: "RASCUNHO" | "PUBLICADA";
  comentarios_habilitados: number;
  autor_nome: string | null;
  can_edit: number;
  criado_em: string;
  imagem_url?: string;
  imagem_alt?: string;
};

export default function PlatformPublishingWorkspace() {
  const [posts, setPosts] = useState<PlatformPost[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/publicacoes-plataforma", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        error?: string;
        publicacoes?: PlatformPost[];
      };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar.");
      }
      setPosts(result.publicacoes || []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPosts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPosts]);

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const saved = await submit(
      "/api/pilot/publicacoes-plataforma",
      "POST",
      new FormData(formElement),
      "Publicação institucional salva.",
    );
    if (saved) formElement.reset();
  }

  async function editPost(
    event: FormEvent<HTMLFormElement>,
    postId: number,
  ) {
    event.preventDefault();
    const saved = await submit(
      `/api/pilot/publicacoes-plataforma/${postId}`,
      "PATCH",
      new FormData(event.currentTarget),
      "Publicação institucional atualizada pelo autor.",
    );
    if (saved) setEditingId(null);
  }

  async function submit(
    url: string,
    method: "POST" | "PATCH",
    form: FormData,
    successMessage: string,
  ) {
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.get("titulo"),
          conteudo: form.get("conteudo"),
          categoria: form.get("categoria"),
          status: form.get("status"),
          comentariosHabilitados:
            form.get("comentariosHabilitados") === "on",
          imagemUrl: form.get("imagemUrl"),
          imagemAlt: form.get("imagemAlt"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível salvar.");
      }
      setMessage(successMessage);
      await loadPosts();
      return true;
    } catch (saveError) {
      setError((saveError as Error).message);
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function hidePost(id: number) {
    if (!window.confirm("Ocultar esta publicação sem apagar seu histórico?")) {
      return;
    }
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/pilot/publicacoes-plataforma/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "ARQUIVAR" }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível ocultar.");
      }
      setMessage("Publicação institucional ocultada.");
      await loadPosts();
    } catch (hideError) {
      setError((hideError as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="platform-publishing-workspace">
      <header>
        <div>
          <p className="pilot-kicker">FEED PÚBLICO GLOBAL</p>
          <h2>Publicações da plataforma</h2>
          <p>
            Notícias e atualizações aparecem como “VÍNKULO — Plataforma”. A IA
            continua sem publicação automática.
          </p>
        </div>
        <details className="platform-composer">
          <summary>+ Nova publicação</summary>
          <PostForm working={working} onSubmit={createPost} />
        </details>
      </header>

      {(message || error) && (
        <p
          className={`operations-feedback ${error ? "error" : ""}`}
          role="status"
        >
          {error || message}
        </p>
      )}

      {loading ? (
        <p className="platform-post-empty">Carregando publicações…</p>
      ) : posts.length ? (
        <div className="platform-post-list">
          {posts.map((post) => (
            <article key={post.id}>
              <header>
                <span>A+</span>
                <div>
                  <strong>VÍNKULO — Plataforma</strong>
                  <small>
                    {formatDate(post.criado_em)} · {post.autor_nome || "Autor"}
                  </small>
                </div>
                <i className={`status-pill status-${post.status.toLowerCase()}`}>
                  {post.status === "PUBLICADA" ? "Publicada" : "Rascunho"}
                </i>
              </header>
              <div>
                <small>{post.categoria.replaceAll("_", " ")}</small>
                <h3>{post.titulo}</h3>
                <p>{post.conteudo || post.resumo}</p>
              </div>
              {post.imagem_url && (
                <ResponsiveFeedImage
                  src={post.imagem_url}
                  alt={post.imagem_alt || post.titulo}
                />
              )}
              <footer>
                <span>
                  {post.comentarios_habilitados
                    ? "Comentários habilitados"
                    : "Comentários desativados"}
                </span>
                <div>
                  {Boolean(post.can_edit) && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingId(editingId === post.id ? null : post.id)
                      }
                    >
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => hidePost(post.id)}
                  >
                    Ocultar
                  </button>
                </div>
              </footer>
              {editingId === post.id && (
                <PostForm
                  post={post}
                  working={working}
                  onSubmit={(event) => editPost(event, post.id)}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="platform-post-empty">
          Nenhuma publicação institucional cadastrada.
        </p>
      )}
    </section>
  );
}

function PostForm({
  post,
  working,
  onSubmit,
  onCancel,
}: {
  post?: PlatformPost;
  working: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const [imageUrl, setImageUrl] = useState(post?.imagem_url || "");
  return (
    <form className="pilot-form platform-post-form" onSubmit={onSubmit}>
      <label>
        Título
        <input
          name="titulo"
          required
          maxLength={140}
          defaultValue={post?.titulo}
        />
      </label>
      <label>
        Categoria
        <select name="categoria" defaultValue={post?.categoria || "NOTICIA"}>
          <option value="NOTICIA">Notícia</option>
          <option value="ATUALIZACAO">Atualização</option>
          <option value="NOVIDADE">Novidade</option>
          <option value="SEGURANCA">Segurança</option>
          <option value="AVISO">Aviso</option>
        </select>
      </label>
      <label className="composer-wide">
        Conteúdo
        <textarea
          name="conteudo"
          required
          maxLength={3000}
          rows={5}
          defaultValue={post?.conteudo || post?.resumo}
        />
      </label>
      <div className="composer-wide">
        <NativeImageUpload
          label="Imagem da publicação (opcional)"
          value={imageUrl}
          purpose="post-image"
          onChange={setImageUrl}
        />
        <input type="hidden" name="imagemUrl" value={imageUrl} />
        <label>
          Descrição da imagem
          <input
            name="imagemAlt"
            maxLength={180}
            defaultValue={post?.imagem_alt || ""}
            placeholder="Descreva a imagem para acessibilidade"
          />
        </label>
      </div>
      <label>
        Estado
        <select name="status" defaultValue={post?.status || "RASCUNHO"}>
          <option value="RASCUNHO">Salvar rascunho</option>
          <option value="PUBLICADA">Publicar no feed</option>
        </select>
      </label>
      <label className="composer-share">
        <input
          type="checkbox"
          name="comentariosHabilitados"
          defaultChecked={post ? post.comentarios_habilitados !== 0 : true}
        />
        <span>Permitir comentários de contas ativas</span>
      </label>
      <div className="platform-post-form-actions">
        <button disabled={working}>
          {working ? "Salvando…" : post ? "Salvar alterações" : "Salvar"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recentemente";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
