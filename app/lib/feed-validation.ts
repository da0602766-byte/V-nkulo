const CATEGORIES = new Set([
  "COMUNIDADE",
  "CULTO",
  "EVENTO",
  "TESTEMUNHO",
  "ACAO_SOCIAL",
  "JUVENTUDE",
  "AVISO",
  "NOTICIA",
  "ATUALIZACAO",
  "NOVIDADE",
  "SEGURANCA",
]);
const VISIBILITIES = new Set(["COMUNIDADE", "PLATAFORMA"]);
const STATUSES = new Set(["RASCUNHO", "PUBLICADA"]);

export function parseFeedPostPayload(payload: unknown) {
  const body = (payload && typeof payload === "object"
    ? payload
    : {}) as Record<string, unknown>;
  const titulo = clean(body.titulo, 140);
  const conteudo = clean(body.conteudo, 3000);
  const resumo = clean(body.resumo, 320) || conteudo.slice(0, 320);
  const categoria =
    clean(body.categoria, 40).toUpperCase() || "COMUNIDADE";
  const visibilidade =
    clean(body.visibilidade, 30).toUpperCase() || "COMUNIDADE";
  const status = clean(body.status, 30).toUpperCase() || "RASCUNHO";
  const comentariosHabilitados = body.comentariosHabilitados !== false;
  const imagemUrl = safePostImage(body.imagemUrl);
  const imagemAlt = clean(body.imagemAlt, 180);
  const links = parsePostLinks(body.links);

  if (!titulo || !conteudo) {
    return { error: "Título e conteúdo são obrigatórios." } as const;
  }
  if (
    !CATEGORIES.has(categoria) ||
    !VISIBILITIES.has(visibilidade) ||
    !STATUSES.has(status)
  ) {
    return { error: "Categoria, visibilidade ou status inválido." } as const;
  }
  return {
    titulo,
    conteudo,
    resumo,
    categoria,
    visibilidade,
    status,
    comentariosHabilitados,
    imagemUrl,
    imagemThumbnailUrl: imagemUrl,
    imagemAlt,
    imagemWidth: 0,
    imagemHeight: 0,
    links,
    linksJson: JSON.stringify(links),
  } as const;
}

function parsePostLinks(value: unknown) {
  const candidates = Array.isArray(value)
    ? value
    : String(value ?? "").split(/\r?\n/);
  const unique = new Set<string>();
  for (const entry of candidates) {
    const text = clean(entry, 800);
    if (!text) continue;
    try {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      unique.add(url.toString());
    } catch {
      continue;
    }
    if (unique.size >= 5) break;
  }
  return [...unique];
}

export function parsePublicCommentPayload(payload: unknown) {
  const body = (payload && typeof payload === "object"
    ? payload
    : {}) as Record<string, unknown>;
  const texto = clean(body.texto, 600);
  if (!texto) {
    return { error: "Digite um comentário." } as const;
  }
  return {
    texto,
    perfilVisivel: body.perfilVisivel === true,
  } as const;
}

export function parseJoinRequestMessage(value: unknown) {
  return clean(value, 500);
}

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safePostImage(value: unknown) {
  const candidate = clean(value, 900);
  if (!candidate) return "";
  return /^\/api\/pilot\/uploads\/images\/post-image\/\d+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(
    candidate,
  )
    ? candidate
    : "";
}
