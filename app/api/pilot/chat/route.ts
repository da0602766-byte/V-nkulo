import { readMessagePage } from "../../../lib/chat-page.mjs";
import { getD1 } from "../../../../db";
import {
  createDriveFolder,
  decryptDrivePayload,
  encryptDrivePayload,
  getDriveAccessToken,
  listDriveFilesPage,
  readDriveFile,
  uploadDriveFile,
} from "../../../lib/google-integration";
import { requireTenantPermission } from "../../../lib/tenant";

type Access = Awaited<ReturnType<typeof requireTenantPermission>>;
type ValidAccess = Exclude<Access, { error: Response }>;
type DriveMessage = {
  id: number;
  remetente_id: number;
  remetente_nome: string;
  mensagem: string;
  hierarquia: string;
  ministerio: string;
  criado_em: string;
  lida_em: string | null;
};

export async function GET(request: Request) {
  const access = await chatAccess();
  if ("error" in access) return access.error;
  const url = new URL(request.url);
  const conversationId = Number(url.searchParams.get("conversation") || 0);
  const messagesOnly = url.searchParams.get("messagesOnly") === "1";
  const pageToken = url.searchParams.get("pageToken") || undefined;
  const since = url.searchParams.get("since") || undefined;
  const knownIds = (url.searchParams.get("known") || "").split(",").filter(Boolean).slice(0, 200);
  if ((pageToken && pageToken.length > 2000) || (since && !Number.isFinite(Date.parse(since))))
    return badRequest("Cursor de mensagens inválido.");
  const pageOptions = { pageToken, since, knownIds };
  const preference = await getD1().prepare(
    "SELECT auto_load_recent FROM storage_preferences WHERE usuario_id = ? LIMIT 1",
  ).bind(access.user.id).first<{ auto_load_recent: number }>();
  const autoLoadRecent = preference?.auto_load_recent !== 0;
  const loadRecent = autoLoadRecent || url.searchParams.get("loadRecent") === "1";

  if (messagesOnly && Number.isInteger(conversationId) && conversationId > 0) {
    const owned = await ownedConversation(access, conversationId);
    if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    try {
      const page = loadRecent ? await loadDriveMessages(access, conversationId, pageOptions) : emptyPage();
      return Response.json(
        {
          ...page,
          currentUserId: access.user.id,
          storage: "GOOGLE_DRIVE",
          autoLoadRecent,
          recentContentLoaded: loadRecent,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 409 });
    }
  }

  const communicationGroup = await communicationClass(access.user.id, access.context.comunidadeId);
  const [people, conversations] = await Promise.all([
    getD1().prepare(
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
    getD1().prepare(
      `SELECT c.id, c.atualizado_em, c.storage_provider,
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
        'Conversa protegida no Google Drive' AS ultima_mensagem,
        0 AS nao_lidas
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
    ).bind(access.user.id, access.context.comunidadeId, access.user.id, communicationGroup).all<Record<string, unknown>>(),
  ]);

  let page = emptyPage();
  if (loadRecent && Number.isInteger(conversationId) && conversationId > 0) {
    const owned = await ownedConversation(access, conversationId);
    if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
    try {
      page = await loadDriveMessages(access, conversationId, pageOptions);
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 409 });
    }
  }

  return Response.json({
    people: people.results,
    conversations: conversations.results,
    ...page,
    currentUserId: access.user.id,
    communicationGroup,
    cycle: new Date().toISOString().slice(0, 7),
    storage: "GOOGLE_DRIVE",
    autoLoadRecent,
    recentContentLoaded: loadRecent,
    privacyNotice: "Novas mensagens ficam no Google Drive. Históricos antigos podem permanecer na plataforma até a migração; nenhum original é apagado automaticamente.",
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
      (comunidade_id, usuario_menor_id, usuario_maior_id, ciclo_mes, storage_provider)
     VALUES (?, ?, ?, strftime('%Y-%m','now'), 'GOOGLE_DRIVE')`,
  ).bind(access.context.comunidadeId, low, high).run();
  const conversation = await db.prepare(
    `SELECT id FROM conversas_privadas WHERE comunidade_id = ?
      AND usuario_menor_id = ? AND usuario_maior_id = ?
      AND ciclo_mes = strftime('%Y-%m','now') LIMIT 1`,
  ).bind(access.context.comunidadeId, low, high).first<{ id: number }>();
  if (!conversation) return Response.json({ error: "Não foi possível abrir a conversa." }, { status: 500 });

  try {
    const drive = await ensureDriveConversation(access, conversation.id);
    if (!message) return Response.json({ ok: true, conversationId: conversation.id, storage: "GOOGLE_DRIVE" });
    const sender = await senderMetadata(access.user.id, access.context.comunidadeId);
    const item: DriveMessage = {
      id: Date.now() * 100 + Math.floor(Math.random() * 100),
      remetente_id: access.user.id,
      remetente_nome: sender.name,
      mensagem: message,
      hierarquia: sender.hierarchy,
      ministerio: sender.ministry,
      criado_em: new Date().toISOString(),
      lida_em: null,
    };
    const encrypted = await encryptDrivePayload(item);
    const stored = await uploadDriveFile(drive.accessToken, {
      name: `mensagem-${item.id}.vinkulo`,
      type: "application/vnd.vinkulo.encrypted+json",
      bytes: encrypted,
      parentId: drive.folderId,
      properties: { type: "chat-message", conversationId: String(conversation.id), messageId: String(item.id) },
    });
    await db.prepare("UPDATE conversas_privadas SET atualizado_em = CURRENT_TIMESTAMP, storage_provider = 'GOOGLE_DRIVE' WHERE id = ?")
      .bind(conversation.id).run();
    return Response.json({ ok: true, conversationId: conversation.id, message: { ...item, fileId: stored.id, driveCreatedTime: stored.createdTime }, storage: "GOOGLE_DRIVE" }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const access = await chatAccess();
  if ("error" in access) return access.error;
  const payload = await safeJson(request);
  const conversationId = Number(payload?.conversationId || 0);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return badRequest("Conversa inválida.");
  const owned = await ownedConversation(access, conversationId);
  if (!owned) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
  return Response.json({ ok: true, storage: "GOOGLE_DRIVE" });
}

function emptyPage() {
  return { messages: [] as Array<DriveMessage & { fileId: string; driveCreatedTime: string }>,
    failedFileIds: [] as string[], partial: false, nextPageToken: null as string | null, syncSince: null as string | null };
}

async function loadDriveMessages(access: ValidAccess, conversationId: number,
  options: { pageToken?: string; since?: string; knownIds: string[] }) {
  const drive = await ensureDriveConversation(access, conversationId);
  const page = await listDriveFilesPage(drive.accessToken, drive.folderId, { ...options, pageSize: 30 });
  const result = await readMessagePage(page.files, {
    knownIds: options.knownIds,
    read: async (file: Record<string, unknown>) => {
      const props = file.appProperties as Record<string, string> | undefined;
      if (props?.conversationId !== String(conversationId) || Number(file.size) > 32_768) throw new Error("Arquivo incompatível.");
      const response = await readDriveFile(drive.accessToken, String(file.id));
      return decryptDrivePayload<DriveMessage>(new Uint8Array(await response.arrayBuffer()));
    },
  });
  const latest = page.files.map((f) => String(f.createdTime || "")).filter(Boolean).sort().at(-1);
  // Overlap covers concurrent timestamps; known IDs are filtered before any downloads.
  const syncSince = latest ? new Date(Date.parse(latest) - 30_000).toISOString() : options.since || new Date(Date.now() - 30_000).toISOString();
  return { ...result, partial: result.partial || page.incompleteSearch,
    nextPageToken: page.nextPageToken, syncSince: (result.partial || page.incompleteSearch) ? options.since || null : syncSince };
}

async function ensureDriveConversation(access: ValidAccess, conversationId: number) {
  const db = getD1();
  const row = await db.prepare(
    `SELECT c.drive_file_id, c.storage_provider, cds.proprietario_usuario_id, cds.pasta_conversas_id
     FROM conversas_privadas c
     LEFT JOIN community_drive_storage cds ON cds.comunidade_id = c.comunidade_id
     WHERE c.id = ? AND c.comunidade_id = ? LIMIT 1`,
  ).bind(conversationId, access.context.comunidadeId).first<{
    drive_file_id: string | null;
    storage_provider: string;
    proprietario_usuario_id: number | null;
    pasta_conversas_id: string | null;
  }>();
  if (!row) throw new Error("Conversa não encontrada.");
  if (!row.proprietario_usuario_id || !row.pasta_conversas_id) {
    throw new Error("A administração precisa ativar o Google Drive da comunidade antes de usar o chat.");
  }
  const accessToken = await getDriveAccessToken(row.proprietario_usuario_id);
  if (row.drive_file_id && row.storage_provider !== "GOOGLE_DRIVE") throw new Error("Migração do histórico pendente. Continue em Minha conta > Armazenamento.");
  if (row.drive_file_id) return { accessToken, folderId: row.drive_file_id };
  const legacy = await db.prepare("SELECT 1 FROM mensagens_privadas WHERE conversa_id = ? LIMIT 1").bind(conversationId).first();
  if (legacy) throw new Error("O histórico precisa ser copiado e validado em Minha conta > Armazenamento antes de abrir esta conversa. Os originais estão preservados.");
  const folderId = await createDriveFolder(accessToken, `Conversa ${conversationId}`, row.pasta_conversas_id);
  await db.prepare(`UPDATE conversas_privadas SET drive_file_id = ?, storage_provider = 'GOOGLE_DRIVE'
    WHERE id = ? AND drive_file_id IS NULL`).bind(folderId, conversationId).run();
  const selected = await db.prepare("SELECT drive_file_id FROM conversas_privadas WHERE id = ?").bind(conversationId).first<{ drive_file_id: string }>();
  return { accessToken, folderId: selected!.drive_file_id };
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
      AND ciclo_mes = strftime('%Y-%m','now')
      AND (? IN (usuario_menor_id, usuario_maior_id)) LIMIT 1`,
  ).bind(access.user.id, id, access.context.comunidadeId, access.user.id).first<{ id: number; other_user_id: number }>();
  if (!row) return null;
  const [currentGroup, otherGroup] = await Promise.all([
    communicationClass(access.user.id, access.context.comunidadeId),
    communicationClass(row.other_user_id, access.context.comunidadeId),
  ]);
  const otherActive = await targetMetadata(row.other_user_id, access.context.comunidadeId);
  return otherActive && currentGroup === otherGroup ? row : null;
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

async function targetMetadata(userId: number, communityId: number) {
  return getD1().prepare(
    `SELECT u.id, u.nome,
      CASE
        WHEN u.perfil = 'ADMIN' OR uc.papel IN ('ADMIN_COMUNIDADE', 'PASTOR', 'LIDER')
          OR EXISTS (SELECT 1 FROM oficiais_comunidade oc WHERE oc.usuario_comunidade_id = uc.id)
        THEN 'OFICIAL' ELSE 'MEMBRO' END AS communication_group
     FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE u.id = ? AND u.ativo = 1 AND uc.comunidade_id = ? AND uc.status = 'ATIVO' LIMIT 1`,
  ).bind(userId, communityId).first<{ id: number; nome: string; communication_group: string }>();
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
