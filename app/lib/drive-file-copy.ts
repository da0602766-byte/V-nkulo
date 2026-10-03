import { getD1 } from "../../db";
import { contentHash, safeFileName } from "./file-copy";

const API = "https://www.googleapis.com/drive/v3/files";
type Copy = { drive_id: string; content_hash: string; status: string; name: string; mime_type: string; size: number };

async function generateId(token: string) {
  const response = await fetch(`${API}/generateIds?count=1&space=drive&type=files`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json() as { ids?: string[] };
  if (!response.ok || !data.ids?.[0]) throw new Error("Não foi possível preparar a cópia no Drive. Tente novamente.");
  return data.ids[0];
}

/** Copy only: never updates/deletes source files, permissions or publications. */
export async function copyFileToDrive(userId: number, account: string, token: string, file: File) {
  const db = getD1();
  const hash = await contentHash(file);
  const auth = { Authorization: `Bearer ${token}` };
  const select = () => db.prepare("SELECT * FROM user_file_copies WHERE usuario_id = ? AND google_account = ? AND content_hash = ?")
    .bind(userId, account, hash).first<Copy>();
  let record = await select();
  if (!record) {
    const id = await generateId(token);
    await db.prepare(`INSERT OR IGNORE INTO user_file_copies
      (usuario_id, google_account, content_hash, drive_id, name, mime_type, size)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, account, hash, id, safeFileName(file.name, file.type), file.type || "application/octet-stream", file.size).run();
    record = await select();
  }
  if (!record) throw new Error("Não foi possível registrar a cópia. Tente novamente.");
  let check = await fetch(`${API}/${encodeURIComponent(record.drive_id)}?fields=id,trashed,sha256Checksum,size`, { headers: auth });
  // A previously completed copy was permanently removed. Reserve one replacement ID.
  if (check.status === 404 && record.status === "READY") {
    const id = await generateId(token);
    await db.prepare(`UPDATE user_file_copies SET drive_id = ?, status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE usuario_id = ? AND google_account = ? AND content_hash = ? AND drive_id = ?`)
      .bind(id, userId, account, hash, record.drive_id).run();
    record = (await select())!;
    check = await fetch(`${API}/${encodeURIComponent(record.drive_id)}?fields=id,trashed,sha256Checksum,size`, { headers: auth });
  }
  const existed = check.ok;
  if (check.ok) {
    const metadata = await check.json() as { trashed?: boolean; sha256Checksum?: string; size?: string };
    if (metadata.trashed) throw new Error("Esta cópia está na lixeira do Drive. Restaure-a no Drive e tente novamente.");
    if (metadata.sha256Checksum && metadata.sha256Checksum !== hash) throw new Error("A cópia foi editada no Drive. O original foi preservado; baixe-o no aparelho para guardar outra versão.");
    if (!metadata.sha256Checksum) await verifyCopy(token, record.drive_id, hash);
  } else {
    if (check.status !== 404) throw new Error("Não foi possível verificar o Drive. Tente novamente sem criar outra cópia.");
    // A resumable upload handles files up to our 20 MB bound. The reserved ID
    // is reused even after timeouts; Google rejects duplicate creates with 409.
    const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
      method: "POST", headers: { ...auth, "Content-Type": "application/json", "X-Upload-Content-Type": record.mime_type, "X-Upload-Content-Length": String(file.size) },
      body: JSON.stringify({ id: record.drive_id, name: record.name, appProperties: { vinkuloManaged: "true", vinkuloCopyHash: hash } }),
    });
    if (start.status !== 409) {
      const uploadUrl = start.headers.get("location");
      if (!start.ok || !uploadUrl || new URL(uploadUrl).origin !== "https://www.googleapis.com") throw new Error("O Drive não iniciou o envio. Tente novamente.");
      const sent = await fetch(uploadUrl, { method: "PUT", headers: { ...auth, "Content-Type": record.mime_type }, body: file });
      if (!sent.ok && sent.status !== 409) throw new Error("O envio foi interrompido. Tente novamente; a cópia não será duplicada.");
    }
    await verifyCopy(token, record.drive_id, hash);
  }
  await db.prepare(`UPDATE user_file_copies SET status = 'READY', updated_at = CURRENT_TIMESTAMP
    WHERE usuario_id = ? AND google_account = ? AND content_hash = ? AND drive_id = ?`)
    .bind(userId, account, hash, record.drive_id).run();
  return { hash, id: record.drive_id, name: record.name, alreadySaved: existed };
}

async function verifyCopy(token: string, id: string, expected: string) {
  const response = await fetch(`${API}/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok || await contentHash(await response.blob()) !== expected) throw new Error("O Drive ainda não confirmou o arquivo completo. Tente novamente; o original foi preservado.");
}
