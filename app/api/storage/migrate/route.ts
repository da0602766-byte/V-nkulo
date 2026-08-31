import { getD1 } from "../../../../db";
import { getRuntimeEnv } from "../../../../db/runtime-env";
import { getSessionUser } from "../../../lib/local-auth";
import {
  createDriveFolder,
  encryptDrivePayload,
  ensurePersonalDriveStorage,
  getDriveAccessToken,
  makeStorageReference,
  readStorageReference,
  uploadDriveFile,
} from "../../../lib/google-integration";
import { getActiveTenantContext } from "../../../lib/tenant";

type LegacyMessage = {
  id: number;
  remetente_id: number;
  remetente_nome: string;
  mensagem: string;
  hierarquia: string;
  ministerio: string;
  criado_em: string;
  lida_em: string | null;
};

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const tenant = await getActiveTenantContext(user);
  const context = tenant.context;
  const allowed = Boolean(
    context &&
    (user.system_owner === true || context.communityAccess === "OWNER" || context.papel === "ADMIN_COMUNIDADE"),
  );
  if (!context || !allowed) return Response.json({ error: "Somente a administração pode migrar o conteúdo." }, { status: 403 });
  const db = getD1();
  const storage = await db.prepare(
    `SELECT proprietario_usuario_id, pasta_midias_id, pasta_conversas_id
     FROM community_drive_storage WHERE comunidade_id = ? LIMIT 1`,
  ).bind(context.comunidadeId).first<{
    proprietario_usuario_id: number;
    pasta_midias_id: string;
    pasta_conversas_id: string;
  }>();
  if (!storage) return Response.json({ error: "Configure primeiro a pasta Google Drive da comunidade." }, { status: 409 });
  try {
    await db.prepare(
      "UPDATE community_drive_storage SET status_migracao = 'IN_PROGRESS', atualizado_em = CURRENT_TIMESTAMP WHERE comunidade_id = ?",
    ).bind(context.comunidadeId).run();
    const accessToken = await getDriveAccessToken(storage.proprietario_usuario_id);
    const migratedChats = await migrateChats(context.comunidadeId, storage.pasta_conversas_id, accessToken);
    const migratedMedia = await migrateMedia(
      context.comunidadeId,
      storage.proprietario_usuario_id,
      storage.pasta_midias_id,
      accessToken,
    );
    let migratedPlatformMedia = 0;
    if (user.system_owner === true) {
      const ownerToken = await getDriveAccessToken(user.id);
      const ownerStorage = await ensurePersonalDriveStorage(user.id, ownerToken);
      migratedPlatformMedia = await migratePlatformMedia(
        user.id,
        ownerStorage.mediaFolderId,
        ownerToken,
      );
    }
    const remaining = await remainingLegacy(
      context.comunidadeId,
      user.system_owner === true,
    );
    if (remaining === 0) {
      await db.prepare(
        `UPDATE community_drive_storage SET status_migracao = 'COMPLETE',
          migrado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE comunidade_id = ?`,
      ).bind(context.comunidadeId).run();
    }
    return Response.json({
      migratedChats,
      migratedMedia,
      migratedPlatformMedia,
      remaining,
      complete: remaining === 0,
    });
  } catch (error) {
    await db.prepare(
      "UPDATE community_drive_storage SET status_migracao = 'FAILED', atualizado_em = CURRENT_TIMESTAMP WHERE comunidade_id = ?",
    ).bind(context.comunidadeId).run();
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
}

async function migrateChats(communityId: number, chatRoot: string, accessToken: string) {
  const db = getD1();
  const conversations = await db.prepare(
    `SELECT id FROM conversas_privadas
     WHERE comunidade_id = ? AND (drive_file_id IS NULL OR storage_provider <> 'GOOGLE_DRIVE')
     ORDER BY id LIMIT 20`,
  ).bind(communityId).all<{ id: number }>();
  let migrated = 0;
  for (const conversation of conversations.results) {
    const folderId = await createDriveFolder(accessToken, `Conversa ${conversation.id}`, chatRoot);
    const messages = await db.prepare(
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
       JOIN usuario_comunidades uc ON uc.usuario_id = u.id AND uc.comunidade_id = c.comunidade_id
       WHERE mp.conversa_id = ? ORDER BY mp.id`,
    ).bind(conversation.id).all<LegacyMessage>();
    for (const message of messages.results) {
      await uploadDriveFile(accessToken, {
        name: `mensagem-${message.id}.vinkulo`,
        type: "application/vnd.vinkulo.encrypted+json",
        bytes: await encryptDrivePayload(message),
        parentId: folderId,
        properties: { type: "chat-message", conversationId: String(conversation.id), messageId: String(message.id) },
      });
    }
    await db.batch([
      db.prepare("DELETE FROM mensagens_privadas WHERE conversa_id = ?").bind(conversation.id),
      db.prepare(
        "UPDATE conversas_privadas SET drive_file_id = ?, storage_provider = 'GOOGLE_DRIVE', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(folderId, conversation.id),
    ]);
    migrated += 1;
  }
  return migrated;
}

async function migrateMedia(
  communityId: number,
  driveOwnerId: number,
  mediaFolderId: string,
  accessToken: string,
) {
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket) return 0;
  const candidates: Array<{ table: string; id: number; column: string; url: string }> = [];
  const sources = [
    { table: "publicacoes_piloto", columns: ["imagem_url", "imagem_thumbnail_url"] },
    { table: "programacoes_editoriais", columns: ["imagem_url"] },
    { table: "ministerios_comunidade", columns: ["banner_url"] },
    { table: "cadastros_membros_temporarios", columns: ["foto_url"] },
  ];
  for (const source of sources) {
    const rows = await getD1().prepare(
      `SELECT id, ${source.columns.join(", ")} FROM ${source.table} WHERE comunidade_id = ? LIMIT 200`,
    ).bind(communityId).all<Record<string, unknown>>();
    for (const row of rows.results) {
      for (const column of source.columns) {
        const url = String(row[column] || "");
        if (isLegacyStoredAsset(url)) candidates.push({ table: source.table, id: Number(row.id), column, url });
      }
    }
  }
  const members = await getD1().prepare(
    `SELECT DISTINCT u.id, u.foto_perfil FROM usuarios u
     JOIN usuario_comunidades uc ON uc.usuario_id = u.id
     WHERE uc.comunidade_id = ? AND
       (u.foto_perfil LIKE '/api/pilot/uploads/%' OR u.foto_perfil LIKE 'data:image/%') LIMIT 200`,
  ).bind(communityId).all<{ id: number; foto_perfil: string }>();
  for (const member of members.results) candidates.push({ table: "usuarios", id: member.id, column: "foto_perfil", url: member.foto_perfil });

  let migrated = 0;
  const handled = new Map<string, string>();
  for (const candidate of candidates.slice(0, 40)) {
    let replacement = handled.get(candidate.url);
    if (!replacement) {
      replacement = await migrateLegacyAsset(candidate.url, {
        bucket,
        accessToken,
        folderId: mediaFolderId,
        driveOwnerId,
        properties: { purpose: "legacy-migration", communityId: String(communityId) },
      });
      if (!replacement) continue;
      handled.set(candidate.url, replacement);
    }
    if (!["publicacoes_piloto", "programacoes_editoriais", "ministerios_comunidade", "cadastros_membros_temporarios", "usuarios"].includes(candidate.table)) continue;
    if (!["imagem_url", "imagem_thumbnail_url", "banner_url", "foto_url", "foto_perfil"].includes(candidate.column)) continue;
    await getD1().prepare(`UPDATE ${candidate.table} SET ${candidate.column} = ? WHERE id = ? AND ${candidate.column} = ?`)
      .bind(replacement, candidate.id, candidate.url).run();
    migrated += 1;
  }
  const jsonResult = await migrateCommunityJsonAssets(
    communityId,
    driveOwnerId,
    mediaFolderId,
    accessToken,
    bucket,
  );
  for (const oldUrl of new Set([...handled.keys(), ...jsonResult.oldValues])) {
    await cleanupLegacyObject(oldUrl, bucket);
  }
  return migrated + jsonResult.migrated;
}

async function migrateCommunityJsonAssets(
  communityId: number,
  driveOwnerId: number,
  folderId: string,
  accessToken: string,
  bucket: NonNullable<ReturnType<typeof getRuntimeEnv>["BUCKET"]>,
) {
  const db = getD1();
  const [themes, layouts, history] = await Promise.all([
    db.prepare(
      "SELECT chave AS row_id, valor AS content FROM configuracoes WHERE chave = ? LIMIT 1",
    ).bind(`community_theme:${communityId}`).all<{ row_id: string; content: string }>(),
    db.prepare(
      "SELECT id AS row_id, configuracao AS content FROM layouts_interface WHERE comunidade_id = ? LIMIT 100",
    ).bind(communityId).all<{ row_id: number; content: string }>(),
    db.prepare(
      `SELECT id AS row_id, configuracao_anterior || '\n' || configuracao_nova AS content
       FROM layouts_interface_historico WHERE comunidade_id = ? LIMIT 100`,
    ).bind(communityId).all<{ row_id: number; content: string }>(),
  ]);
  let migrated = 0;
  const oldValues: string[] = [];
  for (const row of themes.results) {
    const result = await migrateTextAssets(row.content, {
      bucket, accessToken, folderId, driveOwnerId,
      properties: { purpose: "community-theme-migration", communityId: String(communityId) },
    });
    if (result.content !== row.content) {
      await db.prepare("UPDATE configuracoes SET valor = ?, atualizado_em = CURRENT_TIMESTAMP WHERE chave = ?")
        .bind(result.content, row.row_id).run();
      migrated += result.migrated;
      oldValues.push(...result.oldValues);
    }
  }
  for (const row of layouts.results) {
    const result = await migrateTextAssets(row.content, {
      bucket, accessToken, folderId, driveOwnerId,
      properties: { purpose: "community-layout-migration", communityId: String(communityId) },
    });
    if (result.content !== row.content) {
      await db.prepare("UPDATE layouts_interface SET configuracao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(result.content, row.row_id).run();
      migrated += result.migrated;
      oldValues.push(...result.oldValues);
    }
  }
  for (const row of history.results) {
    const stored = await db.prepare(
      "SELECT configuracao_anterior, configuracao_nova FROM layouts_interface_historico WHERE id = ? LIMIT 1",
    ).bind(row.row_id).first<{ configuracao_anterior: string; configuracao_nova: string }>();
    if (!stored) continue;
    const before = await migrateTextAssets(stored.configuracao_anterior, {
      bucket, accessToken, folderId, driveOwnerId,
      properties: { purpose: "community-layout-history", communityId: String(communityId) },
    });
    const after = await migrateTextAssets(stored.configuracao_nova, {
      bucket, accessToken, folderId, driveOwnerId,
      properties: { purpose: "community-layout-history", communityId: String(communityId) },
    });
    if (before.content !== stored.configuracao_anterior || after.content !== stored.configuracao_nova) {
      await db.prepare(
        "UPDATE layouts_interface_historico SET configuracao_anterior = ?, configuracao_nova = ? WHERE id = ?",
      ).bind(before.content, after.content, row.row_id).run();
      migrated += before.migrated + after.migrated;
      oldValues.push(...before.oldValues, ...after.oldValues);
    }
  }
  return { migrated, oldValues };
}

async function migratePlatformMedia(
  ownerId: number,
  folderId: string,
  accessToken: string,
) {
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket) return 0;
  const db = getD1();
  let migrated = 0;
  const oldValues: string[] = [];
  const [configs, notices, modules] = await Promise.all([
    db.prepare(
      `SELECT chave AS row_id, valor AS content FROM configuracoes
       WHERE chave NOT LIKE 'community_theme:%' AND
         (valor LIKE '%/api/pilot/uploads/%' OR valor LIKE '%data:image/%') LIMIT 100`,
    ).all<{ row_id: string; content: string }>(),
    db.prepare(
      `SELECT id AS row_id, imagem AS content FROM avisos
       WHERE imagem LIKE '/api/pilot/uploads/%' OR imagem LIKE 'data:image/%' LIMIT 100`,
    ).all<{ row_id: number; content: string }>(),
    db.prepare(
      `SELECT id AS row_id, conteudo AS content FROM ministerio_modulos
       WHERE conteudo LIKE '%/api/pilot/uploads/%' OR conteudo LIKE '%data:image/%' LIMIT 100`,
    ).all<{ row_id: number; content: string }>(),
  ]);
  for (const row of configs.results) {
    const result = await migrateTextAssets(row.content, {
      bucket, accessToken, folderId, driveOwnerId: ownerId,
      properties: { purpose: "platform-config-migration" },
    });
    if (result.content !== row.content) {
      await db.prepare("UPDATE configuracoes SET valor = ?, atualizado_em = CURRENT_TIMESTAMP WHERE chave = ?")
        .bind(result.content, row.row_id).run();
      migrated += result.migrated;
      oldValues.push(...result.oldValues);
    }
  }
  for (const row of notices.results) {
    const result = await migrateTextAssets(row.content, {
      bucket, accessToken, folderId, driveOwnerId: ownerId,
      properties: { purpose: "platform-content-migration" },
    });
    if (result.content === row.content) continue;
    await db.prepare("UPDATE avisos SET imagem = ? WHERE id = ?").bind(result.content, row.row_id).run();
    migrated += result.migrated;
    oldValues.push(...result.oldValues);
  }
  for (const row of modules.results) {
    const result = await migrateTextAssets(row.content, {
      bucket, accessToken, folderId, driveOwnerId: ownerId,
      properties: { purpose: "platform-content-migration" },
    });
    if (result.content === row.content) continue;
    await db.prepare("UPDATE ministerio_modulos SET conteudo = ? WHERE id = ?").bind(result.content, row.row_id).run();
    migrated += result.migrated;
    oldValues.push(...result.oldValues);
  }
  const feedback = await db.prepare(
    "SELECT id, imagem_chave FROM feedback_plataforma WHERE imagem_chave <> '' LIMIT 100",
  ).all<{ id: number; imagem_chave: string }>();
  for (const item of feedback.results) {
    if (await readStorageReference(item.imagem_chave)) continue;
    const key = item.imagem_chave.startsWith("/api/pilot/uploads/")
      ? item.imagem_chave.slice("/api/pilot/uploads/".length)
      : item.imagem_chave;
    const object = await bucket.get(key);
    if (!object) continue;
    const type = object.httpMetadata?.contentType || "application/octet-stream";
    const stored = await uploadDriveFile(accessToken, {
      name: `feedback-migrado-${crypto.randomUUID()}.${extensionFor(type)}`,
      type,
      bytes: new Uint8Array(await new Response(object.body).arrayBuffer()),
      parentId: folderId,
      properties: { purpose: "feedback-legacy-migration", feedbackId: String(item.id) },
    });
    const reference = await makeStorageReference("feedback", ownerId, stored.id);
    await db.prepare("UPDATE feedback_plataforma SET imagem_chave = ? WHERE id = ? AND imagem_chave = ?")
      .bind(reference, item.id, item.imagem_chave).run();
    await bucket.delete(key);
    migrated += 1;
  }
  for (const oldValue of new Set(oldValues)) await cleanupLegacyObject(oldValue, bucket);
  return migrated;
}

type MigrationTarget = {
  bucket: NonNullable<ReturnType<typeof getRuntimeEnv>["BUCKET"]>;
  accessToken: string;
  folderId: string;
  driveOwnerId: number;
  properties: Record<string, string>;
};

async function migrateTextAssets(content: string, target: MigrationTarget) {
  let next = content;
  let migrated = 0;
  const oldValues: string[] = [];
  for (const value of legacyAssetsInText(content).slice(0, 40)) {
    const replacement = await migrateLegacyAsset(value, target);
    if (!replacement) continue;
    next = next.replaceAll(value, replacement);
    migrated += 1;
    oldValues.push(value);
  }
  return { content: next, migrated, oldValues };
}

async function migrateLegacyAsset(value: string, target: MigrationTarget) {
  let type = "application/octet-stream";
  let bytes: Uint8Array;
  if (value.startsWith("/api/pilot/uploads/")) {
    const object = await target.bucket.get(value.slice("/api/pilot/uploads/".length));
    if (!object) return "";
    type = object.httpMetadata?.contentType || type;
    bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  } else {
    const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
    if (!match) return "";
    type = match[1].toLowerCase();
    try {
      const binary = atob(match[2]);
      bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
      return "";
    }
  }
  const stored = await uploadDriveFile(target.accessToken, {
    name: `migrado-${crypto.randomUUID()}.${extensionFor(type)}`,
    type,
    bytes,
    parentId: target.folderId,
    properties: target.properties,
  });
  return `/api/storage/media/${await makeStorageReference("public", target.driveOwnerId, stored.id)}`;
}

function legacyAssetsInText(content: string) {
  return Array.from(new Set([
    ...(content.match(/\/api\/pilot\/uploads\/[A-Za-z0-9_./-]+/g) || []),
    ...(content.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi) || []),
  ]));
}

function isLegacyStoredAsset(value: string) {
  return value.startsWith("/api/pilot/uploads/") || /^data:image\//i.test(value);
}

function extensionFor(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "bin";
}

async function cleanupLegacyObject(oldValue: string, bucket: MigrationTarget["bucket"]) {
  if (!oldValue.startsWith("/api/pilot/uploads/")) return;
  const pattern = `%${oldValue}%`;
  const db = getD1();
  const checks = await Promise.all([
    db.prepare("SELECT 1 FROM publicacoes_piloto WHERE imagem_url = ? OR imagem_thumbnail_url = ? LIMIT 1").bind(oldValue, oldValue).first(),
    db.prepare("SELECT 1 FROM programacoes_editoriais WHERE imagem_url = ? LIMIT 1").bind(oldValue).first(),
    db.prepare("SELECT 1 FROM ministerios_comunidade WHERE banner_url = ? LIMIT 1").bind(oldValue).first(),
    db.prepare("SELECT 1 FROM cadastros_membros_temporarios WHERE foto_url = ? LIMIT 1").bind(oldValue).first(),
    db.prepare("SELECT 1 FROM usuarios WHERE foto_perfil = ? LIMIT 1").bind(oldValue).first(),
    db.prepare("SELECT 1 FROM avisos WHERE imagem = ? LIMIT 1").bind(oldValue).first(),
    db.prepare("SELECT 1 FROM configuracoes WHERE valor LIKE ? LIMIT 1").bind(pattern).first(),
    db.prepare("SELECT 1 FROM layouts_interface WHERE configuracao LIKE ? LIMIT 1").bind(pattern).first(),
    db.prepare("SELECT 1 FROM layouts_interface_historico WHERE configuracao_anterior LIKE ? OR configuracao_nova LIKE ? LIMIT 1").bind(pattern, pattern).first(),
    db.prepare("SELECT 1 FROM ministerio_modulos WHERE conteudo LIKE ? LIMIT 1").bind(pattern).first(),
  ]);
  if (!checks.some(Boolean)) {
    await bucket.delete(oldValue.slice("/api/pilot/uploads/".length));
  }
}

async function remainingLegacy(communityId: number, includePlatform: boolean) {
  const row = await getD1().prepare(
    `SELECT
      (SELECT COUNT(*) FROM mensagens_privadas mp JOIN conversas_privadas c ON c.id = mp.conversa_id WHERE c.comunidade_id = ?) +
      (SELECT COUNT(*) FROM publicacoes_piloto WHERE comunidade_id = ? AND (imagem_url LIKE '/api/pilot/uploads/%' OR imagem_thumbnail_url LIKE '/api/pilot/uploads/%')) +
      (SELECT COUNT(*) FROM programacoes_editoriais WHERE comunidade_id = ? AND imagem_url LIKE '/api/pilot/uploads/%') +
      (SELECT COUNT(*) FROM ministerios_comunidade WHERE comunidade_id = ? AND banner_url LIKE '/api/pilot/uploads/%') +
      (SELECT COUNT(*) FROM cadastros_membros_temporarios WHERE comunidade_id = ? AND (foto_url LIKE '/api/pilot/uploads/%' OR foto_url LIKE 'data:image/%')) +
      (SELECT COUNT(DISTINCT u.id) FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id WHERE uc.comunidade_id = ? AND (u.foto_perfil LIKE '/api/pilot/uploads/%' OR u.foto_perfil LIKE 'data:image/%')) +
      (SELECT COUNT(*) FROM configuracoes WHERE chave = 'community_theme:' || ? AND (valor LIKE '%/api/pilot/uploads/%' OR valor LIKE '%data:image/%')) +
      (SELECT COUNT(*) FROM layouts_interface WHERE comunidade_id = ? AND (configuracao LIKE '%/api/pilot/uploads/%' OR configuracao LIKE '%data:image/%')) +
      (SELECT COUNT(*) FROM layouts_interface_historico WHERE comunidade_id = ? AND
        (configuracao_anterior LIKE '%/api/pilot/uploads/%' OR configuracao_anterior LIKE '%data:image/%' OR
         configuracao_nova LIKE '%/api/pilot/uploads/%' OR configuracao_nova LIKE '%data:image/%'))
      AS total`,
  ).bind(
    communityId, communityId, communityId, communityId, communityId,
    communityId, communityId, communityId, communityId,
  ).first<{ total: number }>();
  let total = Number(row?.total || 0);
  if (!includePlatform) return total;
  const global = await getD1().prepare(
    `SELECT
      (SELECT COUNT(*) FROM configuracoes WHERE chave NOT LIKE 'community_theme:%' AND
        (valor LIKE '%/api/pilot/uploads/%' OR valor LIKE '%data:image/%')) +
      (SELECT COUNT(*) FROM avisos WHERE imagem LIKE '/api/pilot/uploads/%' OR imagem LIKE 'data:image/%') +
      (SELECT COUNT(*) FROM ministerio_modulos WHERE conteudo LIKE '%/api/pilot/uploads/%' OR conteudo LIKE '%data:image/%')
      AS total`,
  ).first<{ total: number }>();
  total += Number(global?.total || 0);
  const feedback = await getD1().prepare(
    "SELECT imagem_chave FROM feedback_plataforma WHERE imagem_chave <> ''",
  ).all<{ imagem_chave: string }>();
  for (const item of feedback.results) {
    if (!(await readStorageReference(item.imagem_chave))) total += 1;
  }
  return total;
}
