import { getD1 } from "../../../../../db";
import { getSessionUser } from "../../../../lib/local-auth";
import { getDriveAccessToken, readDriveFile, readStorageReference } from "../../../../lib/google-integration";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !user.ativo) return new Response("Acesso não autorizado.", { status: 401 });
  const id = Number((await context.params).id || 0);
  if (!Number.isInteger(id) || id <= 0) return new Response("Foto inválida.", { status: 400 });

  const item = await getD1().prepare(
    "SELECT usuario_id, imagem_chave FROM feedback_plataforma WHERE id = ? LIMIT 1",
  ).bind(id).first<{ usuario_id: number; imagem_chave: string }>();
  if (!item?.imagem_chave) return new Response("Foto não encontrada.", { status: 404 });
  if (!user.system_owner && Number(item.usuario_id) !== Number(user.id)) {
    return new Response("Acesso não autorizado.", { status: 403 });
  }

  const reference = await readStorageReference(item.imagem_chave);
  if (!reference || reference.scope !== "feedback") {
    return new Response("Foto não encontrada.", { status: 404 });
  }
  const accessToken = await getDriveAccessToken(reference.ownerId).catch(() => "");
  if (!accessToken) return new Response("Google Drive desconectado.", { status: 409 });
  const object = await readDriveFile(accessToken, reference.fileId).catch(() => null);
  if (!object) return new Response("Foto não encontrada.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
