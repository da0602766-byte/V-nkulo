import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { createDriveFolder, getDriveAccessToken } from "../../../lib/google-integration";
import { getActiveTenantContext } from "../../../lib/tenant";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const tenant = await getActiveTenantContext(user);
  const context = tenant.context;
  const allowed = Boolean(
    context &&
    (user.system_owner === true || context.communityAccess === "OWNER" || context.papel === "ADMIN_COMUNIDADE"),
  );
  if (!context || !allowed) {
    return Response.json({ error: "Somente a administração pode configurar o Drive da comunidade." }, { status: 403 });
  }
  const existing = await getD1().prepare(
    "SELECT comunidade_id FROM community_drive_storage WHERE comunidade_id = ? LIMIT 1",
  ).bind(context.comunidadeId).first();
  if (existing) return Response.json({ configured: true, alreadyConfigured: true });
  try {
    const community = await getD1().prepare("SELECT nome FROM comunidades WHERE id = ? LIMIT 1")
      .bind(context.comunidadeId).first<{ nome: string }>();
    const accessToken = await getDriveAccessToken(user.id);
    const rootFolderId = await createDriveFolder(accessToken, `VÍNKULO — ${community?.nome || "Comunidade"}`);
    const mediaFolderId = await createDriveFolder(accessToken, "Fotos e arquivos", rootFolderId);
    const chatFolderId = await createDriveFolder(accessToken, "Conversas criptografadas", rootFolderId);
    await getD1().prepare(
      `INSERT INTO community_drive_storage
        (comunidade_id, proprietario_usuario_id, pasta_raiz_id, pasta_midias_id,
         pasta_conversas_id, status_migracao, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).bind(context.comunidadeId, user.id, rootFolderId, mediaFolderId, chatFolderId).run();
    return Response.json({ configured: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
}
