import { getD1 } from "../../../../db";
import { CHAT_RETENTION_NOTICE, nextWeeklyPurgeAt } from "../../../lib/chat-retention";
import { requireTenantPermission } from "../../../lib/tenant";
import { scheduleWebPushDelivery } from "../../../lib/push-delivery-queue";

type Access = Awaited<ReturnType<typeof requireTenantPermission>>;
type ValidAccess = Exclude<Access, { error: Response }>;
type Message = {
  id: number;
  remetente_id: number;
  remetente_nome: string;
  mensagem: string;
  hierarquia: string;
  ministerio: string;
  criado_em: string;
  entregue_em: string | null;
  lida_em: string | null;
};

// Perfil de quem manda a mensagem: mesma hierarquia usada em toda a
// comunidade (dono > administrador > pastor > líder > membro) e os
// ministérios ativos em que a pessoa atua, para dar contexto profissional à
// conversa sem expor mais dados do que isso.
const HIERARCHY_CASE = `CASE
  WHEN uc.papel IN ('ADMIN_COMUNIDADE', 'SUPERADMIN') THEN 'Administrador da comunidade'
  WHEN uc.papel = 'PASTOR' THEN 'Pastor'
  WHEN uc.papel = 'LIDER' THEN 'Líder'
  ELSE 'Membro'
END`;
const MINISTRY_SUBQUERY = (userColumn: string, communityColumn: string) => `COALESCE((
  SELECT group_concat(DISTINCT m.nome)
  FROM ministerio_voluntarios mv
  JOIN ministerios_comunidade m ON m.id = mv.ministerio_id
  WHERE mv.usuario_id = ${userColumn} AND mv.comunidade_id = ${communityColumn}
    AND mv.ativo = 1 AND m.status = 'ATIVO'
), '')`;
const COMMUNICATION_GROUP_CASE = `CASE
  WHEN uc.papel IN ('ADMIN_COMUNIDADE', 'SUPERADMIN', 'PASTOR', 'LIDER')
    OR EXISTS (SELECT 1 FROM oficiais_comunidade oc2 WHERE oc2.usuario_comunidade_id = uc.id)
  THEN 'OFICIAL' ELSE 'MEMBRO' END`;

export async function GET(request: Request) {
  const access = await chatAccess();
  if ("error" in access) return access.error;
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation") || 0);
  const messagesOnly = url.searchParams.get("messagesOnly") === "1";

  if (messagesOnly && Number.isInteger(conversationId) && conversationId > 0) {
    const owned = await ownedConversation(access, conversationId);
    if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    const messages = await loadMessages(access, conversationId);
    return Response.json(
      { messages, currentUserId: access.user.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const communicationGroup = await communicationClass(access.user.id, access.context.comunidadeId);
  const [people, conversations, notificationPreference] = await Promise.all([
    getD1().prepare(
      `SELECT u.id, u.nome, u.foto_perfil,
        ${HIERARCHY_CASE} AS hierarquia,
        ${MINISTRY_SUBQUERY("u.id", "uc.comunidade_id")} AS ministerio,
        CASE WHEN EXISTS (
          SELECT 1 FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = uc.comunidade_id
            AND datetime(pc.ultima_atividade) >= datetime('now', '-5 minutes')
        ) THEN 1 ELSE 0 END AS online,
        (SELECT pc.ultima_atividade FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = uc.comunidade_id) AS ultima_atividade,
        (SELECT pc.exibir_ultima_atividade FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = uc.comunidade_id) AS exibir_ultima_atividade
       FROM usuario_comunidades uc
       JOIN usuarios u ON u.id = uc.usuario_id
       WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO' AND u.ativo = 1
         AND u.id <> ?
         AND (${COMMUNICATION_GROUP_CASE}) = ?
       ORDER BY u.nome LIMIT 200`,
    ).bind(access.context.comunidadeId, access.user.id, communicationGroup).all<Record<string, unknown>>(),
    getD1().prepare(
      `SELECT c.id, c.atualizado_em,
        u.id AS participante_id, u.nome AS participante_nome,
        u.foto_perfil AS participante_foto,
        ${HIERARCHY_CASE} AS hierarquia,
        ${MINISTRY_SUBQUERY("u.id", "c.comunidade_id")} AS ministerio,
        CASE WHEN EXISTS (
          SELECT 1 FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = c.comunidade_id
            AND datetime(pc.ultima_atividade) >= datetime('now', '-5 minutes')
        ) THEN 1 ELSE 0 END AS online,
        (SELECT pc.ultima_atividade FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = c.comunidade_id) AS ultima_atividade,
        (SELECT pc.exibir_ultima_atividade FROM presencas_comunidade pc
          WHERE pc.usuario_id = u.id AND pc.comunidade_id = c.comunidade_id) AS exibir_ultima_atividade,
        (SELECT mp.mensagem FROM mensagens_privadas mp
          WHERE mp.conversa_id = c.id ORDER BY mp.id DESC LIMIT 1) AS ultima_mensagem,
        (SELECT mp.remetente_id FROM mensagens_privadas mp
          WHERE mp.conversa_id = c.id ORDER BY mp.id DESC LIMIT 1) AS ultimo_remetente_id,
        (SELECT mp.id FROM mensagens_privadas mp
          WHERE mp.conversa_id = c.id AND mp.remetente_id <> ? AND mp.lida_em IS NULL ORDER BY mp.id DESC LIMIT 1) AS ultima_recebida_id,
        (SELECT mp.mensagem FROM mensagens_privadas mp
          WHERE mp.conversa_id = c.id AND mp.remetente_id <> ? AND mp.lida_em IS NULL ORDER BY mp.id DESC LIMIT 1) AS ultima_recebida,
        (SELECT COUNT(*) FROM mensagens_privadas mp
          WHERE mp.conversa_id = c.id AND mp.remetente_id <> ? AND mp.lida_em IS NULL) AS nao_lidas
       FROM conversas_privadas c
       JOIN usuarios u ON u.id = CASE WHEN c.usuario_menor_id = ?
         THEN c.usuario_maior_id ELSE c.usuario_menor_id END
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id
         AND uc.comunidade_id = c.comunidade_id AND uc.status = 'ATIVO'
       WHERE c.comunidade_id = ? AND c.ciclo_semana = strftime('%Y-%W','now')
         AND (? IN (c.usuario_menor_id, c.usuario_maior_id))
         AND (${COMMUNICATION_GROUP_CASE}) = ?
       ORDER BY c.atualizado_em DESC LIMIT 100`,
    ).bind(access.user.id, access.user.id, access.user.id, access.user.id, access.context.comunidadeId, access.user.id, communicationGroup).all<Record<string, unknown>>(),
    getD1().prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
      .bind(`notification_preferences:${access.user.id}`).first<{ valor: string }>(),
  ]);

  let messageNotificationsEnabled = true;
  try { messageNotificationsEnabled = JSON.parse(notificationPreference?.valor || "{}").mensagens !== false; } catch { /* Same default as notification settings. */ }

  let messages: Message[] = [];
  if (Number.isInteger(conversationId) && conversationId > 0) {
    const owned = await ownedConversation(access, conversationId);
    if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    messages = await loadMessages(access, conversationId);
  }

  return Response.json({
    people: people.results.map(withLastSeen),
    conversations: conversations.results.map(withLastSeen),
    messages,
    currentUserId: access.user.id,
    communicationGroup,
    messageNotificationsEnabled,
    retentionNotice: CHAT_RETENTION_NOTICE,
    nextPurgeAt: nextWeeklyPurgeAt().toISOString(),
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
  if (message.length > 2000) return badRequest("A mensagem deve ter até 2.000 caracteres.");
  const communicationGroup = await communicationClass(access.user.id, access.context.comunidadeId);
  const target = await targetMetadata(targetUserId, access.context.comunidadeId);
  if (!target) return Response.json({ error: "Usuário indisponível nesta comunidade." }, { status: 404 });
  if (target.communication_group !== communicationGroup) {
    return Response.json({ error: "Membros conversam somente com membros; oficiais conversam somente com oficiais." }, { status: 403 });
  }

  const low = Math.min(access.user.id, targetUserId);
  const high = Math.max(access.user.id, targetUserId);
  const db = getD1();
  await db.prepare(
    `INSERT OR IGNORE INTO conversas_privadas
      (comunidade_id, usuario_menor_id, usuario_maior_id, ciclo_semana)
     VALUES (?, ?, ?, strftime('%Y-%W','now'))`,
  ).bind(access.context.comunidadeId, low, high).run();
  const conversation = await db.prepare(
    `SELECT id FROM conversas_privadas WHERE comunidade_id = ?
      AND usuario_menor_id = ? AND usuario_maior_id = ?
      AND ciclo_semana = strftime('%Y-%W','now') LIMIT 1`,
  ).bind(access.context.comunidadeId, low, high).first<{ id: number }>();
  if (!conversation) return Response.json({ error: "Não foi possível abrir a conversa." }, { status: 500 });
  if (!message) return Response.json({ ok: true, conversationId: conversation.id });

  const sender = await senderMetadata(access.user.id, access.context.comunidadeId);
  // D1 batch is an atomic transaction: the latest message below is the one
  // inserted by this batch, never a concurrent sender's write. Only generic
  // metadata is copied into notifications; private text stays in the chat.
  const saved = await db.batch([
    db.prepare(
    `INSERT INTO mensagens_privadas (conversa_id, remetente_id, mensagem)
     VALUES (?, ?, ?)
     RETURNING id, criado_em`,
    ).bind(conversation.id, access.user.id, message),
    db.prepare(`INSERT INTO notificacoes_sistema
      (tipo,titulo,mensagem,area,entidade_id,usuario_id,comunidade_id,remetente_usuario_id,destino_rota,criado_por)
      SELECT 'INFO','Vínkulo','Você recebeu uma nova mensagem. Abra o Vínkulo para consultar.',
        'CHAT',id,?,?,?,'/painel?view=mensagens','chat'
      FROM mensagens_privadas WHERE conversa_id=? AND remetente_id=? ORDER BY id DESC LIMIT 1`)
      .bind(targetUserId, access.context.comunidadeId, access.user.id, conversation.id, access.user.id),
    // The general trigger deliberately ignores CHAT. Enqueue only this freshly
    // persisted message, for the recipient's currently authorized devices.
    db.prepare(`INSERT INTO notificacoes_push_fila(notificacao_id,dispositivo_id,usuario_id,vinculo_id)
      SELECT n.id,p.id,p.usuario_id,p.vinculo_id FROM notificacoes_sistema n
      JOIN notificacoes_push_dispositivos p ON p.usuario_id=n.usuario_id
      JOIN sessoes s ON s.token_hash=p.sessao_token_hash AND s.usuario_id=p.usuario_id
      JOIN usuarios u ON u.id=p.usuario_id AND u.ativo=1
      WHERE n.area='CHAT' AND n.usuario_id=? AND n.remetente_usuario_id=? AND n.comunidade_id=?
        AND n.entidade_id=(SELECT id FROM mensagens_privadas WHERE conversa_id=? AND remetente_id=? ORDER BY id DESC LIMIT 1)
        AND p.vinculo_id IS NOT NULL AND datetime(s.expira_em)>CURRENT_TIMESTAMP
        AND (p.expiracao_em IS NULL OR datetime(p.expiracao_em)>CURRENT_TIMESTAMP)`)
      .bind(targetUserId, access.user.id, access.context.comunidadeId, conversation.id, access.user.id),
    db.prepare("UPDATE conversas_privadas SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(conversation.id),
  ]);
  const inserted = saved[0]?.results?.[0] as { id: number; criado_em: string } | undefined;
  if (!inserted) return Response.json({ error: "Não foi possível enviar a mensagem." }, { status: 500 });
  scheduleWebPushDelivery(db);

  const item: Message = {
    id: inserted.id,
    remetente_id: access.user.id,
    remetente_nome: sender.name,
    mensagem: message,
    hierarquia: sender.hierarchy,
    ministerio: sender.ministry,
    criado_em: inserted.criado_em,
    entregue_em: null,
    lida_em: null,
  };
  return Response.json({ ok: true, conversationId: conversation.id, message: item }, { status: 201 });
}

// Chamado quando a outra pessoa abre a conversa: tudo que ela ainda não
// tinha visto vira "entregue" e "lida" na hora, do jeito que WhatsApp e
// Messenger mostram os dois tiques ficando azuis assim que a pessoa entra
// na tela — sem precisar de um clique extra de "marcar como lida".
export async function PATCH(request: Request) {
  const access = await chatAccess();
  if ("error" in access) return access.error;
  const payload = await safeJson(request);
  const conversationId = Number(payload?.conversationId || 0);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return badRequest("Conversa inválida.");
  const owned = await ownedConversation(access, conversationId);
  if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
  await getD1().prepare(
    `UPDATE mensagens_privadas
     SET lida_em = COALESCE(lida_em, CURRENT_TIMESTAMP),
         entregue_em = COALESCE(entregue_em, CURRENT_TIMESTAMP)
     WHERE conversa_id = ? AND remetente_id <> ? AND lida_em IS NULL`,
  ).bind(conversationId, access.user.id).run();
  return Response.json({ ok: true });
}

async function loadMessages(access: ValidAccess, conversationId: number) {
  const db = getD1();
  // Quem abriu a conversa recebeu as mensagens do outro lado: marca como
  // entregue agora (o "recebido" chega assim que o aparelho busca a
  // mensagem; "lida" só quando a conversa é aberta, no PATCH acima).
  await db.prepare(
    `UPDATE mensagens_privadas SET entregue_em = CURRENT_TIMESTAMP
     WHERE conversa_id = ? AND remetente_id <> ? AND entregue_em IS NULL`,
  ).bind(conversationId, access.user.id).run();
  const result = await db.prepare(
    `SELECT mp.id, mp.remetente_id, mp.mensagem, mp.entregue_em, mp.lida_em, mp.criado_em,
      u.nome AS remetente_nome,
      ${HIERARCHY_CASE} AS hierarquia,
      ${MINISTRY_SUBQUERY("u.id", "c.comunidade_id")} AS ministerio
     FROM mensagens_privadas mp
     JOIN conversas_privadas c ON c.id = mp.conversa_id
     JOIN usuarios u ON u.id = mp.remetente_id
     JOIN usuario_comunidades uc ON uc.usuario_id = u.id AND uc.comunidade_id = c.comunidade_id
     WHERE mp.conversa_id = ? ORDER BY mp.id ASC LIMIT 500`,
  ).bind(conversationId).all<Message>();
  return result.results;
}

async function chatAccess() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access;
  if (access.context.communityAccess === "FEED_ONLY") {
    return { error: Response.json({ error: "Mensagens privadas exigem vínculo ativo com a comunidade." }, { status: 403 }) };
  }
  return access;
}

async function ownedConversation(access: ValidAccess, id: number) {
  const row = await getD1().prepare(
    `SELECT id,
      CASE WHEN usuario_menor_id = ? THEN usuario_maior_id ELSE usuario_menor_id END AS other_user_id
     FROM conversas_privadas WHERE id = ? AND comunidade_id = ?
      AND ciclo_semana = strftime('%Y-%W','now')
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
    `SELECT ${COMMUNICATION_GROUP_CASE} AS communication_group
     FROM usuarios u
     JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE u.id = ? AND u.ativo = 1 AND uc.comunidade_id = ?
       AND uc.status = 'ATIVO' LIMIT 1`,
  ).bind(userId, communityId).first<{ communication_group: "MEMBRO" | "OFICIAL" }>();
  return row?.communication_group || "MEMBRO";
}

async function targetMetadata(userId: number, communityId: number) {
  return getD1().prepare(
    `SELECT u.id, u.nome,
      ${COMMUNICATION_GROUP_CASE} AS communication_group
     FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE u.id = ? AND u.ativo = 1 AND uc.comunidade_id = ? AND uc.status = 'ATIVO' LIMIT 1`,
  ).bind(userId, communityId).first<{ id: number; nome: string; communication_group: string }>();
}

async function senderMetadata(userId: number, communityId: number) {
  const row = await getD1().prepare(
    `SELECT u.nome,
      ${HIERARCHY_CASE} AS hierarquia,
      ${MINISTRY_SUBQUERY("u.id", "uc.comunidade_id")} AS ministerio
     FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE u.id = ? AND uc.comunidade_id = ? LIMIT 1`,
  ).bind(userId, communityId).first<{ nome: string; hierarquia: string; ministerio: string }>();
  return { name: row?.nome || "Usuário", hierarchy: row?.hierarquia || "Membro", ministry: row?.ministerio || "" };
}

// Mesma regra de privacidade do painel de presença (app/api/pilot/presenca):
// "visto por último" só aparece se a pessoa estiver online agora ou se ela
// mesma optou por compartilhar a última atividade.
function withLastSeen(row: Record<string, unknown>) {
  const { ultima_atividade, exibir_ultima_atividade, online, ...rest } = row;
  const isOnline = Number(online) === 1;
  const sharesLastSeen = Boolean(exibir_ultima_atividade);
  return {
    ...rest,
    online: isOnline ? 1 : 0,
    last_seen: isOnline || sharesLastSeen ? (ultima_atividade as string | null) : null,
    shares_last_seen: sharesLastSeen,
  };
}

async function safeJson(request: Request) {
  try { return (await request.json()) as Record<string, unknown>; }
  catch { return null; }
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}
