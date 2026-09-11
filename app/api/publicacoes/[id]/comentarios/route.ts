import { getD1 } from "../../../../../db";
import { parsePublicCommentPayload } from "../../../../lib/feed-validation";
import {
  getSessionUser,
  isSystemOwnerAccount,
} from "../../../../lib/local-auth";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Publicação inválida." }, { status: 400 });
  }
  const db = getD1();
  const post = await findPublicPost(db, id);
  if (!post) {
    return Response.json(
      { error: "Publicação pública não encontrada." },
      { status: 404 },
    );
  }
  const viewer = await getSessionUser();
  const viewerIsSuperadmin = Boolean(
    viewer?.ativo && (viewer.perfil === "ADMIN" || viewer.system_owner),
  );
  const result = await db
    .prepare(
      `SELECT cp.id, cp.usuario_id, cp.autor_nome_snapshot, cp.texto,
        cp.perfil_visivel, cp.criado_em, u.nome, u.email,
        u.criado_em AS owner_criado_em,
        (SELECT uc.papel FROM usuario_comunidades uc
          WHERE uc.usuario_id = cp.usuario_id AND uc.status = 'ATIVO'
          ORDER BY uc.id LIMIT 1) AS papel
      FROM comentarios_publicacao cp
      LEFT JOIN usuarios u ON u.id = cp.usuario_id
      WHERE cp.publicacao_id = ? AND cp.status = 'PUBLICADO'
      ORDER BY cp.criado_em ASC, cp.id ASC
      LIMIT 100`,
    )
    .bind(id)
    .all<{
      id: number;
      usuario_id: number | null;
      autor_nome_snapshot: string;
      texto: string;
      perfil_visivel: number;
      criado_em: string;
      nome: string | null;
      email: string | null;
      papel: string | null;
      owner_criado_em: string | null;
    }>();

  return Response.json(
    {
      comentariosHabilitados: Boolean(post.comentarios_habilitados),
      canComment: Boolean(viewer?.ativo && post.comentarios_habilitados),
      loginRequired: !viewer,
      comentarios: result.results.map((item) => {
        const ownComment = viewer?.id === item.usuario_id;
        const showProfile =
          Boolean(item.perfil_visivel) || ownComment || viewerIsSuperadmin;
        return {
          id: Number(item.id),
          texto: item.texto,
          criadoEm: item.criado_em,
          perfilVisivel: Boolean(item.perfil_visivel),
          autor: showProfile
            ? item.nome || item.autor_nome_snapshot
            : "Usuário da plataforma",
          papel:
            showProfile && item.perfil_visivel
              ? normalizeRoleLabel(item.papel)
              : null,
          email: viewerIsSuperadmin ? item.email : null,
          isOwner: ownComment,
          ownerVerified: isSystemOwnerAccount({
            email: item.email || "",
            criado_em: item.owner_criado_em || "",
          }),
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Faça login para comentar." }, { status: 401 });
  }
  if (!user.ativo) {
    return Response.json({ error: "Usuário inativo." }, { status: 403 });
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Publicação inválida." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dados do comentário inválidos." }, { status: 400 });
  }
  const parsed = parsePublicCommentPayload(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const db = getD1();
  const post = await findPublicPost(db, id);
  if (!post) {
    return Response.json(
      { error: "Publicação pública não encontrada." },
      { status: 404 },
    );
  }
  if (!post.comentarios_habilitados) {
    return Response.json(
      { error: "Os comentários estão desativados nesta publicação." },
      { status: 409 },
    );
  }

  const result = await db
    .prepare(
      `INSERT INTO comentarios_publicacao
      (publicacao_id, usuario_id, autor_nome_snapshot, texto, perfil_visivel)
      VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.id,
      user.nome,
      parsed.texto,
      parsed.perfilVisivel ? 1 : 0,
    )
    .run();
  return Response.json(
    { id: Number(result.meta.last_row_id) },
    { status: 201 },
  );
}

async function findPublicPost(db: ReturnType<typeof getD1>, id: number) {
  return db
    .prepare(
      `SELECT p.id, p.comentarios_habilitados
      FROM publicacoes_piloto p
      LEFT JOIN comunidades c ON c.id = p.comunidade_id
      WHERE p.id = ?
        AND p.status = 'PUBLICADA'
        AND p.visibilidade = 'PLATAFORMA'
        AND (
          (p.comunidade_id IS NULL AND p.origem = 'PLATAFORMA')
          OR (
            c.status = 'ATIVA'
            AND c.feed_publico_habilitado = 1
          )
        )
      LIMIT 1`,
    )
    .bind(id)
    .first<{ id: number; comentarios_habilitados: number }>();
}

function normalizeRoleLabel(value: string | null) {
  const labels: Record<string, string> = {
    MEMBRO: "Membro",
    LIDER: "Líder",
    PASTOR: "Pastoral",
    ADMIN_COMUNIDADE: "Administrador",
    SUPERADMIN: "Superadministrador",
  };
  return value ? labels[value] || "Usuário ativo" : "Usuário ativo";
}
