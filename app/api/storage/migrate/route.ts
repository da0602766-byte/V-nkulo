import { uploadVerifiedDriveFile as uploadDriveFile, digestBytes } from "../../../lib/drive-transfer";
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
  const leaseId = crypto.randomUUID();
  const lease = await db.prepare(`INSERT INTO storage_migration_locks (community_id, lease_id, expires_at)
    VALUES (?, ?, ?) ON CONFLICT(community_id) DO UPDATE SET lease_id = excluded.lease_id, expires_at = excluded.expires_at
    WHERE storage_migration_locks.expires_at < ?`).bind(context.comunidadeId, leaseId, Date.now() + 900_000, Date.now()).run();
  if (!lease.meta.changes) return Response.json({ error: "Já existe uma migração em andamento nesta comunidade. Aguarde e tente novamente." }, { status: 409 });
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
    const personal = await db.prepare(`SELECT COUNT(DISTINCT u.id) AS n FROM usuarios u
      JOIN usuario_comunidades uc ON uc.usuario_id = u.id WHERE uc.comunidade_id = ?
      AND (u.foto_perfil LIKE '/api/pilot/uploads/%' OR u.foto_perfil LIKE 'data:image/%')`).bind(context.comunidadeId).first<{ n: number }>();
    return Response.json({
      pendingPersonalPhotos: personal?.n || 0,
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
  } finally {
    await db.prepare("DELETE FROM storage_migration_locks WHERE community_id = ? AND lease_id = ?")
      .bind(context.comunidadeId, leaseId).run();
  }
}

async function migrateChats(communityId: number, chatRoot: string, accessToken: string) {
  const db = getD1();
  const conversations = await db.prepare(
    `SELECT id, drive_file_id FROM conversas_privadas
     WHERE comunidade_id = ? AND (drive_file_id IS NULL OR storage_provider <> 'GOOGLE_DRIVE')
     ORDER BY id LIMIT 1`,
  ).bind(communityId).all<{ id: number; drive_file_id: string | null }>();
  let migrated = 0;
  for (const conversation of conversations.results) {
    let folderId = conversation.drive_file_id;
    if (!folderId) {
      const candidate = await createDriveFolder(accessToken, `Conversa ${conversation.id}`, chatRoot);
      await db.prepare("UPDATE conversas_privadas SET drive_file_id = ?, storage_provider = 'MIGRATING' WHERE id = ? AND drive_file_id IS NULL").bind(candidate, conversation.id).run();
      folderId = (await db.prepare("SELECT drive_file_id FROM conversas_privadas WHERE id = ?").bind(conversation.id).first<{ drive_file_id: string }>())!.drive_file_id;
    }
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
       LEFT JOIN usuario_comunidades uc ON uc.usuario_id = u.id AND uc.comunidade_id = c.comunidade_id
       WHERE mp.conversa_id = ? AND NOT EXISTS (SELECT 1 FROM storage_migration_copies copies
         WHERE copies.source_key = 'chat:' || mp.conversa_id || ':' || mp.id)
       ORDER BY mp.id LIMIT 20`,
    ).bind(conversation.id).all<LegacyMessage>();
    for (const message of messages.results) {
      const stored = await uploadDriveFile(accessToken, {
        name: `mensagem-${message.id}.vinkulo`,
        type: "application/vnd.vinkulo.encrypted+json",
        bytes: await encryptDrivePayload(message),
        parentId: folderId,
        properties: { type: "chat-message", conversationId: String(conversation.id), messageId: String(message.id) },
      });
      await db.prepare("INSERT OR IGNORE INTO storage_migration_copies (source_key, destination, sha256) VALUES (?, ?, ?)")
        .bind(`chat:${conversation.id}:${message.id}`, stored.id, stored.checksum).run();
    }
    const remaining = await db.prepare(`SELECT 1 FROM mensagens_privadas mp WHERE conversa_id = ?
      AND NOT EXISTS (SELECT 1 FROM storage_migration_copies cp WHERE cp.source_key = 'chat:' || mp.conversa_id || ':' || mp.id) LIMIT 1`)
      .bind(conversation.id).first();
    if (!remaining) await db.prepare("UPDATE conversas_privadas SET storage_provider = 'GOOGLE_DRIVE', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(conversation.id).run();
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
      `SELECT id, ${source.columns.join(", ")} FROM ${source.table} WHERE comunidade_id = ? AND (${source.columns.map(column => `(${column} LIKE '/api/pilot/uploads/%' OR ${column} LIKE 'data:image/%')`).join(" OR ")}) ORDER BY id LIMIT 10`,
    ).bind(communityId).all<Record<string, unknown>>();
    for (const row of rows.results) {
      for (const column of source.columns) {
        const url = String(row[column] || "");
        if (isLegacyStoredAsset(url)) candidates.push({ table: source.table, id: Number(row.id), column, url });
      }
    }
  }
  // Personal photos require the account holder's own Drive consent. Never copy
  // another person's profile into the community administrator's Drive.

  let migrated = 0;
  const handled = new Map<string, string>();
  for (const candidate of candidates.slice(0, 10)) {
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
      "SELECT id AS row_id, configuracao AS content FROM layouts_interface WHERE comunidade_id = ? AND (configuracao LIKE '%/api/pilot/uploads/%' OR configuracao LIKE '%data:image/%') ORDER BY id LIMIT 5",
    ).bind(communityId).all<{ row_id: number; content: string }>(),
    db.prepare(
      `SELECT id AS row_id, configuracao_anterior || '\n' || configuracao_nova AS content
       FROM layouts_interface_historico WHERE comunidade_id = ? AND (configuracao_anterior LIKE '%/api/pilot/uploads/%' OR configuracao_nova LIKE '%/api/pilot/uploads/%' OR configuracao_anterior LIKE '%data:image/%' OR configuracao_nova LIKE '%data:image/%') ORDER BY id LIMIT 5`,
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
      await db.prepare("UPDATE configuracoes SET valor = ?, atualizado_em = CURRENT_TIMESTAMP WHERE chave = ? AND valor = ?")
        .bind(result.content, row.row_id, row.content).run();
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
      await db.prepare("UPDATE layouts_interface SET configuracao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND configuracao = ?")
        .bind(result.content, row.row_id, row.content).run();
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
        "UPDATE layouts_interface_historico SET configuracao_anterior = ?, configuracao_nova = ? WHERE id = ? AND configuracao_anterior = ? AND configuracao_nova = ?",
      ).bind(before.content, after.content, row.row_id, stored.configuracao_anterior, stored.configuracao_nova).run();
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
      await db.prepare("UPDATE configuracoes SET valor = ?, atualizado_em = CURRENT_TIMESTAMP WHERE chave = ? AND valor = ?")
        .bind(result.content, row.row_id, row.content).run();
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
    await db.prepare("UPDATE avisos SET imagem = ? WHERE id = ? AND imagem = ?").bind(result.content, row.row_id, row.content).run();
    migrated += result.migrated;
    oldValues.push(...result.oldValues);
  }
  for (const row of modules.results) {
    const result = await migrateTextAssets(row.content, {
      bucket, accessToken, folderId, driveOwnerId: ownerId,
      properties: { purpose: "platform-content-migration" },
    });
    if (result.content === row.content) continue;
    await db.prepare("UPDATE ministerio_modulos SET conteudo = ? WHERE id = ? AND conteudo = ?").bind(result.content, row.row_id, row.content).run();
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
    // Original retained for recovery; cleanup requires a separate reviewed operation.
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
  const sourceKey = `media:${target.driveOwnerId}:${target.properties.communityId || "platform"}:${await digestBytes(new TextEncoder().encode(value))}`;
  const previous = await getD1().prepare("SELECT destination FROM storage_migration_copies WHERE source_key = ?").bind(sourceKey).first<{ destination: string }>();
  if (previous) return previous.destination;
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
  const destination = `/api/storage/media/${await makeStorageReference("community", target.driveOwnerId, stored.id, { communityId: Number(target.properties.communityId) || undefined, purpose: target.properties.purpose })}`;
  await getD1().prepare("INSERT OR IGNORE INTO storage_migration_copies (source_key, destination, sha256) VALUES (?, ?, ?)").bind(sourceKey, destination, stored.checksum).run();
  return destination;
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

async function cleanupLegacyObject(_oldValue: string, _bucket: MigrationTarget["bucket"]) {
  // Deliberately non-destructive: retain every original throughout this migration.
}

async function remainingLegacy(communityId: number, includePlatform: boolean) {
  const row = await getD1().prepare(
    `SELECT
      (SELECT COUNT(*) FROM mensagens_privadas mp JOIN conversas_privadas c ON c.id = mp.conversa_id WHERE c.comunidade_id = ? AND NOT EXISTS (SELECT 1 FROM storage_migration_copies cp WHERE cp.source_key = 'chat:' || mp.conversa_id || ':' || mp.id)) +
      (SELECT COUNT(*) FROM publicacoes_piloto WHERE comunidade_id = ? AND
        (imagem_url LIKE '/api/pilot/uploads/%' OR imagem_url LIKE 'data:image/%' OR
         imagem_thumbnail_url LIKE '/api/pilot/uploads/%' OR imagem_thumbnail_url LIKE 'data:image/%')) +
      (SELECT COUNT(*) FROM programacoes_editoriais WHERE comunidade_id = ? AND
        (imagem_url LIKE '/api/pilot/uploads/%' OR imagem_url LIKE 'data:image/%')) +
      (SELECT COUNT(*) FROM ministerios_comunidade WHERE comunidade_id = ? AND
        (banner_url LIKE '/api/pilot/uploads/%' OR banner_url LIKE 'data:image/%')) +
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
