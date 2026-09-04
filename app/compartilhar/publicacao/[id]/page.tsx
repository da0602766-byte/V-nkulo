import { getSessionUser } from "../../../lib/local-auth";
import { getActiveTenantContext } from "../../../lib/tenant";
import { canReadPost } from "../../../lib/media-access-policy.mjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getD1 } from "../../../../db";
import PublicHeader from "../../../components/PublicHeader";

const PRODUCTION_ORIGIN = "https://adote-gestao.da0602766.chatgpt.site";

type SharedPost = {
  id: number;
  titulo: string;
  conteudo: string;
  resumo: string;
  categoria: string;
  imagem_url: string | null;
  imagem_alt: string | null;
  links_json: string | null;
  criado_em: string;
  comunidade_nome: string;
};

export const dynamic = "force-dynamic";

async function getSharedPost(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const post = await getD1().prepare(
    `SELECT p.*, c.status AS community_status, c.feed_publico_habilitado, c.selo_pastoral_status, p.id, p.titulo, p.conteudo, p.resumo, p.categoria,
      p.imagem_url, p.imagem_alt, p.links_json, p.criado_em,
      c.nome AS comunidade_nome
     FROM publicacoes_piloto p
     JOIN comunidades c ON c.id = p.comunidade_id
     WHERE p.id = ? AND p.status = 'PUBLICADA'
     LIMIT 1`,
  ).bind(id).first<SharedPost & { visibilidade: string }>();
  if (!post) return null;
  const user = await getSessionUser();
  const tenant = user?.ativo ? await getActiveTenantContext(user) : null;
  return await canReadPost(getD1(), post, user?.ativo ? user : null, tenant?.context) ? post : null;
}

function absoluteUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value, PRODUCTION_ORIGIN).toString();
  } catch {
    return null;
  }
}

function excerpt(post: SharedPost) {
  return String(post.conteudo || post.resumo || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function postLinks(value: string | null) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((link): link is string => typeof link === "string" && /^https:\/\//i.test(link)).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getSharedPost(Number(id));
  if (!post) return { title: "Publicação não encontrada | VÍNKULO", robots: { index: false, follow: false } };
  if (post.visibilidade !== "PLATAFORMA") return { title: "Publicação privada | VÍNKULO", robots: { index: false, follow: false } };
  const description = excerpt(post);
  const image = absoluteUrl(post.imagem_url);
  const pageUrl = `${PRODUCTION_ORIGIN}/compartilhar/publicacao/${post.id}`;
  return {
    title: `${post.titulo} | ${post.comunidade_nome}`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "article",
      url: pageUrl,
      title: post.titulo,
      description,
      siteName: "VÍNKULO",
      images: image ? [{ url: image, alt: post.imagem_alt || post.titulo }] : [],
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: post.titulo,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function SharedPublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getSharedPost(Number(id));
  if (!post) notFound();
  const image = absoluteUrl(post.imagem_url);
  const links = postLinks(post.links_json);
  return (
    <main className="shared-publication-page">
      <PublicHeader />
      <article className="shared-publication-card">
        <header>
          <div><p className="pilot-kicker">PUBLICAÇÃO COMPARTILHADA</p><span>{post.comunidade_nome}</span></div>
          <small>{post.categoria.replaceAll("_", " ")}</small>
        </header>
        <div className="shared-publication-copy">
          <h1>{post.titulo}</h1>
          <p>{post.conteudo || post.resumo}</p>
          {links.length > 0 && <nav aria-label="Links da publicação">{links.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">Abrir link ↗</a>)}</nav>}
        </div>
        {image && <img loading="lazy" src={image} alt={post.imagem_alt || post.titulo} />}
        <footer><span>Compartilhado pelo VÍNKULO</span><a href="/login">Acessar a comunidade</a></footer>
      </article>
    </main>
  );
}
