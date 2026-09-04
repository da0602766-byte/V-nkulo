import { canAttachPostMedia, bindPostMedia } from "../../../lib/post-media";
import { getD1 } from "../../../../db";
import {
  decodeFeedCursor,
  normalizeFeedLimit,
  pageFeedRows,
} from "../../../lib/feed-cursor";
import { parseFeedPostPayload } from "../../../lib/feed-validation";
import { publishDueEditorialEntries } from "../../../lib/editorial-scheduler";
import { isSystemOwnerAccount } from "../../../lib/local-auth";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";
import { notifyUser } from "../../../lib/pilot-notifications";

export async function GET(request: Request) {
  const access = await requireTenantPermission("feed.view");
  if ("error" in access) return access.error;
  await publishDueEditorialEntries();
  const url = new URL(request.url);
  const cursorValue = url.searchParams.get("cursor");
  const cursor = decodeFeedCursor(cursorValue);
  if (cursorValue && !cursor) {
    return Response.json({ error: "Cursor do feed inválido." }, { status: 400 });
  }
  const limit = normalizeFeedLimit(url.searchParams.get("limit"));
  const placementSql = url.searchParams.get("placement") === "sidebar"
    ? "AND p.canal_lateral = 1"
    : "AND p.canal_feed = 1";
  const canPublish = access.context.permissions.includes("feed.publish");
  const canModerate = access.context.permissions.includes("feed.moderate");
  const canDelete = access.user.system_owner === true;
  const db = getD1();
  const cursorSql = cursor
    ? `AND (p.criado_em < ? OR (p.criado_em = ? AND p.id < ?))`
    : "";
  const postStatement = db.prepare(
    `SELECT p.id, p.titulo, p.resumo, p.conteudo, p.categoria,
      p.visibilidade, p.status, p.origem, p.criado_em, p.atualizado_em,
      p.criado_por, p.comentarios_habilitados, p.imagem_url,
      p.imagem_thumbnail_url, p.imagem_alt, p.imagem_width, p.imagem_height,
      p.links_json, p.audiencia_tipo, p.ministerios_json,
      p.canal_feed, p.canal_lateral, p.aprovacao_status,
      u.nome AS autor_nome, u.foto_perfil AS autor_foto,
      u.email AS autor_email, u.criado_em AS autor_criado_em,
      (SELECT uc.papel FROM usuario_comunidades uc
       WHERE uc.usuario_id = p.criado_por AND uc.comunidade_id = p.comunidade_id
         AND uc.status = 'ATIVO' LIMIT 1) AS autor_papel,
      (SELECT COUNT(*) FROM comentarios_publicacao cp
       WHERE cp.publicacao_id = p.id AND cp.status = 'PUBLICADO') AS total_comentarios,
      CASE WHEN p.criado_por = ? THEN 1 ELSE 0 END AS can_edit,
      CASE WHEN p.criado_por = ? OR ? = 1 THEN 1 ELSE 0 END AS can_hide,
      CASE WHEN ? = 1 THEN 1 ELSE 0 END AS can_delete
    FROM publicacoes_piloto p
    LEFT JOIN usuarios u ON u.id = p.criado_por
    WHERE p.comunidade_id = ?
      ${placementSql}
      AND (p.audiencia_tipo <> 'MINISTERIOS' OR ? = 1 OR EXISTS (
        SELECT 1 FROM json_each(p.ministerios_json) audiencia
        JOIN ministerio_voluntarios mv ON mv.ministerio_id = CAST(audiencia.value AS INTEGER)
        WHERE mv.usuario_id = ? AND mv.ativo = 1
      ))
      AND (p.status = 'PUBLICADA' OR p.criado_por = ? OR ? = 1)
      AND p.status <> 'ARQUIVADA'
      ${cursorSql}
    ORDER BY p.criado_em DESC, p.id DESC
    LIMIT ?`,
  );
  const postsPromise = cursor
    ? postStatement
        .bind(
          access.user.id,
          access.user.id,
          canModerate ? 1 : 0,
          canDelete ? 1 : 0,
          access.context.comunidadeId,
          canModerate ? 1 : 0,
          access.user.id,
          access.user.id,
          canModerate ? 1 : 0,
          cursor.criadoEm,
          cursor.criadoEm,
          cursor.id,
          limit + 1,
        )
        .all<Record<string, unknown>>()
    : postStatement
        .bind(
          access.user.id,
          access.user.id,
          canModerate ? 1 : 0,
          canDelete ? 1 : 0,
          access.context.comunidadeId,
          canModerate ? 1 : 0,
          access.user.id,
          access.user.id,
          canModerate ? 1 : 0,
          limit + 1,
        )
        .all<Record<string, unknown>>();
  const posts = await postsPromise;
  const page = pageFeedRows(
    posts.results.map((row) => {
      const { autor_email, autor_criado_em, ...post } = row;
      return {
        ...post,
        id: Number(post.id),
        criado_em: String(post.criado_em),
        autor_verificado: isSystemOwnerAccount({
          email: String(autor_email || ""),
          criado_em: String(autor_criado_em || ""),
        }),
      };
    }),
    limit,
  );
  return Response.json(
    {
      publicacoes: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      canPublish,
      canModerate,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("feed.publish");
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, unknown>;
  const parsed = parseFeedPostPayload({ ...payload, visibilidade: "COMUNIDADE" });
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  if (!(await canAttachPostMedia(parsed.imagemUrl, access.user.id, access.context.comunidadeId)) || !(await canAttachPostMedia(parsed.imagemThumbnailUrl, access.user.id, access.context.comunidadeId))) {
    return Response.json({ error: "Esta imagem não pertence a esta publicação. Envie um arquivo autorizado." }, { status: 403 });
  }

  const db = getD1();
  const audienciaTipo = String(payload.audienciaTipo || "PUBLICO").toUpperCase() === "MINISTERIOS" ? "MINISTERIOS" : "PUBLICO";
  const requestedMinistryIds = Array.isArray(payload.ministerioIds)
    ? [...new Set(payload.ministerioIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 50)
    : [];
  if (audienciaTipo === "MINISTERIOS" && !requestedMinistryIds.length) {
    return Response.json({ error: "Escolha pelo menos um ministério." }, { status: 400 });
  }
  if (requestedMinistryIds.length) {
    const placeholders = requestedMinistryIds.map(() => "?").join(",");
    const valid = await db.prepare(
      `SELECT id FROM ministerios_comunidade WHERE comunidade_id = ? AND status = 'ATIVO' AND id IN (${placeholders})`,
    ).bind(access.context.comunidadeId, ...requestedMinistryIds).all<{ id: number }>();
    if (valid.results.length !== requestedMinistryIds.length) {
      return Response.json({ error: "Um dos ministérios escolhidos não pertence à comunidade ativa." }, { status: 400 });
    }
  }
  const canalFeed = payload.canalFeed !== false;
  const canalLateral = payload.canalLateral === true;
  if (!canalFeed && !canalLateral) {
    return Response.json({ error: "Escolha Feed, Lateral ou os dois." }, { status: 400 });
  }
  const canModerate = access.context.permissions.includes("feed.moderate") || access.user.system_owner === true;
  const wantsPublish = parsed.status === "PUBLICADA";
  const status = wantsPublish && !canModerate ? "EM_ANALISE" : parsed.status;
  const approvalStatus = wantsPublish && !canModerate ? "PENDENTE" : "APROVADA";
  let linksJson = parsed.linksJson;
  let postContent = parsed.conteudo;
  let postSummary = parsed.resumo;
  const eventId = Number(payload.eventId);
  if (Number.isInteger(eventId) && eventId > 0) {
    const event = await db.prepare(
      `SELECT e.id, e.titulo, e.descricao, e.inicia_em, e.local, c.slug
       FROM eventos_comunidade e
       JOIN comunidades c ON c.id = e.comunidade_id
       WHERE e.id = ? AND e.comunidade_id = ? AND e.criado_por = ?
       LIMIT 1`,
    ).bind(eventId, access.context.comunidadeId, access.user.id).first<{
      id: number; titulo: string; descricao: string; inicia_em: string; local: string; slug: string;
    }>();
    if (!event) {
      return Response.json({ error: "Só é possível puxar eventos criados por você." }, { status: 403 });
    }
    const eventUrl = new URL(`/comunidades/${event.slug}#evento-${event.id}`, request.url).toString();
    const links = [eventUrl, ...parsed.links].filter((link, index, values) => values.indexOf(link) === index).slice(0, 5);
    linksJson = JSON.stringify(links);
    const eventDetails = `\n\n📅 ${event.titulo}\n${event.descricao || ""}\n${event.inicia_em}${event.local ? ` · ${event.local}` : ""}`.trim();
    postContent = `${parsed.conteudo}\n\n${eventDetails}`.slice(0, 3000);
    postSummary = postContent.slice(0, 320);
  }
  const result = await db
    .prepare(
      `INSERT INTO publicacoes_piloto
      (comunidade_id, titulo, resumo, conteudo, categoria, visibilidade,
       status, origem, comentarios_habilitados, criado_por, imagem_url,
       imagem_thumbnail_url, imagem_alt, imagem_width, imagem_height, links_json,
       audiencia_tipo, ministerios_json, canal_feed, canal_lateral,
       aprovacao_status, aprovado_por, aprovado_em,
       atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'COMUNIDADE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        CASE WHEN ? = 'APROVADA' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CURRENT_TIMESTAMP)`,
    )
    .bind(
      access.context.comunidadeId,
      parsed.titulo,
      postSummary,
      postContent,
      parsed.categoria,
      "COMUNIDADE",
      status,
      parsed.comentariosHabilitados ? 1 : 0,
      access.user.id,
      parsed.imagemUrl,
      parsed.imagemThumbnailUrl,
      parsed.imagemAlt,
      parsed.imagemWidth,
      parsed.imagemHeight,
      linksJson,
      audienciaTipo,
      JSON.stringify(requestedMinistryIds),
      canalFeed ? 1 : 0,
      canalLateral ? 1 : 0,
      approvalStatus,
      approvalStatus === "APROVADA" ? access.user.id : null,
      approvalStatus,
    )
    .run();
  const postId = Number(result.meta.last_row_id);
  await bindPostMedia(parsed.imagemUrl, access.user.id, access.context.comunidadeId, postId);
  await bindPostMedia(parsed.imagemThumbnailUrl, access.user.id, access.context.comunidadeId, postId);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "PUBLICACAO_V45_CRIADA",
    "SUCESSO",
    {
      publicacaoId: postId,
      status,
      visibilidade: "COMUNIDADE",
      audienciaTipo,
      ministerioIds: requestedMinistryIds,
      canais: { feed: canalFeed, lateral: canalLateral },
    },
  );
  if (approvalStatus === "PENDENTE") {
    const managers = await db.prepare(
      `SELECT DISTINCT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
         AND (uc.papel IN ('PASTOR','ADMIN_COMUNIDADE') OR u.perfil = 'ADMIN')`,
    ).bind(access.context.comunidadeId).all<{ id: number }>();
    await Promise.all(managers.results.filter((item) => item.id !== access.user.id).map((item) => notifyUser(db, {
      userId: item.id, title: "Publicação aguardando aprovação",
      message: `${access.user.nome} enviou “${parsed.titulo}” para análise.`, entityId: postId,
      destination: `/painel?view=inicio#publicacao-${postId}`, createdBy: "VÍNKULO",
    })));
  }
  return Response.json({ id: postId, status, message: approvalStatus === "PENDENTE" ? "Publicação enviada ao responsável para aprovação." : parsed.status === "RASCUNHO" ? "Rascunho salvo." : "Publicação criada." }, { status: 201 });
}
