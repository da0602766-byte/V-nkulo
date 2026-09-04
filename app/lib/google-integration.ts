import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const BASE_SCOPES = ["openid", "email", "profile"];

type GoogleIdentity = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
};

type OAuthState = {
  purpose: "login" | "drive";
  userId: number;
  returnTo: string;
  nonce: string;
  expiresAt: number;
  channel?: "android";
  pairingHash?: string;
};

export function googleIntegrationAvailable() {
  const env = getRuntimeEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && credentialSecret());
}

export async function createGoogleAuthorization(
  origin: string,
  state: Omit<OAuthState, "nonce" | "expiresAt">,
) {
  const env = requireGoogleConfig();
  const nonce = randomToken(24);
  const signedState = await signState({
    ...state,
    nonce,
    expiresAt: Date.now() + 10 * 60_000,
  });
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [...BASE_SCOPES, ...(state.purpose === "drive" ? [DRIVE_SCOPE] : [])].join(" "));
  url.searchParams.set("state", signedState);
  url.searchParams.set("include_granted_scopes", "true");
  if (state.purpose === "drive") {
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("access_type", "offline");
  }
  return { url: url.toString(), nonce };
}

export async function readGoogleState(value: string): Promise<OAuthState | null> {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(encoded);
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as OAuthState;
    if (!parsed.nonce || !parsed.purpose || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function exchangeGoogleCode(code: string, origin: string) {
  const env = requireGoogleConfig();
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const body = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    scope?: string;
    error_description?: string;
  };
  if (!response.ok || !body.id_token) {
    throw new Error(body.error_description || "O Google não confirmou a autorização.");
  }
  return body;
}

export async function verifyGoogleIdentity(idToken: string): Promise<GoogleIdentity> {
  const env = requireGoogleConfig();
  const response = await fetch(`${GOOGLE_TOKEN_INFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`, {
    headers: { Accept: "application/json" },
  });
  const body = await response.json() as Record<string, unknown>;
  const issuer = String(body.iss || "");
  const audience = String(body.aud || "");
  const expiresAt = Number(body.exp || 0) * 1000;
  const verified = body.email_verified === true || body.email_verified === "true";
  if (
    !response.ok ||
    audience !== env.clientId ||
    !["accounts.google.com", "https://accounts.google.com"].includes(issuer) ||
    expiresAt <= Date.now() ||
    !verified ||
    !body.sub ||
    !body.email
  ) {
    throw new Error("A identidade retornada pelo Google não pôde ser validada.");
  }
  return {
    sub: String(body.sub),
    email: String(body.email).trim().toLowerCase(),
    email_verified: true,
    name: String(body.name || ""),
    picture: String(body.picture || ""),
  };
}

export async function saveGoogleConnection(
  userId: number,
  identity: GoogleIdentity,
  tokens: { refresh_token?: string; scope?: string },
  driveEnabled: boolean,
) {
  const existing = await getD1()
    .prepare("SELECT refresh_token_ciphertext, refresh_token_iv, drive_enabled, scopes FROM google_connections WHERE usuario_id = ? LIMIT 1")
    .bind(userId)
    .first<{ refresh_token_ciphertext: string | null; refresh_token_iv: string | null; drive_enabled: number; scopes: string }>();
  // google_sub tem índice único. Sem esta checagem o INSERT abaixo estoura a
  // restrição e devolve o erro cru do banco para a tela do usuário, porque o
  // ON CONFLICT só cobre usuario_id.
  const linkedElsewhere = await getD1()
    .prepare("SELECT usuario_id FROM google_connections WHERE google_sub = ? AND usuario_id <> ? LIMIT 1")
    .bind(identity.sub, userId)
    .first<{ usuario_id: number }>();
  if (linkedElsewhere) {
    throw new Error("Esta Conta Google já está vinculada a outro cadastro do Vínkulo.");
  }
  const encrypted = tokens.refresh_token
    ? await encryptSecret(tokens.refresh_token)
    : existing?.refresh_token_ciphertext && existing.refresh_token_iv
      ? { ciphertext: existing.refresh_token_ciphertext, iv: existing.refresh_token_iv }
      : null;
  if (driveEnabled && !encrypted) {
    throw new Error("O Google não forneceu autorização contínua para o Drive. Tente conectar novamente.");
  }
  await getD1().prepare(
    `INSERT INTO google_connections
      (usuario_id, google_sub, google_email, refresh_token_ciphertext, refresh_token_iv,
       scopes, drive_enabled, connected_at, revoked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(usuario_id) DO UPDATE SET
       google_sub = excluded.google_sub,
       google_email = excluded.google_email,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       refresh_token_iv = excluded.refresh_token_iv,
       scopes = excluded.scopes,
       drive_enabled = excluded.drive_enabled,
       revoked_at = NULL,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    userId,
    identity.sub,
    identity.email,
    encrypted?.ciphertext || null,
    encrypted?.iv || null,
    tokens.scope || existing?.scopes || BASE_SCOPES.join(" "),
    driveEnabled || existing?.drive_enabled ? 1 : 0,
  ).run();
}

export async function getGoogleConnection(userId: number) {
  return getD1().prepare(
    `SELECT google_email, scopes, drive_enabled, connected_at, revoked_at,
      refresh_token_ciphertext, refresh_token_iv
     FROM google_connections WHERE usuario_id = ? LIMIT 1`,
  ).bind(userId).first<{
    google_email: string;
    scopes: string;
    drive_enabled: number;
    connected_at: string;
    revoked_at: string | null;
    refresh_token_ciphertext: string | null;
    refresh_token_iv: string | null;
  }>();
}

export async function disconnectGoogleDrive(userId: number) {
  const connection = await getGoogleConnection(userId);
  if (connection?.refresh_token_ciphertext && connection.refresh_token_iv) {
    const token = await decryptSecret(connection.refresh_token_ciphertext, connection.refresh_token_iv);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => null);
  }
  await getD1().prepare(
    `UPDATE google_connections SET refresh_token_ciphertext = NULL, refresh_token_iv = NULL,
      drive_enabled = 0, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE usuario_id = ?`,
  ).bind(userId).run();
}

export async function getDriveAccessToken(userId: number) {
  const connection = await getGoogleConnection(userId);
  if (
    !connection ||
    !connection.drive_enabled ||
    connection.revoked_at ||
    !connection.refresh_token_ciphertext ||
    !connection.refresh_token_iv
  ) {
    throw new Error("Conecte seu Google Drive antes de continuar.");
  }
  const env = requireGoogleConfig();
  const refreshToken = await decryptSecret(connection.refresh_token_ciphertext, connection.refresh_token_iv);
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || "A autorização do Google Drive expirou.");
  }
  return body.access_token;
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string) {
  const response = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: "POST",
    headers: googleHeaders(accessToken, "application/json"),
    body: JSON.stringify({
      name: name.slice(0, 160),
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
      appProperties: { vinkuloManaged: "true" },
    }),
  });
  const body = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !body.id) throw new Error(body.error?.message || "Não foi possível criar a pasta no Drive.");
  return body.id;
}

export async function ensurePersonalDriveStorage(userId: number, accessToken: string) {
  const existing = await getD1().prepare(
    "SELECT pasta_raiz_id, pasta_midias_privadas_id FROM user_drive_storage WHERE usuario_id = ? LIMIT 1",
  ).bind(userId).first<{ pasta_raiz_id: string; pasta_midias_privadas_id: string }>();
  if (existing) return { rootFolderId: existing.pasta_raiz_id, mediaFolderId: existing.pasta_midias_privadas_id };
  const rootFolderId = await createDriveFolder(accessToken, "VÍNKULO — Arquivos pessoais");
  const mediaFolderId = await createDriveFolder(accessToken, "Fotos e arquivos privados", rootFolderId);
  await getD1().prepare(
    `INSERT INTO user_drive_storage
      (usuario_id, pasta_raiz_id, pasta_midias_privadas_id, criado_em, atualizado_em)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).bind(userId, rootFolderId, mediaFolderId).run();
  return { rootFolderId, mediaFolderId };
}

export async function uploadDriveFile(
  accessToken: string,
  file: { name: string; type: string; bytes: Uint8Array; parentId: string; properties?: Record<string, string> },
) {
  const boundary = `vinkulo_${crypto.randomUUID().replaceAll("-", "")}`;
  const metadata = JSON.stringify({
    name: file.name.slice(0, 160),
    parents: [file.parentId],
    appProperties: { vinkuloManaged: "true", ...(file.properties || {}) },
  });
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + file.bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(file.bytes, prefix.length);
  body.set(suffix, prefix.length + file.bytes.length);
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime`, {
    method: "POST",
    headers: googleHeaders(accessToken, `multipart/related; boundary=${boundary}`),
    body,
  });
  const result = await response.json() as { id?: string; name?: string; mimeType?: string; size?: string; createdTime?: string; error?: { message?: string } };
  if (!response.ok || !result.id) throw new Error(result.error?.message || "Não foi possível guardar o arquivo no Google Drive.");
  return result as { id: string; name: string; mimeType: string; size: string; createdTime: string };
}

export async function readDriveFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("O arquivo não está mais disponível no Google Drive.");
  return response;
}

export async function deleteDriveFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error("Não foi possível excluir o arquivo do Google Drive.");
  }
}

export async function listDriveFiles(accessToken: string, parentId: string, pageSize = 100) {
  const query = `'${parentId.replaceAll("'", "\\'")}' in parents and trashed = false`;
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", query);
  url.searchParams.set("orderBy", "createdTime desc");
  url.searchParams.set("pageSize", String(Math.min(100, Math.max(1, pageSize))));
  url.searchParams.set("fields", "files(id,name,mimeType,createdTime,modifiedTime,appProperties,size)");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  const body = await response.json() as { files?: Array<Record<string, unknown>>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Não foi possível listar os arquivos do Google Drive.");
  return body.files || [];
}

export async function encryptDrivePayload(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clear = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), clear);
  return new TextEncoder().encode(JSON.stringify({
    version: 1,
    algorithm: "AES-GCM",
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(encrypted)),
  }));
}

export async function decryptDrivePayload<T>(bytes: Uint8Array): Promise<T> {
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as {
    version: number;
    iv: string;
    ciphertext: string;
  };
  if (envelope.version !== 1 || !envelope.iv || !envelope.ciphertext) {
    throw new Error("Conteúdo do Drive incompatível.");
  }
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(envelope.iv) },
    await encryptionKey(),
    fromBase64Url(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(clear)) as T;
}

export async function makeStorageReference(scope: string, ownerId: number, fileId: string) {
  const payload = `${scope}:${ownerId}:${fileId}`;
  return `${toBase64Url(new TextEncoder().encode(payload))}.${await hmac(payload)}`;
}

export async function readStorageReference(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  let payload = "";
  try { payload = new TextDecoder().decode(fromBase64Url(encoded)); } catch { return null; }
  if (!safeEqual(signature, await hmac(payload))) return null;
  const [scope, owner, fileId] = payload.split(":");
  const ownerId = Number(owner);
  return scope && Number.isInteger(ownerId) && ownerId > 0 && fileId
    ? { scope, ownerId, fileId }
    : null;
}

function requireGoogleConfig() {
  const env = getRuntimeEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !credentialSecret()) {
    throw new Error("A integração Google ainda precisa ser ativada pelo proprietário do Vínkulo.");
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

function credentialSecret() {
  const env = getRuntimeEnv();
  return env.GOOGLE_CREDENTIALS_SECRET || env.AUTH_SECRET || "";
}

async function signState(state: OAuthState) {
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  return `${encoded}.${await hmac(encoded)}`;
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(credentialSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function encryptionKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vinkulo-google:${credentialSecret()}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { ciphertext: toBase64Url(new Uint8Array(encrypted)), iv: toBase64Url(iv) };
}

async function decryptSecret(ciphertext: string, iv: string) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    await encryptionKey(),
    fromBase64Url(ciphertext),
  );
  return new TextDecoder().decode(clear);
}

function googleHeaders(accessToken: string, contentType: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType, Accept: "application/json" };
}

function randomToken(bytes: number) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
