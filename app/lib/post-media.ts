import { getD1 } from "../../db";

export async function canAttachPostMedia(url: string, userId: number, communityId: number, postId = 0) {
  if (!url) return true;
  const db = getD1();
  // The route already authorized the editor. Existing media can be retained by a
  // moderator, while a new address still has to belong to the current uploader.
  if (postId && await db.prepare(`SELECT 1 FROM publicacoes_piloto WHERE id = ? AND comunidade_id = ?
    AND (imagem_url = ? OR imagem_thumbnail_url = ?)`).bind(postId, communityId, url, url).first()) return true;
  const token = url.startsWith("/api/storage/media/") ? url.slice("/api/storage/media/".length) : "";
  return Boolean(await db.prepare(`SELECT 1 FROM storage_files WHERE id = ? AND uploaded_by = ?
    AND community_id = ? AND purpose = 'post-image' AND revoked_at IS NULL
    AND (resource_id IS NULL OR resource_id = ?)`).bind(token, userId, communityId, postId).first());
}

export async function bindPostMedia(url: string, userId: number, communityId: number, postId: number) {
  if (!url.startsWith("/api/storage/media/")) return;
  await getD1().prepare(`UPDATE storage_files SET resource_id = ? WHERE id = ? AND uploaded_by = ?
    AND community_id = ? AND purpose = 'post-image' AND resource_id IS NULL`)
    .bind(postId, url.slice("/api/storage/media/".length), userId, communityId).run();
}
