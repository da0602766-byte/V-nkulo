import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { canManageMinistry } from "../../../lib/ministry-access";
import { getActiveTenantContext } from "../../../lib/tenant";
import { UPLOAD_PURPOSES } from "../../../lib/upload-key-policy.mjs";
import {
  ensurePersonalDriveStorage,
  getDriveAccessToken,
  makeStorageReference,
  uploadDriveFile,
} from "../../../lib/google-integration";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Faça login para enviar imagens." }, { status: 401 });
  }
  if (!user.ativo) {
    return Response.json({ error: "Usuário inativo." }, { status: 403 });
  }
  const tenant = await getActiveTenantContext(user);

  const form = await request.formData();
  const purpose = String(form.get("purpose") || "");
  const resourceId = Number(form.get("resourceId") || 0);
  const file = form.get("file");
  if (!UPLOAD_PURPOSES.has(purpose)) {
    return Response.json({ error: "Destino do arquivo inválido." }, { status: 400 });
  }
  const context = tenant.context;
  const canEditCommunity = Boolean(
    context &&
      (user.system_owner === true ||
        context.communityAccess === "OWNER" ||
        context.papel === "ADMIN_COMUNIDADE"),
  );
  const canEditPlatform = user.system_owner === true;
  const canPublish = Boolean(context?.permissions.includes("feed.publish"));
  const isCommunityAsset =
    purpose === "community-logo" || purpose === "community-banner";
  const isMinistryAsset = purpose === "ministry-banner";
  const isPlatformAsset = [
    "login-logo",
    "login-background",
    "visual-editor-image",
    "platform-logo",
    "platform-feed-banner",
  ].includes(purpose);
  if (
    (isCommunityAsset && !canEditCommunity) ||
    (isMinistryAsset &&
      (!context ||
        !Number.isInteger(resourceId) ||
        resourceId <= 0 ||
        !(await canManageMinistry(
          getD1(),
          context,
          user.id,
          resourceId,
        )))) ||
    (purpose === "post-image" && !canPublish) ||
    (isPlatformAsset && !canEditPlatform)
  ) {
    return Response.json({ error: "Você não pode enviar imagens para esta área." }, { status: 403 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Selecione uma imagem." }, { status: 400 });
  }
  const extension = IMAGE_TYPES.get(file.type);
  if (!extension) {
    return Response.json(
      { error: "Formato não permitido. Use JPG, PNG ou WebP." },
      { status: 415 },
    );
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return Response.json(
      {
        error:
          "A imagem convertida deve ter no máximo 8 MB. Fotos originais de até 50 MB são convertidas automaticamente antes do envio.",
      },
      { status: 413 },
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidImageSignature(bytes, file.type)) {
    return Response.json(
      { error: "O conteúdo do arquivo não corresponde a uma imagem válida." },
      { status: 415 },
    );
  }
  const preference = await getD1().prepare(
    "SELECT provider FROM storage_preferences WHERE usuario_id = ? LIMIT 1",
  ).bind(user.id).first<{ provider: string }>();
  if (preference?.provider !== "GOOGLE_DRIVE") {
    return Response.json(
      {
        error:
          "Esta imagem está configurada para ficar somente neste aparelho. Para compartilhá-la nesta área, conecte o Google Drive em Minha conta.",
      },
      { status: 409 },
    );
  }
  const personal = purpose === "profile-photo" || isPlatformAsset;
  let driveOwnerId = user.id;
  let folderId = "";
  if (personal) {
    const accessToken = await getDriveAccessToken(user.id);
    folderId = (await ensurePersonalDriveStorage(user.id, accessToken)).mediaFolderId;
  } else {
    if (!context) {
      return Response.json({ error: "Selecione uma comunidade para guardar esta imagem." }, { status: 409 });
    }
    const storage = await getD1().prepare(
      `SELECT proprietario_usuario_id, pasta_midias_id
       FROM community_drive_storage WHERE comunidade_id = ? LIMIT 1`,
    ).bind(context.comunidadeId).first<{ proprietario_usuario_id: number; pasta_midias_id: string }>();
    if (!storage) {
      return Response.json(
        { error: "A administração ainda precisa ativar a pasta Google Drive desta comunidade." },
        { status: 409 },
      );
    }
    driveOwnerId = storage.proprietario_usuario_id;
    folderId = storage.pasta_midias_id;
  }
  try {
    const accessToken = await getDriveAccessToken(driveOwnerId);
    const stored = await uploadDriveFile(accessToken, {
      name: `${purpose}-${crypto.randomUUID()}.${extension}`,
      type: file.type,
      bytes,
      parentId: folderId,
      properties: {
        purpose,
        uploadedBy: String(user.id),
        communityId: String(context?.comunidadeId || 0),
      },
    });
    const scope = personal && purpose === "profile-photo" ? "profile" : "public";
    const reference = await makeStorageReference(scope, driveOwnerId, stored.id);
    return Response.json({
      url: `/api/storage/media/${reference}`,
      name: file.name.slice(0, 160),
      size: file.size,
      type: file.type,
      storage: "GOOGLE_DRIVE",
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
}

function hasValidImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return (
      bytes.length > 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    type === "image/webp" &&
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}
