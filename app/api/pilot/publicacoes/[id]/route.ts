import { canAttachPostMedia, bindPostMedia } from "../../../../lib/post-media";
import { getD1 } from "../../../../../db";
import { parseFeedPostPayload } from "../../../../lib/feed-validation";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";
import { notifyUser } from "../../../../lib/pilot-notifications";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await requireTenantPermission("feed.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Publicação inválida." }, { status: 400 });
  }
  const payload = (await request.json()) as Record<string, unknown>;
  const db = getD1();
  const existing = await db
    .prepare(
      `SELECT id, criado_por FROM publicacoes_piloto
      WHERE id = ? AND comunidade_id = ? AND status <> 'ARQUIVADA'`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; criado_por: number | null }>();
  if (!existing) {
    return Response.json(
      { error: "Publicação não encontrada." },
      { status: 404 },
    );
  }
  const isOwner = existing.criado_por === access.user.id;
  const canModerate = access.context.permissions.includes("feed.moderate");
  if (String(payload.acao || "").toUpperCase() === "APROVAR") {
    if (!canModerate && access.user.system_owner !== true) {
      return Response.json({ error: "Somente o responsável da comunidade pode aprovar." }, { status: 403 });
    }
    await db.prepare(
      `UPDATE publicacoes_piloto SET status = 'PUBLICADA', aprovacao_status = 'APROVADA',
       aprovado_por = ?, aprovado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ? AND status = 'EM_ANALISE'`,
    ).bind(access.user.id, id, access.context.comunidadeId).run();
    if (existing.criado_por && existing.criado_por !== access.user.id) {
      await notifyUser(db, { userId: existing.criado_por, title: "Publicação aprovada", message: "Sua publicação foi aprovada pelo responsável da comunidade.", entityId: id, destination: `/painel?view=inicio#publicacao-${id}`, createdBy: "VÍNKULO" });
    }
    await recordTenantAudit(db, access.context, access.user.id, "PUBLICACAO_APROVADA", "SUCESSO", { publicacaoId: id });
    return Response.json({ ok: true });
  }
  if (String(payload.acao || "").toUpperCase() === "ARQUIVAR") {
    if (!isOwner && !canModerate) {
      return Response.json(
        { error: "Somente o autor ou a gestão pode ocultar esta publicação." },
        { status: 403 },
      );
    }
    await db
      .prepare(
        `UPDATE publicacoes_piloto
        SET status = 'ARQUIVADA', atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND comunidade_id = ?`,
      )
      .bind(id, access.context.comunidadeId)
      .run();
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "PUBLICACAO_V45_ARQUIVADA",
      "SUCESSO",
      { publicacaoId: id },
    );
    return Response.json({ ok: true });
  }
  if (!isOwner) {
    return Response.json(
      { error: "Somente o autor pode editar esta publicação." },
      { status: 403 },
    );
  }
  if (!access.context.permissions.includes("feed.publish")) {
    return Response.json(
      { error: "Seu perfil atual não permite publicar conteúdo." },
      { status: 403 },
    );
  }
  const parsed = parseFeedPostPayload({ ...payload, visibilidade: "COMUNIDADE" });
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  if (!(await canAttachPostMedia(parsed.imagemUrl, access.user.id, access.context.comunidadeId, id)) || !(await canAttachPostMedia(parsed.imagemThumbnailUrl, access.user.id, access.context.comunidadeId, id))) {
    return Response.json({ error: "Esta imagem não pertence a esta publicação. Envie um arquivo autorizado." }, { status: 403 });
  }

  const nextStatus = parsed.status === "PUBLICADA" && !canModerate && access.user.system_owner !== true ? "EM_ANALISE" : parsed.status;
  await db
    .prepare(
      `UPDATE publicacoes_piloto SET
        titulo = ?, resumo = ?, conteudo = ?, categoria = ?,
        visibilidade = ?, status = ?, aprovacao_status = ?, comentarios_habilitados = ?,
        imagem_url = ?, imagem_thumbnail_url = ?, imagem_alt = ?,
        imagem_width = ?, imagem_height = ?, links_json = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(
      parsed.titulo,
      parsed.resumo,
      parsed.conteudo,
      parsed.categoria,
      "COMUNIDADE",
      nextStatus,
      nextStatus === "EM_ANALISE" ? "PENDENTE" : "APROVADA",
      parsed.comentariosHabilitados ? 1 : 0,
      parsed.imagemUrl,
      parsed.imagemThumbnailUrl,
      parsed.imagemAlt,
      parsed.imagemWidth,
      parsed.imagemHeight,
      parsed.linksJson,
      id,
      access.context.comunidadeId,
    )
    .run();
  await bindPostMedia(parsed.imagemUrl, access.user.id, access.context.comunidadeId, id);
  await bindPostMedia(parsed.imagemThumbnailUrl, access.user.id, access.context.comunidadeId, id);
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "PUBLICACAO_V45_ATUALIZADA",
    "SUCESSO",
    {
      publicacaoId: id,
      status: nextStatus,
      visibilidade: "COMUNIDADE",
    },
  );
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireTenantPermission("feed.view");
  if ("error" in access) return access.error;
  if (access.user.system_owner !== true) {
    return Response.json(
      { error: "Somente o proprietário da plataforma pode excluir definitivamente." },
      { status: 403 },
    );
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Publicação inválida." }, { status: 400 });
  }
  const db = getD1();
  const existing = await db
    .prepare(
      `SELECT id, titulo FROM publicacoes_piloto
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .first<{ id: number; titulo: string }>();
  if (!existing) {
    return Response.json({ error: "Publicação não encontrada." }, { status: 404 });
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "PUBLICACAO_V473_EXCLUIDA_PELO_PROPRIETARIO",
    "SUCESSO",
    { publicacaoId: id, titulo: existing.titulo },
  );
  await db
    .prepare(
      `DELETE FROM publicacoes_piloto
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(id, access.context.comunidadeId)
    .run();
  return Response.json({ ok: true });
}
