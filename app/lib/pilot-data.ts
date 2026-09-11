import { getD1 } from "../../db";
import {
  decodeFeedCursor,
  normalizeFeedLimit,
  pageFeedRows,
} from "./feed-cursor";
import { parseCommunityTheme } from "./community-theme";

export type PublicCommunity = {
  id: number;
  nome: string;
  slug: string;
  descricao: string;
  cidade: string;
  ambienteDemo: boolean;
  feedPublicoHabilitado: boolean;
  publicacoesPublicas: number;
  eventosPublicos: number;
  logoUrl: string;
  bannerUrl: string;
};

export type PublicCommunityEvent = {
  id: number;
  titulo: string;
  descricao: string;
  categoria: string;
  iniciaEm: string;
  terminaEm: string | null;
  local: string;
  comunidadeNome?: string;
  comunidadeSlug?: string;
};

export type PublicCommunityCell = {
  id: number;
  nome: string;
  descricao: string;
  endereco: string;
  dias: string[];
  lider: string;
  membros: number;
  proximoEncontro: string | null;
};

export type PublicFeedPost = {
  id: number;
  titulo: string;
  resumo: string;
  conteudo: string;
  categoria: string;
  origem: string;
  criado_por?: number | null;
  comentarios_habilitados?: number;
  can_edit?: number;
  can_hide?: number;
  criadoEm: string;
  comunidadeId: number | null;
  comunidadeNome: string;
  comunidadeSlug: string;
  isPlatform: boolean;
  comentariosHabilitados: boolean;
  totalComentarios: number;
  imagemUrl: string;
  imagemThumbnailUrl: string;
  imagemAlt: string;
  imagemWidth: number;
  imagemHeight: number;
};

export type PublicFeedPage = {
  posts: PublicFeedPost[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CommunityJoinState = {
  isMember: boolean;
  requestStatus: string | null;
};

export type PilotFeedItem = {
  id: number;
  titulo: string;
  resumo: string;
  conteudo: string;
  categoria: string;
  visibilidade: "COMUNIDADE" | "PLATAFORMA";
  status: "RASCUNHO" | "PUBLICADA";
  origem: string;
  criado_em: string;
  atualizado_em: string;
  links_json?: string;
  autor_nome?: string | null;
};

export type PilotFeatureState = {
  networkModuleEnabled: boolean;
  affiliateCreationEnabled: boolean;
  paymentsEnabled: boolean;
  aiEditorialEnabled: boolean;
  aiAutoPublishEnabled: boolean;
  aiEditorialMode: string;
};

type CommunityRow = {
  id: number;
  nome: string;
  slug: string;
  descricao_publica: string;
  cidade_publica: string;
  ambiente_demo: number;
  feed_publico_habilitado: number;
  publicacoes_publicas: number;
  eventos_publicos: number;
  theme_json: string | null;
};

const COMMUNITY_SELECT = `SELECT c.id, c.nome, c.slug, c.descricao_publica,
  c.cidade_publica, c.ambiente_demo, c.feed_publico_habilitado,
  theme.valor AS theme_json,
  (SELECT COUNT(*) FROM publicacoes_piloto p
    WHERE p.comunidade_id = c.id
      AND p.status = 'PUBLICADA'
      AND p.visibilidade = 'PLATAFORMA') AS publicacoes_publicas,
  (SELECT COUNT(*) FROM eventos_comunidade e
    WHERE e.comunidade_id = c.id
      AND e.publico = 1
      AND e.status = 'PUBLICADO'
      AND julianday(e.inicia_em) >= julianday('now', '-1 day')) AS eventos_publicos
  FROM comunidades c
  LEFT JOIN configuracoes theme
    ON theme.chave = 'community_theme:' || c.id`;

export async function getPublicCommunities(
  search = "",
): Promise<PublicCommunity[]> {
  const normalized = search.trim().slice(0, 80);
  const statement = normalized
    ? getD1()
        .prepare(
          `${COMMUNITY_SELECT}
          WHERE c.status = 'ATIVA'
            AND (
              lower(c.nome) LIKE '%' || lower(?) || '%'
              OR lower(c.cidade_publica) LIKE '%' || lower(?) || '%'
              OR lower(c.descricao_publica) LIKE '%' || lower(?) || '%'
            )
          ORDER BY c.nome`,
        )
        .bind(normalized, normalized, normalized)
    : getD1().prepare(
        `${COMMUNITY_SELECT}
        WHERE c.status = 'ATIVA'
        ORDER BY c.nome`,
      );
  try {
    const result = await statement.all<CommunityRow>();
    return result.results.map(mapCommunity);
  } catch (error) {
    if (isUninitializedPreviewDatabase(error)) return [];
    throw error;
  }
}

export async function getPublicCommunityBySlug(
  slug: string,
): Promise<PublicCommunity | null> {
  try {
    const row = await getD1()
      .prepare(
        `${COMMUNITY_SELECT}
        WHERE c.slug = ? AND c.status = 'ATIVA'
        LIMIT 1`,
      )
      .bind(slug)
      .first<CommunityRow>();
    return row ? mapCommunity(row) : null;
  } catch (error) {
    if (isUninitializedPreviewDatabase(error)) return null;
    throw error;
  }
}

function isUninitializedPreviewDatabase(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /no such table:\s*comunidades/i.test(message);
}

export async function getPublicPlatformFeed(
  limit = 10,
): Promise<PublicFeedPost[]> {
  return (await getPublicPlatformFeedPage({ limit })).posts;
}

export async function getPublicPlatformFeedPage({
  limit = 10,
  cursor,
}: {
  limit?: number;
  cursor?: string | null;
} = {}): Promise<PublicFeedPage> {
  const pageLimit = normalizeFeedLimit(limit);
  const decodedCursor = decodeFeedCursor(cursor || null);
  if (cursor && !decodedCursor) throw new Error("CURSOR_INVALIDO");
  const cursorSql = decodedCursor
    ? `AND (p.criado_em < ? OR (p.criado_em = ? AND p.id < ?))`
    : "";
  const statement = getD1()
    .prepare(
      `SELECT p.id, p.titulo, p.resumo, p.conteudo, p.categoria, p.origem,
        p.comentarios_habilitados, p.criado_em, p.imagem_url,
        p.imagem_thumbnail_url, p.imagem_alt, p.imagem_width, p.imagem_height,
        c.id AS comunidade_id, c.nome AS comunidade_nome,
        c.slug AS comunidade_slug,
        (SELECT COUNT(*) FROM comentarios_publicacao cp
          WHERE cp.publicacao_id = p.id AND cp.status = 'PUBLICADO')
          AS total_comentarios
      FROM publicacoes_piloto p
      LEFT JOIN comunidades c ON c.id = p.comunidade_id
      WHERE p.status = 'PUBLICADA'
        AND p.visibilidade = 'PLATAFORMA'
        AND (
          (p.comunidade_id IS NULL AND p.origem = 'PLATAFORMA')
          OR (
            c.status = 'ATIVA'
            AND c.feed_publico_habilitado = 1
            AND c.selo_pastoral_status IN ('APROVADO', 'NAO_APLICAVEL')
          )
        )
        ${cursorSql}
      ORDER BY p.criado_em DESC, p.id DESC
      LIMIT ?`,
    );
  const bound = decodedCursor
    ? statement.bind(
        decodedCursor.criadoEm,
        decodedCursor.criadoEm,
        decodedCursor.id,
        pageLimit + 1,
      )
    : statement.bind(pageLimit + 1);
  const result = await bound.all<Record<string, unknown>>();
  const page = pageFeedRows(
    result.results.map((row) => ({
      ...row,
      id: Number(row.id),
      criado_em: String(row.criado_em),
    })),
    pageLimit,
  );
  return {
    posts: page.items.map(mapPublicPost),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export async function getPublicCommunityFeed(
  comunidadeId: number,
  limit = 10,
): Promise<PublicFeedPost[]> {
  return (await getPublicCommunityFeedPage(comunidadeId, { limit })).posts;
}

export async function getPublicCommunityFeedPage(
  comunidadeId: number,
  {
    limit = 10,
    cursor,
  }: { limit?: number; cursor?: string | null } = {},
): Promise<PublicFeedPage> {
  const pageLimit = normalizeFeedLimit(limit);
  const decodedCursor = decodeFeedCursor(cursor || null);
  if (cursor && !decodedCursor) throw new Error("CURSOR_INVALIDO");
  const cursorSql = decodedCursor
    ? `AND (p.criado_em < ? OR (p.criado_em = ? AND p.id < ?))`
    : "";
  const statement = getD1()
    .prepare(
      `SELECT p.id, p.titulo, p.resumo, p.conteudo, p.categoria, p.origem,
        p.comentarios_habilitados, p.criado_em, p.imagem_url,
        p.imagem_thumbnail_url, p.imagem_alt, p.imagem_width, p.imagem_height,
        c.id AS comunidade_id, c.nome AS comunidade_nome,
        c.slug AS comunidade_slug,
        (SELECT COUNT(*) FROM comentarios_publicacao cp
          WHERE cp.publicacao_id = p.id AND cp.status = 'PUBLICADO')
          AS total_comentarios
      FROM publicacoes_piloto p
      JOIN comunidades c ON c.id = p.comunidade_id
      WHERE p.comunidade_id = ?
        AND p.status = 'PUBLICADA'
        AND p.visibilidade = 'PLATAFORMA'
        AND c.status = 'ATIVA'
        AND c.feed_publico_habilitado = 1
        AND c.selo_pastoral_status IN ('APROVADO', 'NAO_APLICAVEL')
        ${cursorSql}
      ORDER BY p.criado_em DESC, p.id DESC
      LIMIT ?`,
    );
  const bound = decodedCursor
    ? statement.bind(
        comunidadeId,
        decodedCursor.criadoEm,
        decodedCursor.criadoEm,
        decodedCursor.id,
        pageLimit + 1,
      )
    : statement.bind(comunidadeId, pageLimit + 1);
  const result = await bound.all<Record<string, unknown>>();
  const page = pageFeedRows(
    result.results.map((row) => ({
      ...row,
      id: Number(row.id),
      criado_em: String(row.criado_em),
    })),
    pageLimit,
  );
  return {
    posts: page.items.map(mapPublicPost),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export async function getPublicPlatformEvents(
  limit = 4,
): Promise<PublicCommunityEvent[]> {
  const result = await getD1()
    .prepare(
      `SELECT e.id, e.titulo, e.descricao, e.categoria, e.inicia_em,
        e.termina_em, e.local, c.nome AS comunidade_nome,
        c.slug AS comunidade_slug
      FROM eventos_comunidade e
      JOIN comunidades c ON c.id = e.comunidade_id
      WHERE e.publico = 1
        AND e.status = 'PUBLICADO'
        AND c.status = 'ATIVA'
        AND julianday(e.inicia_em) >= julianday('now', '-1 day')
      ORDER BY e.inicia_em ASC, e.id ASC
      LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(limit, 12)))
    .all<Record<string, unknown>>();
  return result.results.map(mapEvent);
}

export async function getPublicCommunityEvents(
  comunidadeId: number,
): Promise<PublicCommunityEvent[]> {
  const result = await getD1()
    .prepare(
      `SELECT id, titulo, descricao, categoria, inicia_em, termina_em, local
      FROM eventos_comunidade
      WHERE comunidade_id = ?
        AND publico = 1
        AND status = 'PUBLICADO'
        AND julianday(inicia_em) >= julianday('now', '-1 day')
      ORDER BY inicia_em ASC, id ASC
      LIMIT 6`,
    )
    .bind(comunidadeId)
    .all<Record<string, unknown>>();
  return result.results.map(mapEvent);
}

export async function getPublicCommunityCells(
  comunidadeId: number,
): Promise<PublicCommunityCell[]> {
  const result = await getD1().prepare(
    `SELECT c.id, c.nome, c.descricao_publica, c.endereco_publico,
      c.dias_reuniao, c.responsavel,
      json_array_length(c.membros) AS total_membros,
      (SELECT MIN(a.inicia_em) FROM celula_agenda a
       WHERE a.celula_id = c.id AND a.comunidade_id = c.comunidade_id
         AND a.visibilidade = 'PUBLICO' AND datetime(a.inicia_em) >= datetime('now')) AS proximo_encontro
     FROM celulas c WHERE c.comunidade_id = ? AND c.ativo = 1
       AND c.escopo_confirmado = 1 AND trim(c.descricao_publica) <> ''
     ORDER BY c.nome LIMIT 12`,
  ).bind(comunidadeId).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: Number(row.id), nome: String(row.nome), descricao: String(row.descricao_publica || ""),
    endereco: String(row.endereco_publico || ""), lider: String(row.responsavel || ""),
    membros: Number(row.total_membros || 0), proximoEncontro: row.proximo_encontro ? String(row.proximo_encontro) : null,
    dias: (() => { try { const value = JSON.parse(String(row.dias_reuniao || "[]")); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } })(),
  }));
}

export async function getCommunityJoinState(
  userId: number | null,
  comunidadeId: number,
): Promise<CommunityJoinState> {
  if (!userId) return { isMember: false, requestStatus: null };
  const membership = await getD1()
    .prepare(
      `SELECT 1 AS active
      FROM usuario_comunidades
      WHERE usuario_id = ? AND comunidade_id = ? AND status = 'ATIVO'
      LIMIT 1`,
    )
    .bind(userId, comunidadeId)
    .first<{ active: number }>();
  if (membership) return { isMember: true, requestStatus: null };
  const request = await getD1()
    .prepare(
      `SELECT status
      FROM solicitacoes_entrada_comunidade
      WHERE usuario_id = ? AND comunidade_id = ?
      LIMIT 1`,
    )
    .bind(userId, comunidadeId)
    .first<{ status: string }>();
  return { isMember: false, requestStatus: request?.status || null };
}

export async function getPilotFeed(
  comunidadeId: number,
): Promise<PilotFeedItem[]> {
  const result = await getD1()
    .prepare(
      `SELECT id, titulo, resumo, conteudo, categoria, visibilidade, status,
        origem, criado_por, comentarios_habilitados, links_json,
        criado_em, atualizado_em
      FROM publicacoes_piloto
      WHERE comunidade_id = ? AND status = 'PUBLICADA'
      ORDER BY criado_em DESC, id DESC LIMIT 10`,
    )
    .bind(comunidadeId)
    .all<PilotFeedItem>();
  return result.results;
}

export async function getPilotFeatureState(
  comunidadeId: number,
): Promise<PilotFeatureState> {
  const flags = await getD1()
    .prepare(
      `SELECT flag_key, scope_type, scope_id, enabled, inicia_em, termina_em
      FROM feature_flags
      WHERE (scope_type = 'GLOBAL' AND scope_id = 0)
         OR (scope_type = 'COMMUNITY' AND scope_id = ?)
         OR (scope_type = 'NETWORK' AND scope_id IN (
           SELECT rede_id FROM rede_unidades WHERE comunidade_id = ?
         ))
         OR (scope_type = 'PLAN' AND scope_id IN (
           SELECT r.plano_id FROM redes_igrejas r
           JOIN rede_unidades ru ON ru.rede_id = r.id
           WHERE ru.comunidade_id = ? AND r.plano_id IS NOT NULL
         ))
         OR (scope_type = 'PILOT' AND scope_id IN (0, ?))
      ORDER BY CASE scope_type
        WHEN 'COMMUNITY' THEN 0
        WHEN 'NETWORK' THEN 1
        WHEN 'PLAN' THEN 2
        WHEN 'PILOT' THEN 3
        ELSE 4
      END`,
    )
    .bind(comunidadeId, comunidadeId, comunidadeId, comunidadeId)
    .all<{
      flag_key: string;
      scope_type: string;
      scope_id: number;
      enabled: number;
      inicia_em: string | null;
      termina_em: string | null;
    }>();
  const resolved = new Map<string, boolean>();
  for (const flag of flags.results) {
    if (resolved.has(flag.flag_key) || !flagIsWithinWindow(flag)) continue;
    resolved.set(flag.flag_key, Boolean(flag.enabled));
  }
  const policy = await getD1()
    .prepare(
      `SELECT modo, publicacao_automatica
      FROM politicas_editoriais_ia
      WHERE (scope_type = 'COMMUNITY' AND scope_id = ?)
         OR (scope_type = 'GLOBAL' AND scope_id = 0)
      ORDER BY CASE scope_type WHEN 'COMMUNITY' THEN 0 ELSE 1 END
      LIMIT 1`,
    )
    .bind(comunidadeId)
    .first<{ modo: string; publicacao_automatica: number }>();
  return {
    networkModuleEnabled: resolved.get("network_module_enabled") ?? false,
    affiliateCreationEnabled:
      resolved.get("affiliate_creation_enabled") ?? false,
    paymentsEnabled: resolved.get("payments_enabled") ?? false,
    aiEditorialEnabled: resolved.get("ai_editorial_enabled") ?? false,
    aiAutoPublishEnabled:
      (resolved.get("ai_auto_publish_enabled") ?? false) &&
      Boolean(policy?.publicacao_automatica),
    aiEditorialMode: policy?.modo || "COM_REVISAO",
  };
}

export async function getParkingModuleState(comunidadeId: number) {
  const config = await getD1()
    .prepare(
      `SELECT ativo FROM estacionamento_configuracoes
       WHERE comunidade_id = ? LIMIT 1`,
    )
    .bind(comunidadeId)
    .first<{ ativo: number }>();
  return Boolean(config?.ativo);
}

function flagIsWithinWindow(flag: {
  inicia_em: string | null;
  termina_em: string | null;
}) {
  const now = Date.now();
  const startsAt = flag.inicia_em ? Date.parse(flag.inicia_em) : null;
  const endsAt = flag.termina_em ? Date.parse(flag.termina_em) : null;
  return (
    (startsAt === null || startsAt <= now) &&
    (endsAt === null || endsAt > now)
  );
}

function mapCommunity(row: CommunityRow): PublicCommunity {
  let rawTheme: Record<string, unknown> | null = null;
  if (row.theme_json) {
    try {
      const parsed = JSON.parse(row.theme_json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        rawTheme = parsed as Record<string, unknown>;
      }
    } catch {
      rawTheme = null;
    }
  }
  const theme = parseCommunityTheme(rawTheme);
  return {
    id: Number(row.id),
    nome: row.nome,
    slug: row.slug,
    descricao: row.descricao_publica,
    cidade: row.cidade_publica,
    ambienteDemo: Boolean(row.ambiente_demo),
    feedPublicoHabilitado: Boolean(row.feed_publico_habilitado),
    publicacoesPublicas: Number(row.publicacoes_publicas || 0),
    eventosPublicos: Number(row.eventos_publicos || 0),
    logoUrl: theme.logoUrl,
    bannerUrl: theme.bannerUrl,
  };
}

function mapPublicPost(row: Record<string, unknown>): PublicFeedPost {
  return {
    id: Number(row.id),
    titulo: String(row.titulo || ""),
    resumo: String(row.resumo || ""),
    conteudo: String(row.conteudo || row.resumo || ""),
    categoria: String(row.categoria || "COMUNIDADE"),
    origem: String(row.origem || "COMUNIDADE"),
    criadoEm: String(row.criado_em || ""),
    comunidadeId:
      row.comunidade_id === null || row.comunidade_id === undefined
        ? null
        : Number(row.comunidade_id),
    comunidadeNome:
      String(row.origem || "") === "PLATAFORMA"
        ? "VÍNKULO — Plataforma"
        : String(row.comunidade_nome || ""),
    comunidadeSlug: String(row.comunidade_slug || ""),
    isPlatform: String(row.origem || "") === "PLATAFORMA",
    comentariosHabilitados: Boolean(row.comentarios_habilitados),
    totalComentarios: Number(row.total_comentarios || 0),
    imagemUrl: String(row.imagem_url || ""),
    imagemThumbnailUrl: String(row.imagem_thumbnail_url || ""),
    imagemAlt: String(row.imagem_alt || ""),
    imagemWidth: Number(row.imagem_width || 0),
    imagemHeight: Number(row.imagem_height || 0),
  };
}

function mapEvent(row: Record<string, unknown>): PublicCommunityEvent {
  return {
    id: Number(row.id),
    titulo: String(row.titulo || ""),
    descricao: String(row.descricao || ""),
    categoria: String(row.categoria || "OUTRO"),
    iniciaEm: String(row.inicia_em || ""),
    terminaEm: row.termina_em ? String(row.termina_em) : null,
    local: String(row.local || ""),
    comunidadeNome: row.comunidade_nome
      ? String(row.comunidade_nome)
      : undefined,
    comunidadeSlug: row.comunidade_slug
      ? String(row.comunidade_slug)
      : undefined,
  };
}
