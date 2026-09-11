import { getD1 } from "../../../../../../db";
import { parsePublicCommentPayload } from "../../../../../lib/feed-validation";
import { isSystemOwnerAccount } from "../../../../../lib/local-auth";
import { requireTenantPermission } from "../../../../../lib/tenant";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const access = await requireTenantPermission("feed.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Publicação inválida." }, { status: 400 });
  }
  const db = getD1();
  const post = await findTenantPost(db, id, access.context.comunidadeId);
  if (!post) {
    return Response.json({ error: "Publicação não encontrada nesta comunidade." }, { status: 404 });
  }
  const result = await db
    .prepare(
      `SELECT cp.id, cp.usuario_id, cp.autor_nome_snapshot, cp.texto,
        cp.perfil_visivel, cp.criado_em, u.nome, u.foto_perfil,
        u.email AS owner_email, u.criado_em AS owner_criado_em,
        (SELECT uc.papel FROM usuario_comunidades uc
         WHERE uc.usuario_id = cp.usuario_id AND uc.comunidade_id = ?
           AND uc.status = 'ATIVO' LIMIT 1) AS papel
       FROM comentarios_publicacao cp
       LEFT JOIN usuarios u ON u.id = cp.usuario_id
       WHERE cp.publicacao_id = ? AND cp.status = 'PUBLICADO'
       ORDER BY cp.criado_em ASC, cp.id ASC LIMIT 100`,
    )
    .bind(access.context.comunidadeId, id)
    .all<Record<string, unknown>>();
  return Response.json({
    comentariosHabilitados: Boolean(post.comentarios_habilitados),
    canComment: Boolean(post.comentarios_habilitados),
    comentarios: result.results.map((item) => ({
      id: Number(item.id),
      texto: String(item.texto || ""),
      criadoEm: String(item.criado_em || ""),
      autor: String(item.nome || item.autor_nome_snapshot || "Usuário"),
      foto: String(item.foto_perfil || ""),
      papel: roleLabel(String(item.papel || "")),
      ownerVerified: isSystemOwnerAccount({
        email: String(item.owner_email || ""),
        criado_em: String(item.owner_criado_em || ""),
      }),
      perfilVisivel: Boolean(item.perfil_visivel),
      isOwner: Number(item.usuario_id) === access.user.id,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const access = await requireTenantPermission("feed.view");
  if ("error" in access) return access.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Publicação inválida." }, { status: 400 });
  }
  const parsed = parsePublicCommentPayload(await request.json().catch(() => null));
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const db = getD1();
  const post = await findTenantPost(db, id, access.context.comunidadeId);
  if (!post) return Response.json({ error: "Publicação não encontrada nesta comunidade." }, { status: 404 });
  if (!post.comentarios_habilitados) {
    return Response.json({ error: "Os comentários estão desativados nesta publicação." }, { status: 409 });
  }
  const result = await db
    .prepare(
      `INSERT INTO comentarios_publicacao
       (publicacao_id, usuario_id, autor_nome_snapshot, texto, perfil_visivel)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, access.user.id, access.user.nome, parsed.texto, parsed.perfilVisivel ? 1 : 0)
    .run();
  return Response.json({ id: Number(result.meta.last_row_id) }, { status: 201 });
}

function findTenantPost(db: ReturnType<typeof getD1>, id: number, communityId: number) {
  return db
    .prepare(
      `SELECT id, comentarios_habilitados FROM publicacoes_piloto
       WHERE id = ? AND comunidade_id = ? AND status = 'PUBLICADA'
         AND visibilidade = 'COMUNIDADE' LIMIT 1`,
    )
    .bind(id, communityId)
    .first<{ id: number; comentarios_habilitados: number }>();
}

function roleLabel(role: string) {
  return ({ MEMBRO: "Membro", LIDER: "Líder", PASTOR: "Pastoral", ADMIN_COMUNIDADE: "Administrador", SUPERADMIN: "Proprietário" } as Record<string, string>)[role] || "Usuário ativo";
}
