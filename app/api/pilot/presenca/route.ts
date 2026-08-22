import { getD1 } from "../../../../db";
import { isSystemOwnerAccount } from "../../../lib/local-auth";
import { requireTenantPermission } from "../../../lib/tenant";

type PresenceRow = {
  usuario_id: number;
  nome: string;
  foto_perfil: string | null;
  hierarquia: string;
  ultima_atividade: string;
  exibir_ultima_atividade: number;
  online: number;
  biografia: string;
  communication_group: "MEMBRO" | "OFICIAL";
  owner_email: string;
  owner_criado_em: string;
};

async function requirePresenceAccess() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access;
  if (access.context.communityAccess === "FEED_ONLY") {
    return {
      error: Response.json(
        { error: "A presença é privada aos integrantes desta comunidade." },
        { status: 403 },
      ),
    } as const;
  }
  return access;
}

async function listPresence(
  comunidadeId: number,
  currentUserId: number,
) {
  const result = await getD1()
    .prepare(
      `SELECT p.usuario_id, u.nome, u.foto_perfil,
        u.email AS owner_email, u.criado_em AS owner_criado_em,
        COALESCE(json_extract(u.cadastro_dados, '$.biografia.value'), '') AS biografia,
        CASE
          WHEN c.proprietario_usuario_id = u.id THEN 'PROPRIETÁRIO'
          WHEN NULLIF(oc.titulo, '') IS NOT NULL THEN oc.titulo
          WHEN uc.papel = 'ADMIN_COMUNIDADE' THEN 'ADMINISTRADOR'
          WHEN uc.papel = 'PASTOR' THEN 'PASTOR'
          WHEN uc.papel = 'LIDER' THEN 'LÍDER'
          ELSE 'MEMBRO'
        END AS hierarquia,
        CASE
          WHEN u.perfil = 'ADMIN'
            OR uc.papel IN ('ADMIN_COMUNIDADE', 'PASTOR', 'LIDER')
            OR EXISTS (
              SELECT 1 FROM oficiais_comunidade oc2
              WHERE oc2.usuario_comunidade_id = uc.id
            )
          THEN 'OFICIAL' ELSE 'MEMBRO'
        END AS communication_group,
        p.ultima_atividade, p.exibir_ultima_atividade,
        CASE
          WHEN datetime(p.ultima_atividade) >= datetime('now', '-5 minutes')
          THEN 1 ELSE 0
        END AS online
      FROM presencas_comunidade p
      JOIN usuarios u ON u.id = p.usuario_id AND u.ativo = 1
      JOIN comunidades c ON c.id = p.comunidade_id
      LEFT JOIN usuario_comunidades uc
        ON uc.usuario_id = p.usuario_id
       AND uc.comunidade_id = p.comunidade_id
       AND uc.status = 'ATIVO'
      LEFT JOIN oficiais_comunidade oc
        ON oc.usuario_comunidade_id = uc.id
      WHERE p.comunidade_id = ?
        AND (uc.id IS NOT NULL OR c.proprietario_usuario_id = p.usuario_id)
      ORDER BY online DESC, datetime(p.ultima_atividade) DESC, u.nome
      LIMIT 100`,
    )
    .bind(comunidadeId)
    .all<PresenceRow>();

  const current = result.results.find(
    (item) => Number(item.usuario_id) === Number(currentUserId),
  );
  const currentCommunicationGroup = current?.communication_group || "MEMBRO";

  return {
    people: result.results.map((item) => ({
      userId: Number(item.usuario_id),
      name: item.nome,
      avatarUrl: item.foto_perfil,
      hierarchy: item.hierarquia,
      online: Boolean(item.online),
      lastSeen:
        item.online ||
        Boolean(item.exibir_ultima_atividade) ||
        Number(item.usuario_id) === Number(currentUserId)
          ? item.ultima_atividade
          : null,
      sharesLastSeen: Boolean(item.exibir_ultima_atividade),
      biography: item.biografia,
      ownerVerified: isSystemOwnerAccount({
        email: item.owner_email,
        criado_em: item.owner_criado_em,
      }),
      canMessage:
        Number(item.usuario_id) !== Number(currentUserId) &&
        item.communication_group === currentCommunicationGroup,
      communicationGroup: item.communication_group,
    })),
    currentUserId,
    currentUserSharesLastSeen: current
      ? Boolean(current.exibir_ultima_atividade)
      : true,
  };
}

export async function GET() {
  const access = await requirePresenceAccess();
  if ("error" in access) return access.error;
  return Response.json(
    await listPresence(access.context.comunidadeId, access.user.id),
  );
}

export async function POST() {
  const access = await requirePresenceAccess();
  if ("error" in access) return access.error;

  await getD1()
    .prepare(
      `INSERT INTO presencas_comunidade
        (usuario_id, comunidade_id, ultima_atividade, exibir_ultima_atividade)
      VALUES (?, ?, CURRENT_TIMESTAMP, 1)
      ON CONFLICT(usuario_id, comunidade_id) DO UPDATE SET
        ultima_atividade = CURRENT_TIMESTAMP`,
    )
    .bind(access.user.id, access.context.comunidadeId)
    .run();

  return Response.json(
    await listPresence(access.context.comunidadeId, access.user.id),
  );
}

export async function PATCH(request: Request) {
  const access = await requirePresenceAccess();
  if ("error" in access) return access.error;
  const body = (await request.json()) as { shareLastSeen?: unknown };
  if (typeof body.shareLastSeen !== "boolean") {
    return Response.json(
      { error: "Escolha se deseja compartilhar a última atividade." },
      { status: 400 },
    );
  }

  const db = getD1();
  const updated = await db
    .prepare(
      `UPDATE presencas_comunidade
       SET ultima_atividade = CURRENT_TIMESTAMP,
           exibir_ultima_atividade = ?
       WHERE usuario_id = ? AND comunidade_id = ?`,
    )
    .bind(
      body.shareLastSeen ? 1 : 0,
      access.user.id,
      access.context.comunidadeId,
    )
    .run();
  if (!Number(updated.meta.changes || 0)) {
    await db
      .prepare(
        `INSERT INTO presencas_comunidade
          (usuario_id, comunidade_id, ultima_atividade, exibir_ultima_atividade)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
      )
      .bind(
        access.user.id,
        access.context.comunidadeId,
        body.shareLastSeen ? 1 : 0,
      )
      .run();
  }

  return Response.json(
    await listPresence(access.context.comunidadeId, access.user.id),
  );
}
