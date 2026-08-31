import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  disconnectGoogleDrive,
  getGoogleConnection,
  googleIntegrationAvailable,
} from "../../../lib/google-integration";
import { getActiveTenantContext } from "../../../lib/tenant";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const tenant = await getActiveTenantContext(user);
  const [connection, preference, communityStorage] = await Promise.all([
    getGoogleConnection(user.id),
    getD1().prepare(
      `SELECT provider, auto_load_recent, auto_download_files, consented_at, updated_at
       FROM storage_preferences WHERE usuario_id = ? LIMIT 1`,
    ).bind(user.id).first<Record<string, unknown>>(),
    tenant.context
      ? getD1().prepare(
          `SELECT cds.status_migracao, cds.migrado_em, cds.proprietario_usuario_id,
            u.nome AS proprietario_nome
           FROM community_drive_storage cds
           JOIN usuarios u ON u.id = cds.proprietario_usuario_id
           WHERE cds.comunidade_id = ? LIMIT 1`,
        ).bind(tenant.context.comunidadeId).first<Record<string, unknown>>()
      : Promise.resolve(null),
  ]);
  return Response.json({
    googleAvailable: googleIntegrationAvailable(),
    google: connection ? {
      email: connection.google_email,
      connected: Boolean(connection.drive_enabled && !connection.revoked_at),
      scopes: connection.scopes,
      connectedAt: connection.connected_at,
    } : null,
    preference: preference || {
      provider: "LOCAL",
      auto_load_recent: 1,
      auto_download_files: 0,
    },
    communityStorage,
    canConfigureCommunity: Boolean(
      tenant.context &&
      (user.system_owner === true || tenant.context.communityAccess === "OWNER" || tenant.context.papel === "ADMIN_COMUNIDADE"),
    ),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const payload = await request.json() as Record<string, unknown>;
  const provider = payload.provider === "GOOGLE_DRIVE" ? "GOOGLE_DRIVE" : "LOCAL";
  if (provider === "GOOGLE_DRIVE") {
    const connection = await getGoogleConnection(user.id);
    if (!connection?.drive_enabled || connection.revoked_at) {
      return Response.json({ error: "Conecte seu Google Drive antes de escolher este destino." }, { status: 409 });
    }
  }
  await getD1().prepare(
    `INSERT INTO storage_preferences
      (usuario_id, provider, auto_load_recent, auto_download_files, consented_at, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(usuario_id) DO UPDATE SET provider = excluded.provider,
       auto_load_recent = excluded.auto_load_recent,
       auto_download_files = excluded.auto_download_files,
       consented_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    user.id,
    provider,
    payload.autoLoadRecent === false ? 0 : 1,
    payload.autoDownloadFiles === true ? 1 : 0,
  ).run();
  return Response.json({ updated: true });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  await disconnectGoogleDrive(user.id);
  await getD1().prepare(
    `INSERT INTO storage_preferences
      (usuario_id, provider, auto_load_recent, auto_download_files, consented_at, updated_at)
     VALUES (?, 'LOCAL', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(usuario_id) DO UPDATE SET provider = 'LOCAL',
       auto_download_files = 0, updated_at = CURRENT_TIMESTAMP`,
  ).bind(user.id).run();
  return Response.json({ disconnected: true });
}
