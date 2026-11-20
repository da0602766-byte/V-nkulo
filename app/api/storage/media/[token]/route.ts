import { DriveReconnectRequired, getDriveAccessToken, readDriveFile, readStorageReference } from "../../../../lib/google-integration";
import { getSessionUser } from "../../../../lib/local-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const reference = await readStorageReference((await context.params).token);
  if (!reference || !["public", "community", "profile"].includes(reference.scope)) {
    return new Response("Referência inválida.", { status: 400 });
  }
  try {
    const accessToken = await getDriveAccessToken(reference.ownerId);
    const file = await readDriveFile(accessToken, reference.fileId);
    const rawType = (file.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const safeType = ["image/jpeg", "image/png", "image/webp"].includes(rawType) ? rawType : "application/octet-stream";
    const headers = new Headers();
    headers.set("Content-Type", safeType);
    headers.set("Cache-Control", reference.scope === "public" ? "public, max-age=3600" : "private, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    if (safeType === "application/octet-stream" || new URL(request.url).searchParams.get("download") === "1") {
      headers.set("Content-Disposition", "attachment");
    }
    return new Response(file.body, { headers });
  } catch (error) {
    if (error instanceof DriveReconnectRequired) {
      const user = await getSessionUser();
      return new Response(error.message, { status: 409, headers: {
        "Cache-Control": "no-store",
        "X-Vinkulo-Media-Error": Number(user?.id) === reference.ownerId ? "DRIVE_RECONNECT" : "DRIVE_OWNER_RECONNECT",
      } });
    }
    return new Response((error as Error).message, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}

/** Diagnose authorization without downloading the file a second time. */
export async function HEAD(_request: Request, context: { params: Promise<{ token: string }> }) {
  const reference = await readStorageReference((await context.params).token);
  if (!reference || !["public", "community", "profile"].includes(reference.scope)) return new Response(null, { status: 400 });
  const headers = new Headers({ "Cache-Control": "no-store" });
  try {
    await getDriveAccessToken(reference.ownerId);
    return new Response(null, { headers });
  } catch (error) {
    if (!(error instanceof DriveReconnectRequired)) return new Response(null, { status: 503, headers });
    const user = await getSessionUser();
    headers.set("X-Vinkulo-Media-Error", Number(user?.id) === reference.ownerId ? "DRIVE_RECONNECT" : "DRIVE_OWNER_RECONNECT");
    return new Response(null, { status: 409, headers });
  }
}
