import { getD1 } from "../../../../db";
import { notifyUser } from "../../../lib/pilot-notifications";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const TYPES = new Set([
  "ORACAO",
  "VISITA",
  "ACONSELHAMENTO",
  "APOIO",
  "MINISTERIO",
  "OUTRO",
  "INFORMACAO",
]);
const VISIBILITIES = new Set(["PASTORAL", "GESTORES", "PRIVADA"]);
const STATUSES = new Set(["ABERTA", "EM_ANALISE", "CONCLUIDA"]);
const AUDIENCE_TYPES = new Set(["USUARIO", "MINISTERIO", "PAPEL", "TODOS_MEMBROS"]);
const ROLES = new Set(["MEMBRO", "LIDER", "PASTOR", "ADMIN_COMUNIDADE"]);

export async function GET() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  if (access.context.communityAccess === "FEED_ONLY") {
    return Response.json({ error: "Ação não permitida." }, { status: 403 });
  }
  const canManage = access.context.permissions.some((permission) =>
    ["pastoral.panel.view", "community.settings.manage", "platform.admin.view"].includes(
      permission,
    ),
  );
  const db = getD1();
  const result = await db
    .prepare(
      `SELECT s.id, s.tipo, s.titulo, s.descricao, s.visibilidade, s.status,
        s.criado_em, s.atualizado_em, s.solicitante_id,
        u.nome AS solicitante_nome,
        COALESCE((SELECT group_concat(
          CASE sp.tipo
            WHEN 'USUARIO' THEN 'Pessoa: ' || COALESCE(pessoa.nome, sp.referencia_texto)
            WHEN 'MINISTERIO' THEN 'Ministério: ' || COALESCE(ministerio.nome, sp.referencia_texto)
            WHEN 'PAPEL' THEN 'Função: ' || sp.referencia_texto
            ELSE 'Todos os membros'
          END, ' • ')
          FROM solicitacao_publicos sp
          LEFT JOIN usuarios pessoa ON pessoa.id = sp.referencia_id AND sp.tipo = 'USUARIO'
          LEFT JOIN ministerios_comunidade ministerio ON ministerio.id = sp.referencia_id AND sp.tipo = 'MINISTERIO'
          WHERE sp.solicitacao_id = s.id AND sp.comunidade_id = s.comunidade_id
        ), '') AS publico_resumo
       FROM solicitacoes_comunidade s
       JOIN usuarios u ON u.id = s.solicitante_id
       WHERE s.comunidade_id = ?
         AND (
           s.solicitante_id = ?
           OR EXISTS (
             SELECT 1 FROM solicitacao_destinatarios sd
             WHERE sd.solicitacao_id = s.id AND sd.comunidade_id = s.comunidade_id
               AND sd.usuario_id = ?
           )
           OR (? = 1 AND NOT EXISTS (
             SELECT 1 FROM solicitacao_destinatarios legacy
             WHERE legacy.solicitacao_id = s.id
           ))
         )
       ORDER BY CASE s.status
         WHEN 'ABERTA' THEN 0 WHEN 'EM_ANALISE' THEN 1 ELSE 2 END,
         s.id DESC
       LIMIT 150`,
    )
    .bind(
      access.context.comunidadeId,
      access.user.id,
      access.user.id,
      canManage ? 1 : 0,
    )
    .all<Record<string, unknown>>();
  const [users, ministries] = await Promise.all([
    db.prepare(
      `SELECT u.id, u.nome, uc.papel
       FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
       ORDER BY u.nome ASC LIMIT 250`,
    ).bind(access.context.comunidadeId).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT m.id, m.nome
       FROM ministerios_comunidade m
       WHERE m.comunidade_id = ? AND m.status = 'ATIVO'
         AND (? = 1 OR m.responsavel_usuario_id = ? OR EXISTS (
           SELECT 1 FROM ministerio_voluntarios mv
           WHERE mv.ministerio_id = m.id AND mv.comunidade_id = m.comunidade_id
             AND mv.usuario_id = ? AND mv.ativo = 1
         ))
       ORDER BY m.nome ASC`,
    ).bind(access.context.comunidadeId, canManage ? 1 : 0, access.user.id, access.user.id).all<Record<string, unknown>>(),
  ]);
  await db
    .prepare(
      `UPDATE solicitacao_destinatarios SET visualizado_em = CURRENT_TIMESTAMP
       WHERE comunidade_id = ? AND usuario_id = ? AND visualizado_em IS NULL`,
    )
    .bind(access.context.comunidadeId, access.user.id)
    .run();
  return Response.json(
    {
      solicitacoes: result.results,
      canManage,
      audienceOptions: {
        usuarios: users.results,
        ministerios: ministries.results,
        papeis: canManage ? ["MEMBRO", "LIDER", "PASTOR", "ADMIN_COMUNIDADE"] : [],
        allowAllMembers: canManage,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  if (access.context.communityAccess === "FEED_ONLY") {
    return Response.json({ error: "Ação não permitida." }, { status: 403 });
  }
  const body = await safeJson(request);
  if (!body) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const tipo = clean(body.tipo, 30).toUpperCase();
  const titulo = clean(body.titulo, 120);
  const descricao = clean(body.descricao, 2000);
  const visibilidade = clean(body.visibilidade, 30).toUpperCase() || "PRIVADA";
  const hasExplicitAudience = Array.isArray(body.audience) && body.audience.length > 0;
  const audience = hasExplicitAudience
    ? parseAudience(body.audience)
    : { value: [] as AudienceTarget[] };
  if (!TYPES.has(tipo) || !VISIBILITIES.has(visibilidade) || "error" in audience) {
    return Response.json(
      { error: "Tipo, visibilidade ou público autorizado inválido." },
      { status: 400 },
    );
  }
  if (titulo.length < 3 || descricao.length < 10) {
    return Response.json(
      { error: "Informe um título e uma descrição clara." },
      { status: 400 },
    );
  }
  const db = getD1();
  const canBroadcast = access.context.permissions.some((permission) =>
    ["pastoral.panel.view", "community.settings.manage", "platform.admin.view"].includes(permission),
  );
  const resolved = hasExplicitAudience
    ? await resolveAudience({
        db,
        communityId: access.context.comunidadeId,
        requesterId: access.user.id,
        audience: audience.value,
        canBroadcast,
      })
    : await resolveLegacyAudience({
        db,
        communityId: access.context.comunidadeId,
        requesterId: access.user.id,
        visibility: visibilidade,
      });
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 403 });
  }
  if (resolved.userIds.size < 1) {
    return Response.json({ error: "Selecione pelo menos um destinatário autorizado." }, { status: 400 });
  }
  const result = await db
    .prepare(
      `INSERT INTO solicitacoes_comunidade
       (comunidade_id, solicitante_id, tipo, titulo, descricao, visibilidade)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      access.context.comunidadeId,
      access.user.id,
      tipo,
      titulo,
      descricao,
      visibilidade,
    )
    .run();
  const id = Number(result.meta.last_row_id);
  for (const target of audience.value) {
    await db
      .prepare(
        `INSERT INTO solicitacao_publicos
         (solicitacao_id, comunidade_id, tipo, referencia_id, referencia_texto)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, access.context.comunidadeId, target.type, target.id, target.value)
      .run();
  }
  for (const userId of resolved.userIds) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO solicitacao_destinatarios
         (solicitacao_id, comunidade_id, usuario_id)
         VALUES (?, ?, ?)`,
      )
      .bind(id, access.context.comunidadeId, userId)
      .run();
  }
  await Promise.all(
    [...resolved.userIds]
      .filter((userId) => userId !== access.user.id)
      .map((userId) =>
      notifyUser(db, {
        userId,
        title: tipo === "ORACAO" ? "Novo pedido de oração" : "Nova solicitação",
        message: `${access.user.nome} enviou “${titulo}”.`,
        entityId: id,
        area: "SOLICITACOES",
        destination: "/painel?view=solicitacoes",
        createdBy: access.user.email,
      }),
    ),
  );
  await db
    .prepare(
      `UPDATE solicitacao_destinatarios SET notificado_em = CURRENT_TIMESTAMP
       WHERE solicitacao_id = ? AND comunidade_id = ? AND usuario_id != ?`,
    )
    .bind(id, access.context.comunidadeId, access.user.id)
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "SOLICITACAO_COMUNIDADE_CRIADA",
    "SUCESSO",
    { solicitacaoId: id, tipo, visibilidade, destinatarios: resolved.userIds.size },
  );
  return Response.json(
    { id, recipients: resolved.userIds.size },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const canManage = access.context.permissions.some((permission) =>
    ["pastoral.panel.view", "community.settings.manage", "platform.admin.view"].includes(permission),
  );
  if (!canManage || access.context.communityAccess === "FEED_ONLY") {
    return Response.json({ error: "Ação não permitida." }, { status: 403 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  const status = clean(body.status, 30).toUpperCase();
  if (!Number.isInteger(id) || id <= 0 || !STATUSES.has(status)) {
    return Response.json({ error: "Atualização inválida." }, { status: 400 });
  }
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT s.id, s.solicitante_id FROM solicitacoes_comunidade s
       WHERE s.id = ? AND s.comunidade_id = ?
         AND (
           s.solicitante_id = ?
           OR EXISTS (
             SELECT 1 FROM solicitacao_destinatarios sd
             WHERE sd.solicitacao_id = s.id AND sd.comunidade_id = s.comunidade_id
               AND sd.usuario_id = ?
           )
           OR NOT EXISTS (
             SELECT 1 FROM solicitacao_destinatarios legacy
             WHERE legacy.solicitacao_id = s.id
           )
         )`,
    )
    .bind(id, access.context.comunidadeId, access.user.id, access.user.id)
    .first<{ id: number; solicitante_id: number }>();
  if (!row) {
    return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }
  await db
    .prepare(
      `UPDATE solicitacoes_comunidade
       SET status = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ?`,
    )
    .bind(status, id, access.context.comunidadeId)
    .run();
  await notifyUser(db, {
    userId: Number(row.solicitante_id),
    title: "Sua solicitação foi atualizada",
    message: `Novo status: ${status.replaceAll("_", " ").toLowerCase()}.`,
    entityId: id,
    area: "SOLICITACOES",
    createdBy: access.user.email,
  });
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "SOLICITACAO_COMUNIDADE_ATUALIZADA",
    "SUCESSO",
    { solicitacaoId: id, status },
  );
  return Response.json({ ok: true });
}

function clean(value: unknown, length: number) {
  return String(value ?? "").trim().slice(0, length);
}

type AudienceTarget = {
  type: "USUARIO" | "MINISTERIO" | "PAPEL" | "TODOS_MEMBROS";
  id: number | null;
  value: string;
};

function parseAudience(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    return { error: "Selecione de um a quarenta públicos." } as const;
  }
  const result: AudienceTarget[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const source = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const type = clean(source.type, 30).toUpperCase();
    const id = Number(source.id || 0);
    const validId = Number.isInteger(id) && id > 0 ? id : null;
    const rawValue = clean(source.value, 40).toUpperCase();
    if (!AUDIENCE_TYPES.has(type)) return { error: "Público inválido." } as const;
    if (["USUARIO", "MINISTERIO"].includes(type) && !validId) {
      return { error: "Pessoa ou ministério inválido." } as const;
    }
    if (type === "PAPEL" && !ROLES.has(rawValue)) {
      return { error: "Função inválida." } as const;
    }
    const target: AudienceTarget = {
      type: type as AudienceTarget["type"],
      id: validId,
      value: type === "PAPEL" ? rawValue : type === "TODOS_MEMBROS" ? "TODOS" : "",
    };
    const key = `${target.type}:${target.id || target.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(target);
    }
  }
  return { value: result } as const;
}

async function resolveAudience({
  db,
  communityId,
  requesterId,
  audience,
  canBroadcast,
}: {
  db: ReturnType<typeof getD1>;
  communityId: number;
  requesterId: number;
  audience: AudienceTarget[];
  canBroadcast: boolean;
}) {
  const userIds = new Set<number>([requesterId]);
  for (const target of audience) {
    if (target.type === "USUARIO") {
      const user = await db
        .prepare(
          `SELECT u.id FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
           WHERE u.id = ? AND uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1`,
        )
        .bind(target.id, communityId)
        .first<{ id: number }>();
      if (!user) return { error: "Uma pessoa selecionada não pertence à comunidade." } as const;
      userIds.add(Number(user.id));
      continue;
    }
    if (target.type === "MINISTERIO") {
      const ministry = await db
        .prepare(
          `SELECT m.id FROM ministerios_comunidade m
           WHERE m.id = ? AND m.comunidade_id = ? AND m.status = 'ATIVO'
             AND (? = 1 OR m.responsavel_usuario_id = ? OR EXISTS (
               SELECT 1 FROM ministerio_voluntarios own
               WHERE own.ministerio_id = m.id AND own.comunidade_id = m.comunidade_id
                 AND own.usuario_id = ? AND own.ativo = 1
             ))`,
        )
        .bind(target.id, communityId, canBroadcast ? 1 : 0, requesterId, requesterId)
        .first<{ id: number }>();
      if (!ministry) return { error: "Você não pode selecionar este ministério." } as const;
      const members = await db
        .prepare(
          `SELECT DISTINCT mv.usuario_id AS id FROM ministerio_voluntarios mv
           JOIN usuario_comunidades uc ON uc.usuario_id = mv.usuario_id
             AND uc.comunidade_id = mv.comunidade_id AND uc.status = 'ATIVO'
           JOIN usuarios u ON u.id = mv.usuario_id AND u.ativo = 1
           WHERE mv.ministerio_id = ? AND mv.comunidade_id = ? AND mv.ativo = 1`,
        )
        .bind(target.id, communityId)
        .all<{ id: number }>();
      for (const member of members.results) userIds.add(Number(member.id));
      continue;
    }
    if (!canBroadcast) return { error: "Somente gestores podem selecionar funções ou todos os membros." } as const;
    const query = target.type === "TODOS_MEMBROS"
      ? `SELECT u.id FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
         WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1`
      : `SELECT u.id FROM usuario_comunidades uc JOIN usuarios u ON u.id = uc.usuario_id
         WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1 AND uc.papel = ?`;
    const members = target.type === "TODOS_MEMBROS"
      ? await db.prepare(query).bind(communityId).all<{ id: number }>()
      : await db.prepare(query).bind(communityId, target.value).all<{ id: number }>();
    for (const member of members.results) userIds.add(Number(member.id));
  }
  return { userIds } as const;
}

async function resolveLegacyAudience({
  db,
  communityId,
  requesterId,
  visibility,
}: {
  db: ReturnType<typeof getD1>;
  communityId: number;
  requesterId: number;
  visibility: string;
}) {
  const userIds = new Set<number>([requesterId]);
  if (visibility === "PRIVADA") return { userIds } as const;
  const roles = visibility === "PASTORAL"
    ? ["PASTOR", "ADMIN_COMUNIDADE"]
    : ["LIDER", "PASTOR", "ADMIN_COMUNIDADE"];
  const placeholders = roles.map(() => "?").join(", ");
  const managers = await db
    .prepare(
      `SELECT u.id FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
         AND uc.papel IN (${placeholders})`,
    )
    .bind(communityId, ...roles)
    .all<{ id: number }>();
  for (const manager of managers.results) userIds.add(Number(manager.id));
  return { userIds } as const;
}

async function safeJson(request: Request) {
  try { return (await request.json()) as Record<string, unknown>; }
  catch { return null; }
}
