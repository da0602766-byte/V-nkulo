import { getSessionUser } from "../../../../lib/local-auth";
import { authorizeMedia } from "../../../../lib/media-access";
import { getRuntimeEnv } from "../../../../../db/runtime-env";
import { isSafeUploadKey } from "../../../../lib/upload-key-policy.mjs";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const key = (await context.params).key.join("/");
  if (!isSafeUploadKey(key)) {
    return new Response("Arquivo não encontrado.", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!(await authorizeMedia(`/api/pilot/uploads/${key}`, await getSessionUser()))) {
    return new Response("Arquivo não encontrado.", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket) return new Response("Armazenamento indisponível.", { status: 503 });
  const object = await bucket.get(key);
  if (!object) return new Response("Imagem não encontrada.", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const fileName = key.split("/").at(-1) || "imagem.jpg";
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, no-store",
      ...(download
        ? { "Content-Disposition": `attachment; filename="${fileName}"` }
        : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
