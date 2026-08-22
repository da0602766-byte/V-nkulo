import { getD1 } from "../../../../../db";
import {
  ensureRequestRepositorySuggestions,
  normalizeWhatsappNumber,
} from "../../../../lib/request-repositories";
import { notifyUser } from "../../../../lib/pilot-notifications";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

const REPOSITORY_TYPES = new Set(["ORACAO", "VISITA"]);
const ITEM_STATUSES = new Set(["ABERTO", "EM_ACOMPANHAMENTO", "CONCLUIDO"]);

export async function GET() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  if (access.context.communityAccess === "FEED_ONLY") {
    return Response.json({ error: "Ação não permitida." }, { status: 403 });
  }

  const db = getD1();
  const communityId = access.context.comunidadeId;
  const userId = access.user.id;
  const canManageRepositories = hasGlobalRepositoryAccess(access.context.permissions);
  const canConfigureWhatsapp = access.context.papel === "PASTOR";

  await ensureRequestRepositorySuggestions(db, communityId);

  const [repositories, items, ministries, contacts, preference, currentUser] = await Promise.all([
    db.prepare(
      `SELECT r.id, r.tipo, r.nome, r.status, r.ministerio_id,
        COALESCE(m.nome, '') AS ministerio_nome,
        CASE WHEN m.responsavel_usuario_id = ? THEN 1 ELSE 0 END AS responsavel
       FROM solicitacao_repositorios r
       LEFT JOIN ministerios_comunidade m
         ON m.id = r.ministerio_id AND m.comunidade_id = r.comunidade_id
       WHERE r.comunidade_id = ?
         AND (
           ? = 1
           OR (r.status = 'ATIVO' AND m.responsavel_usuario_id = ?)
         )
       ORDER BY CASE r.status WHEN 'SUGERIDO' THEN 0 ELSE 1 END, r.tipo`,
    ).bind(userId, communityId, canManageRepositories ? 1 : 0, userId).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT ri.id, ri.repositorio_id, ri.status AS item_status,
        s.id AS solicitacao_id, s.tipo, s.titulo, s.descricao,
        s.status AS solicitacao_status, s.criado_em,
        u.nome AS solicitante_nome, COALESCE(u.telefone, '') AS solicitante_telefone
       FROM solicitacao_repositorio_itens ri
       JOIN solicitacao_repositorios r
         ON r.id = ri.repositorio_id AND r.comunidade_id = ri.comunidade_id
       JOIN solicitacoes_comunidade s
         ON s.id = ri.solicitacao_id AND s.comunidade_id = ri.comunidade_id
       JOIN usuarios u ON u.id = s.solicitante_id
       LEFT JOIN ministerios_comunidade m
         ON m.id = r.ministerio_id AND m.comunidade_id = r.comunidade_id
       WHERE ri.comunidade_id = ?
         AND r.status = 'ATIVO'
         AND (? = 1 OR m.responsavel_usuario_id = ?)
       ORDER BY CASE ri.status WHEN 'ABERTO' THEN 0 WHEN 'EM_ACOMPANHAMENTO' THEN 1 ELSE 2 END,
         ri.id DESC
       LIMIT 200`,
    ).bind(communityId, canManageRepositories ? 1 : 0, userId).all<Record<string, unknown>>(),
    canManageRepositories
      ? db.prepare(
          `SELECT id, nome FROM ministerios_comunidade
           WHERE comunidade_id = ? AND status = 'ATIVO'
           ORDER BY nome ASC LIMIT 100`,
        ).bind(communityId).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    db.prepare(
      `SELECT u.id, u.nome, u.foto_perfil, u.telefone
       FROM pastor_whatsapp_preferencias p
       JOIN usuarios u ON u.id = p.usuario_id AND u.ativo = 1
       JOIN usuario_comunidades uc
         ON uc.usuario_id = u.id AND uc.comunidade_id = p.comunidade_id
         AND uc.status = 'ATIVO' AND uc.papel = 'PASTOR'
       WHERE p.comunidade_id = ? AND p.disponivel = 1
       ORDER BY u.nome ASC`,
    ).bind(communityId).all<{
      id: number;
      nome: string;
      foto_perfil: string | null;
      telefone: string | null;
    }>(),
    db.prepare(
      `SELECT disponivel FROM pastor_whatsapp_preferencias
       WHERE comunidade_id = ? AND usuario_id = ? LIMIT 1`,
    ).bind(communityId, userId).first<{ disponivel: number }>(),
    db.prepare(
      `SELECT COALESCE(telefone, '') AS telefone FROM usuarios WHERE id = ? LIMIT 1`,
    ).bind(userId).first<{ telefone: string }>(),
  ]);

  const itemsByRepository = new Map<number, Record<string, unknown>[]>();
  for (const item of items.results) {
    const repositoryId = Number(item.repositorio_id);
    const collection = itemsByRepository.get(repositoryId) || [];
    collection.push(item);
    itemsByRepository.set(repositoryId, collection);
  }

  return Response.json(
    {
      canManageRepositories,
      whatsappPreference: {
        canConfigure: canConfigureWhatsapp,
        enabled: Boolean(preference?.disponivel),
        hasPhone: Boolean(normalizeWhatsappNumber(currentUser?.telefone)),
      },
      pastoresContato: contacts.results.flatMap((contact) => {
        const number = normalizeWhatsappNumber(contact.telefone);
        if (!number) return [];
        return [{
          id: Number(contact.id),
          nome: contact.nome,
          foto: contact.foto_perfil || "",
          whatsappUrl: `https://wa.me/${number}`,
        }];
      }),
      ministries: ministries.results,
      repositories: repositories.results.map((repository) => ({
        ...repository,
        items: itemsByRepository.get(Number(repository.id)) || [],
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  if (access.context.communityAccess === "FEED_ONLY") {
    return Response.json({ error: "Ação não permitida." }, { status: 403 });
  }
  const body = await safeJson(request);
  if (!body) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const action = clean(body.action, 40).toUpperCase();
  const db = getD1();
  const communityId = access.context.comunidadeId;
  const userId = access.user.id;
  const globalAccess = hasGlobalRepositoryAccess(access.context.permissions);

  if (action === "TOGGLE_WHATSAPP") {
    if (access.context.papel !== "PASTOR") {
      return Response.json({ error: "Somente pastores podem disponibilizar esse contato." }, { status: 403 });
    }
    const enabled = body.enabled === true;
    const user = await db.prepare(
      `SELECT telefone FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1`,
    ).bind(userId).first<{ telefone: string | null }>();
    if (enabled && !normalizeWhatsappNumber(user?.telefone)) {
      return Response.json(
        { error: "Cadastre um telefone válido no perfil antes de liberar o WhatsApp." },
        { status: 400 },
      );
    }
    await db.prepare(
      `INSERT INTO pastor_whatsapp_preferencias
       (comunidade_id, usuario_id, disponivel, atualizado_em)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(comunidade_id, usuario_id) DO UPDATE SET
         disponivel = excluded.disponivel,
         atualizado_em = CURRENT_TIMESTAMP`,
    ).bind(communityId, userId, enabled ? 1 : 0).run();
    await recordTenantAudit(db, access.context, userId, "PASTOR_WHATSAPP_ATUALIZADO", "SUCESSO", { enabled });
    return Response.json({ ok: true });
  }

  if (action === "CONFIRMAR_REPOSITORIO") {
    if (!globalAccess) {
      return Response.json({ error: "Permissão insuficiente para criar o repositório." }, { status: 403 });
    }
    const repositoryId = positiveInteger(body.repositoryId);
    const ministryId = body.ministryId ? positiveInteger(body.ministryId) : null;
    if (!repositoryId) return Response.json({ error: "Repositório inválido." }, { status: 400 });
    const repository = await db.prepare(
      `SELECT id, tipo, status FROM solicitacao_repositorios
       WHERE id = ? AND comunidade_id = ? LIMIT 1`,
    ).bind(repositoryId, communityId).first<{ id: number; tipo: string; status: string }>();
    if (!repository || !REPOSITORY_TYPES.has(repository.tipo)) {
      return Response.json({ error: "Repositório não encontrado nesta comunidade." }, { status: 404 });
    }
    if (ministryId) {
      const ministry = await db.prepare(
        `SELECT id FROM ministerios_comunidade
         WHERE id = ? AND comunidade_id = ? AND status = 'ATIVO' LIMIT 1`,
      ).bind(ministryId, communityId).first<{ id: number }>();
      if (!ministry) return Response.json({ error: "Ministério inválido para esta comunidade." }, { status: 400 });
    }
    await db.prepare(
      `UPDATE solicitacao_repositorios
       SET status = 'ATIVO', ministerio_id = ?, confirmado_por = ?,
         confirmado_em = COALESCE(confirmado_em, CURRENT_TIMESTAMP), atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ?`,
    ).bind(ministryId, userId, repositoryId, communityId).run();
    await recordTenantAudit(db, access.context, userId, "REPOSITORIO_PEDIDOS_CONFIRMADO", "SUCESSO", {
      repositoryId, tipo: repository.tipo, ministryId,
    });
    return Response.json({ ok: true });
  }

  if (action === "ENCAMINHAR_REPOSITORIO") {
    const repositoryId = positiveInteger(body.repositoryId);
    const requestId = positiveInteger(body.requestId);
    if (!repositoryId || !requestId) {
      return Response.json({ error: "Solicitação ou repositório inválido." }, { status: 400 });
    }
    const repository = await getAuthorizedRepository(db, {
      repositoryId, communityId, userId, globalAccess,
    });
    if (!repository) return Response.json({ error: "Repositório não autorizado." }, { status: 403 });
    const item = await db.prepare(
      `SELECT id, tipo, solicitante_id, titulo FROM solicitacoes_comunidade
       WHERE id = ? AND comunidade_id = ?
         AND (
           solicitante_id = ?
           OR EXISTS (
             SELECT 1 FROM solicitacao_destinatarios sd
             WHERE sd.solicitacao_id = solicitacoes_comunidade.id
               AND sd.comunidade_id = solicitacoes_comunidade.comunidade_id
               AND sd.usuario_id = ?
           )
           OR (? = 1 AND NOT EXISTS (
             SELECT 1 FROM solicitacao_destinatarios legacy
             WHERE legacy.solicitacao_id = solicitacoes_comunidade.id
           ))
         )
       LIMIT 1`,
    ).bind(requestId, communityId, userId, userId, globalAccess ? 1 : 0).first<{
      id: number; tipo: string; solicitante_id: number; titulo: string;
    }>();
    if (!item || item.tipo !== repository.tipo) {
      return Response.json({ error: "A solicitação não corresponde a este repositório." }, { status: 400 });
    }
    await db.prepare(
      `INSERT OR IGNORE INTO solicitacao_repositorio_itens
       (repositorio_id, comunidade_id, solicitacao_id, encaminhado_por)
       VALUES (?, ?, ?, ?)`,
    ).bind(repositoryId, communityId, requestId, userId).run();
    await db.prepare(
      `UPDATE solicitacoes_comunidade SET status = 'EM_ANALISE', atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ?`,
    ).bind(requestId, communityId).run();
    await notifyUser(db, {
      userId: Number(item.solicitante_id),
      title: "Pedido encaminhado para acompanhamento",
      message: `“${item.titulo}” foi encaminhado ao ${repository.nome}.`,
      entityId: requestId,
      area: "SOLICITACOES",
      destination: "/painel?view=solicitacoes",
      createdBy: access.user.email,
    });
    await recordTenantAudit(db, access.context, userId, "PEDIDO_ENCAMINHADO_REPOSITORIO", "SUCESSO", {
      repositoryId, requestId,
    });
    return Response.json({ ok: true });
  }

  if (action === "ATUALIZAR_ITEM") {
    const itemId = positiveInteger(body.itemId);
    const status = clean(body.status, 30).toUpperCase();
    if (!itemId || !ITEM_STATUSES.has(status)) {
      return Response.json({ error: "Atualização inválida." }, { status: 400 });
    }
    const item = await db.prepare(
      `SELECT ri.id, ri.repositorio_id, ri.solicitacao_id, s.solicitante_id
       FROM solicitacao_repositorio_itens ri
       JOIN solicitacoes_comunidade s
         ON s.id = ri.solicitacao_id AND s.comunidade_id = ri.comunidade_id
       WHERE ri.id = ? AND ri.comunidade_id = ? LIMIT 1`,
    ).bind(itemId, communityId).first<{
      id: number; repositorio_id: number; solicitacao_id: number; solicitante_id: number;
    }>();
    if (!item) return Response.json({ error: "Item não encontrado." }, { status: 404 });
    const repository = await getAuthorizedRepository(db, {
      repositoryId: item.repositorio_id, communityId, userId, globalAccess,
    });
    if (!repository) return Response.json({ error: "Repositório não autorizado." }, { status: 403 });
    await db.prepare(
      `UPDATE solicitacao_repositorio_itens
       SET status = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ?`,
    ).bind(status, itemId, communityId).run();
    await db.prepare(
      `UPDATE solicitacoes_comunidade
       SET status = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND comunidade_id = ?`,
    ).bind(status === "CONCLUIDO" ? "CONCLUIDA" : "EM_ANALISE", item.solicitacao_id, communityId).run();
    await notifyUser(db, {
      userId: Number(item.solicitante_id),
      title: "Acompanhamento atualizado",
      message: status === "CONCLUIDO" ? "Seu pedido foi concluído." : "Seu pedido está em acompanhamento.",
      entityId: item.solicitacao_id,
      area: "SOLICITACOES",
      destination: "/painel?view=solicitacoes",
      createdBy: access.user.email,
    });
    await recordTenantAudit(db, access.context, userId, "ITEM_REPOSITORIO_ATUALIZADO", "SUCESSO", {
      itemId, status,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });
}

function hasGlobalRepositoryAccess(permissions: string[]) {
  return permissions.some((permission) =>
    ["pastoral.panel.view", "community.settings.manage", "platform.admin.view"].includes(permission),
  );
}

async function getAuthorizedRepository(
  db: ReturnType<typeof getD1>,
  input: {
    repositoryId: number;
    communityId: number;
    userId: number;
    globalAccess: boolean;
  },
) {
  return db.prepare(
    `SELECT r.id, r.tipo, r.nome, r.ministerio_id
     FROM solicitacao_repositorios r
     LEFT JOIN ministerios_comunidade m
       ON m.id = r.ministerio_id AND m.comunidade_id = r.comunidade_id
     WHERE r.id = ? AND r.comunidade_id = ? AND r.status = 'ATIVO'
       AND (? = 1 OR m.responsavel_usuario_id = ?)
     LIMIT 1`,
  ).bind(input.repositoryId, input.communityId, input.globalAccess ? 1 : 0, input.userId).first<{
    id: number;
    tipo: string;
    nome: string;
    ministerio_id: number | null;
  }>();
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clean(value: unknown, length: number) {
  return String(value ?? "").trim().slice(0, length);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}
