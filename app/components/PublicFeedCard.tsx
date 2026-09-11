import Link from "./StableLink";
import type { PublicFeedPost } from "../lib/pilot-data";
import PublicPostInteractions from "./PublicPostInteractions";
import ResponsiveFeedImage from "./ResponsiveFeedImage";

export default function PublicFeedCard({
  post,
  compact = false,
}: {
  post: PublicFeedPost;
  compact?: boolean;
}) {
  return (
    <article
      className={`social-feed-card ${compact ? "compact" : ""}`}
      data-editor-key={`feed-publico-post-${post.id}`}
    >
      <header data-editor-key={`feed-publico-post-${post.id}-autor`}>
        {post.isPlatform ? (
          <span
            className="social-community-avatar platform-avatar"
            aria-label="VÍNKULO — Plataforma"
          >
            A+
          </span>
        ) : (
          <Link
            className="social-community-avatar"
            href={`/comunidades/${post.comunidadeSlug}`}
            aria-label={`Abrir ${post.comunidadeNome}`}
          >
            {post.comunidadeNome.slice(0, 1)}
          </Link>
        )}
        <div>
          {post.isPlatform ? (
            <strong>VÍNKULO — Plataforma</strong>
          ) : (
            <Link href={`/comunidades/${post.comunidadeSlug}`}>
              {post.comunidadeNome}
            </Link>
          )}
          <span>
            {formatRelativeDate(post.criadoEm)} ·{" "}
            {post.isPlatform
              ? "informação oficial da plataforma"
              : "compartilhado publicamente"}
          </span>
        </div>
        <span className="social-post-category">
          {post.categoria.replaceAll("_", " ")}
        </span>
      </header>
      <div
        className="social-post-copy"
        data-editor-key={`feed-publico-post-${post.id}-conteudo`}
      >
        <h2 data-editor-key={`feed-publico-post-${post.id}-titulo`}>
          {post.titulo}
        </h2>
        <p data-editor-key={`feed-publico-post-${post.id}-texto`}>
          {post.conteudo || post.resumo}
        </p>
      </div>
      {!compact && post.imagemUrl ? (
        <ResponsiveFeedImage
          src={post.imagemUrl}
          thumbnail={post.imagemThumbnailUrl}
          alt={post.imagemAlt || post.titulo}
          width={post.imagemWidth}
          height={post.imagemHeight}
        />
      ) : null}
      <footer>
        <span>
          {post.isPlatform
            ? "Publicação institucional"
            : "Publicação da comunidade"}
        </span>
        {!post.isPlatform && (
          <Link href={`/comunidades/${post.comunidadeSlug}`}>
            Conhecer comunidade →
          </Link>
        )}
      </footer>
      <PublicPostInteractions
        postId={post.id}
        enabled={post.comentariosHabilitados}
        initialCount={post.totalComentarios}
      />
    </article>
  );
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recentemente";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
