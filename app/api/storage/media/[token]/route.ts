import { getSessionUser } from "../../../../lib/local-auth";
import { authorizeMedia } from "../../../../lib/media-access";
import { getDriveAccessToken, readDriveFile, readStorageReference } from "../../../../lib/google-integration";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = (await context.params).token;
  const reference = await readStorageReference(token);
  if (!reference || !["public", "community", "profile"].includes(reference.scope)) {
    return new Response("Arquivo não encontrado.", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!(await authorizeMedia(`/api/storage/media/${token}`, await getSessionUser()))) {
    return new Response("Arquivo não encontrado.", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const accessToken = await getDriveAccessToken(reference.ownerId);
    const file = await readDriveFile(accessToken, reference.fileId);
    const headers = new Headers();
    headers.set("Content-Type", file.headers.get("content-type") || "application/octet-stream");
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    if (new URL(request.url).searchParams.get("download") === "1") {
      headers.set("Content-Disposition", "attachment");
    }
    return new Response(file.body, { headers });
  } catch {
    return new Response("Arquivo indisponível.", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
