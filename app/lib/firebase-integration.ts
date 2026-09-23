import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";

export const FIREBASE_PROJECT = "vinkulo-256e8";
const CONFIG_KEY = "firebase_fcm_integration";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT}/messages:send`;
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const base64url = (bytes: Uint8Array) => encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export class FirebaseInputError extends Error {}
type Credential = { project_id: string; client_email: string; private_key: string };
export type FirebaseConfig = { id: string; projectId: string; clientEmail: string; iv: string; ciphertext: string;
  checkedAt: string; updatedAt: string };
let accessCache: { id: string; token: string; expiresAt: number } | null = null;
let accessFlight: { id: string; promise: Promise<string> } | null = null;

async function encryptionKey() {
  const secret = getRuntimeEnv().AUTH_SECRET;
  if (!secret) throw new Error("Proteção do servidor indisponível.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`vinkulo:firebase:v1:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function privateKey(pem: string) {
  const envelope = pem.match(/^-----BEGIN (PRIVATE KEY)-----([\s\S]+)-----END \1-----\s*$/);
  if (!envelope) throw new FirebaseInputError("O arquivo não contém uma chave privada válida da conta de serviço.");
  try {
    const key = await crypto.subtle.importKey("pkcs8", decode(envelope[2].replace(/\s/g, "")), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    if ((key.algorithm as RsaKeyAlgorithm).modulusLength < 2048) throw new Error();
    return key;
  } catch { throw new FirebaseInputError("A chave privada do arquivo não pôde ser validada."); }
}
export async function prepareFirebaseCredential(raw: unknown): Promise<FirebaseConfig> {
  if (typeof raw !== "string" || raw.length > 16_384) throw new FirebaseInputError("Selecione o JSON da conta de serviço, com até 16 KB.");
  let input: Record<string, unknown>;
  try { input = JSON.parse(raw); } catch { throw new FirebaseInputError("O arquivo selecionado não é um JSON válido."); }
  if (!input || input.type !== "service_account") throw new FirebaseInputError("Use a chave de Contas de serviço do Firebase. O google-services.json é a configuração do APK e não serve para este campo.");
  if (input.project_id !== FIREBASE_PROJECT || typeof input.client_email !== "string" || !/^[a-z0-9-]+@vinkulo-256e8\.iam\.gserviceaccount\.com$/.test(input.client_email)) {
    throw new FirebaseInputError(`Selecione uma conta de serviço do projeto ${FIREBASE_PROJECT}.`);
  }
  if (input.token_uri !== TOKEN_URL || typeof input.private_key !== "string") throw new FirebaseInputError("A conta de serviço contém campos inválidos.");
  await privateKey(input.private_key);
  const credential: Credential = { project_id: FIREBASE_PROJECT, client_email: input.client_email, private_key: input.private_key };
  const id = crypto.randomUUID(), iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`${FIREBASE_PROJECT}:${id}`) }, await encryptionKey(), encoder.encode(JSON.stringify(credential)));
  return { id, projectId: FIREBASE_PROJECT, clientEmail: input.client_email, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)), checkedAt: "", updatedAt: new Date().toISOString() };
}
export async function readFirebaseConfig(db = getD1()): Promise<FirebaseConfig | null> {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ?").bind(CONFIG_KEY).first<{ valor: string }>();
  return row ? JSON.parse(row.valor) as FirebaseConfig : null;
}
export function publicFirebaseConfig(config: FirebaseConfig | null) {
  return { configured: !!config, projectId: FIREBASE_PROJECT, clientEmail: config?.clientEmail ?? null,
    checkedAt: config?.checkedAt || null, updatedAt: config?.updatedAt || null };
}
export async function saveFirebaseConfig(config: FirebaseConfig, userId: number) {
  await getD1().prepare("INSERT INTO configuracoes(chave,valor,atualizado_por,atualizado_em) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor,atualizado_por=excluded.atualizado_por,atualizado_em=CURRENT_TIMESTAMP")
    .bind(CONFIG_KEY, JSON.stringify(config), String(userId)).run();
  accessCache = null;
}
export async function removeFirebaseConfig() {
  await getD1().prepare("DELETE FROM configuracoes WHERE chave = ?").bind(CONFIG_KEY).run();
  accessCache = null;
}
async function mintAccessToken(config: FirebaseConfig) {
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(config.iv), additionalData: encoder.encode(`${FIREBASE_PROJECT}:${config.id}`) }, await encryptionKey(), decode(config.ciphertext));
  const credential = JSON.parse(new TextDecoder().decode(bytes)) as Credential;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))}.${base64url(encoder.encode(JSON.stringify({ iss: credential.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: TOKEN_URL, iat: now, exp: now + 3600 })))}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await privateKey(credential.private_key), encoder.encode(unsigned));
  const response = await fetch(TOKEN_URL, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }) });
  if (!response.ok) { await response.body?.cancel(); throw new FirebaseInputError("O Google recusou a credencial. Confira se a chave continua ativa e o relógio do servidor está correto."); }
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token || typeof result.expires_in !== "number") throw new Error("Resposta OAuth inválida.");
  accessCache = { id: config.id, token: result.access_token, expiresAt: Date.now() + Math.max(0, Math.min(result.expires_in, 3600) - 60) * 1000 };
  return result.access_token;
}
async function accessToken(config: FirebaseConfig) {
  if (accessCache?.id === config.id && accessCache.expiresAt > Date.now()) return accessCache.token;
  if (accessFlight?.id === config.id) return accessFlight.promise;
  const flight = { id: config.id, promise: mintAccessToken(config) }; accessFlight = flight;
  try { return await flight.promise; } finally { if (accessFlight === flight) accessFlight = null; }
}
async function fcmRequest(config: FirebaseConfig, body: unknown) {
  return fetch(SEND_URL, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${await accessToken(config)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
export async function verifyFirebaseConfig(config: FirebaseConfig) {
  // validate_only checks permission and API availability without delivering a message.
  const response = await fcmRequest(config, { validate_only: true, message: { topic: "vinkulo-config-check", data: { check: "true" } } });
  await response.body?.cancel();
  if (!response.ok) throw new FirebaseInputError(response.status === 403 ? "Confira se a API Firebase Cloud Messaging está habilitada e a conta de serviço tem permissão para enviar mensagens." : "Não foi possível validar o acesso ao FCM. Confira a chave e tente novamente.");
  return { ...config, checkedAt: new Date().toISOString() };
}
export function nativeToken(endpoint: string) {
  return /^fcm:[A-Za-z0-9_:-]{20,4096}$/.test(endpoint) ? endpoint.slice(4) : null;
}
export async function sendFcm(config: FirebaseConfig, endpoint: string, data: { tag: string; url: string; notificationId: number; bindingId: string }, ttl: number) {
  const token = nativeToken(endpoint);
  if (!token) return new Response(null, { status: 400 });
  const response = await fcmRequest(config, { message: { token,
    data: { tag: data.tag, url: data.url, notificationId: String(data.notificationId), bindingId: data.bindingId },
    android: { priority: "HIGH", ttl: `${Math.max(0, Math.min(86400, Math.floor(ttl)))}s`, collapse_key: "vinkulo-updates" } } });
  // Only UNREGISTERED revokes a device. A missing project/API is not an invalid token.
  if (response.status === 404) {
    const result = await response.json() as { error?: { details?: Array<{ errorCode?: string }> } };
    return new Response(null, { status: result.error?.details?.some(d => d.errorCode === "UNREGISTERED") ? 410 : 503 });
  }
  if (response.status === 401) accessCache = null;
  return response;
}
