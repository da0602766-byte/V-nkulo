import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { getGoogleConnection, getDriveAccessToken, DriveReconnectRequired, readDriveFile } from "../../../lib/google-integration";
import { copyFileToDrive } from "../../../lib/drive-file-copy";
import { MAX_COPY_BYTES, safeFileName } from "../../../lib/file-copy";

const noStore = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.ativo) return Response.json({ error: "Entre na sua conta para salvar no Drive." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_COPY_BYTES + 65536) return Response.json({ error: "Use arquivos de até 20 MB." }, { status: 413 });
  try {
    const connection = await getGoogleConnection(user.id);
    const token = await getDriveAccessToken(user.id);
    const current = await getGoogleConnection(user.id);
    if (!connection || current?.google_email !== connection.google_email || !current.drive_enabled || current.revoked_at) throw new DriveReconnectRequired("A conexão com o Drive mudou. Atualize a página antes de tentar novamente.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_COPY_BYTES) return Response.json({ error: "Selecione um arquivo de até 20 MB." }, { status: 400 });
    const copy = await copyFileToDrive(user.id, connection!.google_email, token, file);
    return Response.json(copy, { headers: noStore });
  } catch (error) {
    return Response.json({ error: (error as Error).message || "Não foi possível salvar no Drive.", reconnect: error instanceof DriveReconnectRequired }, { status: 409, headers: noStore });
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.ativo) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  try {
    const hash = new URL(request.url).searchParams.get("file");
    const connection = await getGoogleConnection(user.id);
    if (!connection?.drive_enabled || connection.revoked_at) return Response.json(hash ? { error: "Reconecte o Drive para baixar esta cópia." } : { files: [], connected: false }, { status: hash ? 409 : 200, headers: noStore });
    if (hash) {
      const record = await getD1().prepare(`SELECT drive_id, name FROM user_file_copies
        WHERE usuario_id = ? AND google_account = ? AND content_hash = ? AND status = 'READY'`)
        .bind(user.id, connection.google_email, hash).first<{ drive_id: string; name: string }>();
      if (!record) return new Response("Arquivo não encontrado.", { status: 404 });
      const file = await readDriveFile(await getDriveAccessToken(user.id), record.drive_id);
      return new Response(file.body, { headers: { ...noStore, "Content-Type": file.headers.get("content-type") || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(record.name))}` } });
    }
    const before = new URL(request.url).searchParams.get("before") || "~";
    const rows = await getD1().prepare(`SELECT content_hash AS hash, drive_id AS id, name, size, mime_type AS type FROM user_file_copies
      WHERE usuario_id = ? AND google_account = ? AND status = 'READY' AND content_hash < ? ORDER BY content_hash DESC LIMIT 51`)
      .bind(user.id, connection.google_email, before).all<{ hash: string; id: string; name: string; size: number; type: string }>();
    const files = rows.results.slice(0, 50);
    return Response.json({ files, connected: true, next: rows.results.length > 50 ? files.at(-1)?.hash : null }, { headers: noStore });
  } catch (error) {
    return Response.json({ error: (error as Error).message || "Não foi possível carregar seus arquivos." }, { status: 503, headers: noStore });
  }
}
