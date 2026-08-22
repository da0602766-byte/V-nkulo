import { getRuntimeEnv } from "../../../../../db/runtime-env";
import { isSafeUploadKey } from "../../../../lib/upload-key-policy.mjs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const key = (await context.params).key.join("/");
  if (!isSafeUploadKey(key)) {
    return new Response("Imagem inválida.", { status: 400 });
  }
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket) return new Response("Armazenamento indisponível.", { status: 503 });
  const object = await bucket.get(key);
  if (!object) return new Response("Imagem não encontrada.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
