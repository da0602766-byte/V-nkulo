import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";

type Access = Awaited<ReturnType<typeof requireTenantPermission>>;

export async function GET(request: Request) {
  const access = await chatAccess();
  if ("error" in access) return access.error;
  const db = getD1();
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation") || 0);
  const messagesOnly = url.searchParams.get("messagesOnly") === "1";
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));

  if (messagesOnly && Number.isInteger(conversationId) && conversationId > 0) {
    const owned = await ownedConversation(access, conversationId);
    if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    const result = await db.prepare(
      `SELECT mp.id, mp.remetente_id, mp.mensagem, mp.lida_em, mp.criado_em,
        u.nome AS remetente_nome,
        CASE
          WHEN u.perfil = 'ADMIN' THEN 'Proprietário do sistema'
          WHEN uc.papel = 'ADMIN_COMUNIDADE' THEN 'Administrador da comunidade'
          WHEN uc.papel = 'PASTOR' THEN 'Pastor'
          WHEN uc.papel = 'LIDER' THEN 'Líder'
          ELSE 'Membro'
        END AS hierarquia,
        COALESCE((SELECT group_concat(DISTINCT m.nome)
          FROM ministerio_voluntarios mv
          JOIN ministerios_comunidade m ON m.id = mv.ministerio_id
          WHERE mv.usuario_id = u.id AND mv.comunidade_id = c.comunidade_id
            AND mv.ativo = 1 AND m.status = 'ATIVO'), '') AS ministerio
       FROM mensagens_privadas mp
       JOIN conversas_privadas c ON c.id = mp.conversa_id
       JOIN usuarios u ON u.id = mp.remetente_id
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id
         AND uc.comunidade_id = c.comunidade_id
       WHERE mp.conversa_id = ? AND mp.id > ?
       ORDER BY mp.id ASC LIMIT 100`,
    ).bind(conversationId, after).all<Record<string, unknown>>();
    return Response.json(
      { messages: result.results, currentUserId: access.user.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const communicationGroup = await communicationClass(
    access.user.id,
    access.context.comunidadeId,
  );
  const [people, conversations] = await Promise.all([
    db.prepare(
      `SELECT u.id, u.nome, u.foto_perfil,
        CASE
          WHEN u.perfil = 'ADMIN' THEN 'Proprietário do sistema'
          WHEN uc.papel = 'ADMIN_COMUNIDADE' THEN 'Administrador da comunidade'
          WHEN uc.papel = 'PASTOR' THEN 'Pastor'
          WHEN uc.papel = 'LIDER' THEN 'Líder'
          ELSE 'Membro'
        END AS hierarquia,
        COALESCE((
          SELECT group_concat(DISTINCT m.nome)
          FROM ministerio_voluntarios mv
          JOIN ministerios_comunidade m ON m.id = mv.ministerio_id
          WHERE mv.usuario_id = u.id AND mv.comunidade_id = uc.comunidade_id
            AND mv.ativo = 1 AND m.status = 'ATIVO'
        ), '') AS ministerio,
        CASE WHEN EXISTS (
          SELECT 1 FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = uc.comunidade_id
            AND datetime(pc.ultima_atividade) >= datetime('now', '-5 minutes')
        ) THEN 1 ELSE 0 END AS online
       FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
         AND u.id <> ?
         AND (CASE
           WHEN u.perfil = 'ADMIN'
             OR uc.papel IN ('ADMIN_COMUNIDADE', 'PASTOR', 'LIDER')
             OR EXISTS (SELECT 1 FROM oficiais_comunidade oc2 WHERE oc2.usuario_comunidade_id = uc.id)
           THEN 'OFICIAL' ELSE 'MEMBRO' END) = ?
       ORDER BY u.nome LIMIT 200`,
    ).bind(access.context.comunidadeId, access.user.id, communicationGroup).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT c.id, c.atualizado_em,
        u.id AS participante_id, u.nome AS participante_nome,
        u.foto_perfil AS participante_foto,
        CASE
          WHEN u.perfil = 'ADMIN' THEN 'Proprietário do sistema'
          WHEN uc.papel = 'ADMIN_COMUNIDADE' THEN 'Administrador da comunidade'
          WHEN uc.papel = 'PASTOR' THEN 'Pastor'
          WHEN uc.papel = 'LIDER' THEN 'Líder'
          ELSE 'Membro'
        END AS hierarquia,
        COALESCE((
          SELECT group_concat(DISTINCT m.nome)
          FROM ministerio_voluntarios mv
          JOIN ministerios_comunidade m ON m.id = mv.ministerio_id
          WHERE mv.usuario_id = u.id AND mv.comunidade_id = c.comunidade_id
            AND mv.ativo = 1 AND m.status = 'ATIVO'
        ), '') AS ministerio,
        CASE WHEN EXISTS (
          SELECT 1 FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = c.comunidade_id
            AND datetime(pc.ultima_atividade) >= datetime('now', '-5 minutes')
        ) THEN 1 ELSE 0 END AS online,
        COALESCE((SELECT mp.mensagem FROM mensagens_privadas mp
          WHERE mp.conversa_id = c.id ORDER BY mp.id DESC LIMIT 1), '') AS ultima_mensagem,
        (SELECT COUNT(*) FROM mensagens_privadas mp
          WHERE mp.conversa_id = c.id AND mp.remetente_id <> ? AND mp.lida_em IS NULL) AS nao_lidas
       FROM conversas_privadas c
       JOIN usuarios u ON u.id = CASE WHEN c.usuario_menor_id = ?
         THEN c.usuario_maior_id ELSE c.usuario_menor_id END
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id
         AND uc.comunidade_id = c.comunidade_id AND uc.status = 'ATIVO'
       WHERE c.comunidade_id = ? AND c.ciclo_mes = strftime('%Y-%m','now')
         AND (? IN (c.usuario_menor_id, c.usuario_maior_id))
         AND (CASE
           WHEN u.perfil = 'ADMIN'
             OR uc.papel IN ('ADMIN_COMUNIDADE', 'PASTOR', 'LIDER')
             OR EXISTS (SELECT 1 FROM oficiais_comunidade oc2 WHERE oc2.usuario_comunidade_id = uc.id)
           THEN 'OFICIAL' ELSE 'MEMBRO' END) = ?
       ORDER BY c.atualizado_em DESC LIMIT 100`,
    ).bind(
      access.user.id,
      access.user.id,
      access.context.comunidadeId,
      access.user.id,
      communicationGroup,
    ).all<Record<string, unknown>>(),
  ]);

  let messages: Record<string, unknown>[] = [];
  if (Number.isInteger(conversationId) && conversationId > 0) {
    const owned = await ownedConversation(access, conversationId);
    if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    const result = await db.prepare(
      `SELECT mp.id, mp.remetente_id, mp.mensagem, mp.lida_em, mp.criado_em,
        u.nome AS remetente_nome,
        CASE
          WHEN u.perfil = 'ADMIN' THEN 'Proprietário do sistema'
          WHEN uc.papel = 'ADMIN_COMUNIDADE' THEN 'Administrador da comunidade'
          WHEN uc.papel = 'PASTOR' THEN 'Pastor'
          WHEN uc.papel = 'LIDER' THEN 'Líder'
          ELSE 'Membro'
        END AS hierarquia,
        COALESCE((SELECT group_concat(DISTINCT m.nome)
          FROM ministerio_voluntarios mv
          JOIN ministerios_comunidade m ON m.id = mv.ministerio_id
          WHERE mv.usuario_id = u.id AND mv.comunidade_id = c.comunidade_id
            AND mv.ativo = 1 AND m.status = 'ATIVO'), '') AS ministerio
       FROM mensagens_privadas mp
       JOIN conversas_privadas c ON c.id = mp.conversa_id
       JOIN usuarios u ON u.id = mp.remetente_id
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id
         AND uc.comunidade_id = c.comunidade_id
       WHERE mp.conversa_id = ? ORDER BY mp.id ASC LIMIT 300`,
    ).bind(conversationId).all<Record<string, unknown>>();
    messages = result.results;
  }

  return Response.json({
    people: people.results,
    conversations: conversations.results,
    messages,
    currentUserId: access.user.id,
    communicationGroup,
    cycle: new Date().toISOString().slice(0, 7),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await chatAccess();
  if ("error" in access) return access.error;
  const payload = await safeJson(request);
  if (!payload) return badRequest("Dados inválidos.");
  const targetUserId = Number(payload.targetUserId || 0);
  const message = String(payload.message || "").trim();
  if (!Number.isInteger(targetUserId) || targetUserId <= 0 || targetUserId === access.user.id) {
    return badRequest("Selecione outro usuário ativo.");
  }
  if (message && (message.length < 1 || message.length > 2000)) {
    return badRequest("A mensagem deve ter até 2.000 caracteres.");
  }
  const db = getD1();
  const communicationGroup = await communicationClass(
    access.user.id,
    access.context.comunidadeId,
  );
  const target = await db.prepare(
    `SELECT u.id, u.nome,
      CASE
        WHEN u.perfil = 'ADMIN' THEN 'Proprietário do sistema'
        WHEN uc.papel = 'ADMIN_COMUNIDADE' THEN 'Administrador da comunidade'
        WHEN uc.papel = 'PASTOR' THEN 'Pastor'
        WHEN uc.papel = 'LIDER' THEN 'Líder'
        ELSE 'Membro'
      END AS hierarquia
      , CASE
        WHEN u.perfil = 'ADMIN'
          OR uc.papel IN ('ADMIN_COMUNIDADE', 'PASTOR', 'LIDER')
          OR EXISTS (SELECT 1 FROM oficiais_comunidade oc2 WHERE oc2.usuario_comunidade_id = uc.id)
        THEN 'OFICIAL' ELSE 'MEMBRO' END AS communication_group
     FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE u.id = ? AND u.ativo = 1 AND uc.comunidade_id = ?
       AND uc.status = 'ATIVO' LIMIT 1`,
  ).bind(targetUserId, access.context.comunidadeId).first<{ id: number; nome: string; hierarquia: string; communication_group: string }>();
  if (!target) return Response.json({ error: "Usuário indisponível nesta comunidade." }, { status: 404 });
  if (target.communication_group !== communicationGroup) {
    return Response.json(
      { error: "Membros conversam somente com membros; oficiais conversam somente com oficiais." },
      { status: 403 },
    );
  }

  const low = Math.min(access.user.id, targetUserId);
  const high = Math.max(access.user.id, targetUserId);
  await db.prepare(
    `INSERT OR IGNORE INTO conversas_privadas
     (comunidade_id, usuario_menor_id, usuario_maior_id, ciclo_mes)
     VALUES (?, ?, ?, strftime('%Y-%m','now'))`,
  ).bind(access.context.comunidadeId, low, high).run();
  const conversation = await db.prepare(
    `SELECT id FROM conversas_privadas WHERE comunidade_id = ?
      AND usuario_menor_id = ? AND usuario_maior_id = ?
      AND ciclo_mes = strftime('%Y-%m','now') LIMIT 1`,
  ).bind(access.context.comunidadeId, low, high).first<{ id: number }>();
  if (!conversation) return Response.json({ error: "Não foi possível abrir a conversa." }, { status: 500 });

  if (message) {
    const insert = await db.batch([
      db.prepare(
        `INSERT INTO mensagens_privadas (conversa_id, remetente_id, mensagem)
         VALUES (?, ?, ?)`,
      ).bind(conversation.id, access.user.id, message),
      db.prepare(
        `UPDATE conversas_privadas SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(conversation.id),
    ]);
    const sender = await senderMetadata(access.user.id, access.context.comunidadeId);
    const messageId = Number(insert[0].meta.last_row_id || 0);
    return Response.json(
      {
        ok: true,
        conversationId: conversation.id,
        message: {
          id: messageId,
          remetente_id: access.user.id,
          remetente_nome: sender.name,
          mensagem: message,
          hierarquia: sender.hierarchy,
          ministerio: sender.ministry,
          criado_em: new Date().toISOString(),
          lida_em: null,
        },
      },
      { status: 201 },
    );
  }
  return Response.json({ ok: true, conversationId: conversation.id }, { status: 200 });
}

export async function PATCH(request: Request) {
  const access = await chatAccess();
  if ("error" in access) return access.error;
  const payload = await safeJson(request);
  const conversationId = Number(payload?.conversationId || 0);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return badRequest("Conversa inválida.");
  const owned = await ownedConversation(access, conversationId);
  if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
  await getD1().prepare(
    `UPDATE mensagens_privadas SET lida_em = CURRENT_TIMESTAMP
     WHERE conversa_id = ? AND remetente_id <> ? AND lida_em IS NULL`,
  ).bind(conversationId, access.user.id).run();
  return Response.json({ ok: true });
}

async function chatAccess() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access;
  if (access.context.communityAccess === "FEED_ONLY") {
    return { error: Response.json({ error: "Mensagens privadas exigem vínculo ativo com a comunidade." }, { status: 403 }) };
  }
  return access;
}

async function ownedConversation(access: Exclude<Access, { error: Response }>, id: number) {
  const row = await getD1().prepare(
    `SELECT id,
      CASE WHEN usuario_menor_id = ? THEN usuario_maior_id ELSE usuario_menor_id END AS other_user_id
     FROM conversas_privadas WHERE id = ? AND comunidade_id = ?
      AND ciclo_mes = strftime('%Y-%m','now')
      AND (? IN (usuario_menor_id, usuario_maior_id)) LIMIT 1`,
  ).bind(access.user.id, id, access.context.comunidadeId, access.user.id).first<{ id: number; other_user_id: number }>();
  if (!row) return null;
  const [currentGroup, otherGroup] = await Promise.all([
    communicationClass(access.user.id, access.context.comunidadeId),
    communicationClass(row.other_user_id, access.context.comunidadeId),
  ]);
  return currentGroup === otherGroup ? row : null;
}

async function communicationClass(userId: number, communityId: number) {
  const row = await getD1().prepare(
    `SELECT CASE
      WHEN u.perfil = 'ADMIN'
        OR uc.papel IN ('ADMIN_COMUNIDADE', 'PASTOR', 'LIDER')
        OR EXISTS (SELECT 1 FROM oficiais_comunidade oc WHERE oc.usuario_comunidade_id = uc.id)
      THEN 'OFICIAL' ELSE 'MEMBRO' END AS communication_group
     FROM usuarios u
     JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE u.id = ? AND u.ativo = 1 AND uc.comunidade_id = ?
       AND uc.status = 'ATIVO' LIMIT 1`,
  ).bind(userId, communityId).first<{ communication_group: "MEMBRO" | "OFICIAL" }>();
  return row?.communication_group || "MEMBRO";
}

async function senderMetadata(userId: number, communityId: number) {
  const row = await getD1().prepare(
    `SELECT u.nome,
      CASE
        WHEN u.perfil = 'ADMIN' THEN 'Proprietário do sistema'
        WHEN uc.papel = 'ADMIN_COMUNIDADE' THEN 'Administrador da comunidade'
        WHEN uc.papel = 'PASTOR' THEN 'Pastor'
        WHEN uc.papel = 'LIDER' THEN 'Líder'
        ELSE 'Membro'
      END AS hierarquia,
      COALESCE((SELECT group_concat(DISTINCT m.nome)
        FROM ministerio_voluntarios mv
        JOIN ministerios_comunidade m ON m.id = mv.ministerio_id
        WHERE mv.usuario_id = u.id AND mv.comunidade_id = uc.comunidade_id
          AND mv.ativo = 1 AND m.status = 'ATIVO'), '') AS ministerio
     FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE u.id = ? AND uc.comunidade_id = ? LIMIT 1`,
  ).bind(userId, communityId).first<{ nome: string; hierarquia: string; ministerio: string }>();
  return { name: row?.nome || "Usuário", hierarchy: row?.hierarquia || "Membro", ministry: row?.ministerio || "" };
}

async function safeJson(request: Request) {
  try { return (await request.json()) as Record<string, unknown>; }
  catch { return null; }
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}
