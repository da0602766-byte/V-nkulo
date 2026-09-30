import { getRuntimeEnv, type R2BucketBinding } from "../../../../../db/runtime-env";
import { isSafeUploadKey } from "../../../../lib/upload-key-policy.mjs";
import { readCopiedImage } from "../../../../lib/supabase-storage-copy";
import { getStorageReadPolicy } from "../../../../lib/supabase-storage-routing";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const key = (await context.params).key.join("/");
  if (!isSafeUploadKey(key)) {
    return new Response("Imagem inválida.", { status: 400 });
  }
  const db = getRuntimeEnv().DB;
  let policy;
  try { policy = db ? await getStorageReadPolicy(key) : { source: "R2", deleted: false }; }
  catch { return new Response("Armazenamento indisponível.", { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (policy.deleted) {
    return new Response('Imagem não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  let object: Awaited<ReturnType<R2BucketBinding["get"]>> | undefined;
  let copied: Response | null = null;
  let storageFailed = false;
  const preferSupabase = policy.source === "SUPABASE";
  if (preferSupabase) {
    try { copied = await readCopiedImage(key); }
    catch { storageFailed = true; }
  }
  if (!copied) {
    try { object = await getRuntimeEnv().BUCKET?.get(key); }
    catch { storageFailed = true; }
  }
  if (!object && !copied && !preferSupabase) {
    try { copied = await readCopiedImage(key); }
    catch { storageFailed = true; }
  }
  if (!object && !copied && storageFailed) {
    return new Response("Armazenamento indisponível.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  // Uma exclusão iniciada durante a leitura também bloqueia a resposta.
  if (db && await db.prepare('SELECT 1 FROM platform_reset_files WHERE object_key=? LIMIT 1').bind(key).first()) {
    await object?.body.cancel();
    await copied?.body?.cancel();
    return new Response('Imagem não encontrada.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
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
      "X-Vinkulo-Storage": copied ? "supabase" : "r2",
    },
  });
}
