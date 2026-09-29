import { getRuntimeEnv } from "../../db/runtime-env";
import { getD1 } from "../../db";
import { isSafeUploadKey } from "./upload-key-policy.mjs";
import { readIntegration, reveal } from "./supabase-integration";

const MAX_OBJECT_BYTES = 16 * 1024 * 1024;
const PAGE_SIZE = 20;

export class SupabaseStorageCopyError extends Error {
  constructor(message: string, public readonly status = 424) { super(message); }
}

async function target() {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey || !saved.config.bucket) {
    throw new SupabaseStorageCopyError("Ative a integração e configure um bucket privado antes de copiar arquivos.", 409);
  }
  const config = {
    url: saved.config.url,
    bucket: saved.config.bucket,
    secret: await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${config.url}/storage/v1/bucket`, {
      headers: { apikey: config.secret, Authorization: `Bearer ${config.secret}` },
      redirect: "manual", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new SupabaseStorageCopyError("Não foi possível conferir o bucket no Supabase.", 409);
    const buckets = await response.json() as Array<{ id?: string; name?: string; public?: boolean }>;
    const bucket = Array.isArray(buckets) ? buckets.find(item => item.id === config.bucket || item.name === config.bucket) : null;
    if (!bucket) throw new SupabaseStorageCopyError("O bucket configurado não foi encontrado no Supabase.", 409);
    if (bucket.public !== false) throw new SupabaseStorageCopyError("Configure o bucket do Supabase como privado antes de copiar arquivos.", 409);
    return config;
  } finally { clearTimeout(timeout); }
}

function objectUrl(config: Awaited<ReturnType<typeof target>>, key: string, method: string) {
  const access = method === "GET" ? "authenticated/" : "";
  return `${config.url}/storage/v1/object/${access}${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function storageFetch(config: Awaited<ReturnType<typeof target>>, key: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(objectUrl(config, key, init.method || "GET"), {
      ...init,
      headers: { apikey: config.secret, Authorization: `Bearer ${config.secret}`, ...init.headers },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function digest(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readBounded(stream: ReadableStream) {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value instanceof Uint8Array ? value : new Uint8Array(value);
      size += part.byteLength;
      if (size > MAX_OBJECT_BYTES) throw new SupabaseStorageCopyError("Um arquivo excede o limite de 16 MB. A cópia foi interrompida.", 409);
      parts.push(part);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (size < 1) throw new SupabaseStorageCopyError("Um arquivo está vazio.", 409);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes.buffer;
}

async function compareRemote(config: Awaited<ReturnType<typeof target>>, key: string, source: ArrayBuffer) {
  const remote = await storageFetch(config, key, { method: "GET" });
  if (remote.status === 404) {
    const body = await remote.json().catch(() => null) as { code?: string; error?: string } | null;
    if (body?.code === "NoSuchKey" || body?.error === "not_found") return "missing" as const;
    throw new SupabaseStorageCopyError("O bucket configurado não foi encontrado ou está indisponível no Supabase.", 409);
  }
  if (!remote.ok) throw new SupabaseStorageCopyError(`Não foi possível conferir um arquivo no Supabase (HTTP ${remote.status}).`);
  const contentLength = Number(remote.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_OBJECT_BYTES) {
    throw new SupabaseStorageCopyError("Um arquivo no Supabase excede o limite de conferência.", 409);
  }
  if (!remote.body) throw new SupabaseStorageCopyError("O Supabase não devolveu o conteúdo do arquivo.");
  const bytes = await readBounded(remote.body);
  if (await digest(bytes) !== await digest(source)) {
    throw new SupabaseStorageCopyError("Um arquivo já existe no Supabase com conteúdo diferente. A cópia foi interrompida.", 409);
  }
  return "equal" as const;
}

async function recordCopy(key: string, config: Awaited<ReturnType<typeof target>>, bytes: ArrayBuffer) {
  const projectRef = new URL(config.url).hostname.split(".")[0];
  const db = getD1();
  const current = await db.prepare("SELECT project_ref,bucket FROM supabase_storage_copies WHERE object_key=?")
    .bind(key).first<{ project_ref: string; bucket: string }>();
  if (current && (current.project_ref !== projectRef || current.bucket !== config.bucket)) {
    throw new SupabaseStorageCopyError("O arquivo foi copiado para outro projeto Supabase. Revise a configuração antes de continuar.", 409);
  }
  await db.prepare(`INSERT INTO supabase_storage_copies(object_key,project_ref,bucket,sha256)
    VALUES(?,?,?,?) ON CONFLICT(object_key) DO UPDATE SET sha256=excluded.sha256,copied_at=CURRENT_TIMESTAMP`)
    .bind(key, projectRef, config.bucket, await digest(bytes)).run();
}

export async function deleteSupabaseStoredImage(key: string) {
  const db = getD1();
  const record = await db.prepare("SELECT project_ref,bucket FROM supabase_storage_copies WHERE object_key=?")
    .bind(key).first<{ project_ref: string; bucket: string }>();
  if (!record) return;
  const saved = await readIntegration();
  if (!saved?.config.serviceRoleKey || new URL(saved.config.url).hostname.split(".")[0] !== record.project_ref || saved.config.bucket !== record.bucket) {
    throw new SupabaseStorageCopyError("A configuração original do Supabase é necessária para excluir esta cópia.", 409);
  }
  const config = { url: saved.config.url, bucket: record.bucket,
    secret: await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`) };
  const response = await storageFetch(config, key, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new SupabaseStorageCopyError("Não foi possível excluir a cópia no Supabase.");
  await db.prepare("DELETE FROM supabase_storage_copies WHERE object_key=?").bind(key).run();
}

export async function readCopiedImage(key: string): Promise<Response | null> {
  if (!isSafeUploadKey(key)) return null;
  const record = await getD1().prepare("SELECT project_ref,bucket FROM supabase_storage_copies WHERE object_key=?")
    .bind(key).first<{ project_ref: string; bucket: string }>();
  if (!record) return null;
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey || new URL(saved.config.url).hostname.split(".")[0] !== record.project_ref
    || saved.config.bucket !== record.bucket) {
    throw new SupabaseStorageCopyError("A cópia do arquivo não está disponível neste projeto Supabase.", 503);
  }
  const config = { url: saved.config.url, bucket: record.bucket,
    secret: await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`) };
  const response = await storageFetch(config, key, { method: "GET" });
  if (!response.ok) throw new SupabaseStorageCopyError("A cópia do arquivo não pôde ser lida no Supabase.", 503);
  return response;
}

export async function rollbackStorageCopyPage() {
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket) throw new SupabaseStorageCopyError("O R2 precisa estar disponível para desfazer as cópias.", 503);
  const db = getD1();
  const rows = await db.prepare("SELECT object_key,project_ref,bucket,sha256 FROM supabase_storage_copies ORDER BY object_key LIMIT ?")
    .bind(PAGE_SIZE).all<{ object_key: string; project_ref: string; bucket: string; sha256: string }>();
  let removed = 0;
  for (const row of rows.results) {
    const original = await bucket.get(row.object_key);
    if (!original) throw new SupabaseStorageCopyError("O original no R2 não foi encontrado. A cópia foi preservada.", 409);
    const bytes = await readBounded(original.body);
    if (await digest(bytes) !== row.sha256) {
      throw new SupabaseStorageCopyError("O original no R2 mudou. A cópia foi preservada para revisão.", 409);
    }
    const saved = await readIntegration();
    if (!saved?.config.serviceRoleKey || new URL(saved.config.url).hostname.split(".")[0] !== row.project_ref
      || saved.config.bucket !== row.bucket) {
      throw new SupabaseStorageCopyError("A configuração original do Supabase é necessária para desfazer esta cópia.", 409);
    }
    const config = { url: saved.config.url, bucket: row.bucket,
      secret: await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`) };
    const remote = await compareRemote(config, row.object_key, bytes);
    if (remote === "equal") await deleteSupabaseStoredImage(row.object_key);
    else await db.prepare("DELETE FROM supabase_storage_copies WHERE object_key=?").bind(row.object_key).run();
    removed += 1;
  }
  const remaining = await db.prepare("SELECT COUNT(*) AS total FROM supabase_storage_copies").first<{ total: number }>();
  return { removed, remaining: Number(remaining?.total || 0) };
}

export async function copyStoragePage(cursor?: string) {
  if (cursor && cursor.length > 1024) {
    throw new SupabaseStorageCopyError("Cursor da página inválido.", 400);
  }
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket?.list) throw new SupabaseStorageCopyError("O bucket R2 não está disponível para inventário.", 503);
  try {
    await getD1().prepare("SELECT 1 FROM supabase_storage_copies LIMIT 1").first();
  } catch {
    throw new SupabaseStorageCopyError("A migração 0083 do D1 precisa ser aplicada antes de copiar arquivos.", 409);
  }
  const config = await target();
  const page = await bucket.list({ cursor, limit: PAGE_SIZE });
  if (page.truncated && !page.cursor) throw new SupabaseStorageCopyError("O R2 não devolveu a próxima página.", 503);
  const result = { scanned: page.objects.length, copied: 0, verified: 0, skipped: 0,
    nextCursor: page.truncated ? page.cursor! : null };
  for (const { key } of page.objects) {
    // O inventário inclui outros objetos da aplicação. Só imagens hospedadas
    // com o formato conhecido podem ser copiadas por esta rotina.
    if (!isSafeUploadKey(key)) { result.skipped += 1; continue; }
    const object = await bucket.get(key);
    if (!object) throw new SupabaseStorageCopyError("Um arquivo do R2 desapareceu durante a cópia. Tente novamente.", 409);
    const bytes = await readBounded(object.body);
    const state = await compareRemote(config, key, bytes);
    if (state === "equal") { await recordCopy(key, config, bytes); result.verified += 1; continue; }
    const uploaded = await storageFetch(config, key, {
      method: "POST",
      headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "x-upsert": "false" },
      body: bytes,
    });
    if (!uploaded.ok && uploaded.status !== 400 && uploaded.status !== 409) {
      throw new SupabaseStorageCopyError(`O Supabase recusou a cópia de um arquivo (HTTP ${uploaded.status}).`);
    }
    // A confirmação de bytes evita considerar um conflito de nome como sucesso.
    if (await compareRemote(config, key, bytes) !== "equal") {
      throw new SupabaseStorageCopyError("O Supabase não confirmou o arquivo copiado.");
    }
    await recordCopy(key, config, bytes);
    result.copied += 1;
  }
  return result;
}
