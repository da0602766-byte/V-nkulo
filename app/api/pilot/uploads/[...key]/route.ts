import { getRuntimeEnv } from "../../../../../db/runtime-env";
import { isSafeUploadKey } from "../../../../lib/upload-key-policy.mjs";
import { readCopiedImage } from "../../../../lib/supabase-storage-copy";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const key = (await context.params).key.join("/");
  if (!isSafeUploadKey(key)) {
    return new Response("Imagem inválida.", { status: 400 });
  }
  const db = getRuntimeEnv().DB;
  if (db && await db.prepare('SELECT 1 FROM platform_reset_files WHERE object_key=? LIMIT 1').bind(key).first()) {
    return new Response('Imagem não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const object = await getRuntimeEnv().BUCKET?.get(key);
  let copied: Response | null = null;
  if (!object) {
    try { copied = await readCopiedImage(key); }
    catch { return new Response("Armazenamento indisponível.", { status: 503 }); }
  }
  if (!object && !copied) return new Response("Imagem não encontrada.", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const fileName = key.split("/").at(-1) || "imagem.jpg";
  return new Response(object?.body || copied?.body, {
    headers: {
      "Content-Type": object?.httpMetadata?.contentType || copied?.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": download ? "private, no-store" : "public, max-age=31536000, immutable",
      ...(download
        ? { "Content-Disposition": `attachment; filename="${fileName}"` }
        : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
