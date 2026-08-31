import { getDriveAccessToken, readDriveFile, readStorageReference } from "../../../../lib/google-integration";

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
    const headers = new Headers();
    headers.set("Content-Type", file.headers.get("content-type") || "application/octet-stream");
    headers.set("Cache-Control", reference.scope === "public" ? "public, max-age=3600" : "private, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    if (new URL(request.url).searchParams.get("download") === "1") {
      headers.set("Content-Disposition", "attachment");
    }
    return new Response(file.body, { headers });
  } catch (error) {
    return new Response((error as Error).message, { status: 404 });
  }
}
