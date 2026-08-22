import { cookies } from "next/headers";
import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";
import type { AppUser } from "./access";

const SESSION_COOKIE = "__Host-adote_session";
const LEGACY_SESSION_COOKIE = "adote_session";
const SESSION_DAYS = 14;
const PASSWORD_ITERATIONS = 100_000;
type SignedSessionPayload = { u: number; e: number; n: string; p: string };

export function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function validatePassword(password: string) {
  if (password.length < 8)
    return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    return "Use letras e pelo menos um número na senha.";
  return null;
}

export async function hashPassword(password: string, salt = randomHex(16)) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    material,
    256,
  );
  return { salt, hash: bytesToHex(new Uint8Array(bits)) };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expected: string,
) {
  const actual = (await hashPassword(password, salt)).hash;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1)
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function setUserPassword(userId: number, password: string) {
  const { salt, hash } = await hashPassword(password);
  await getD1()
    .prepare(
      "UPDATE usuarios SET senha_hash = ?, senha_salt = ?, tentativas_login = 0, bloqueado_ate = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(hash, salt, userId)
    .run();
}

export async function createSession(userId: number) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  const db = getD1();
  const password = await db
    .prepare("SELECT senha_hash FROM usuarios WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ senha_hash: string | null }>();
  if (!password?.senha_hash)
    throw new Error(
      "Não foi possível criar uma sessão segura para este cadastro.",
    );
  await db
    .prepare(
      "DELETE FROM sessoes WHERE datetime(expira_em) <= CURRENT_TIMESTAMP",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES (?, ?, ?)",
    )
    .bind(userId, tokenHash, expires.toISOString())
    .run();
  const payload: SignedSessionPayload = {
    u: userId,
    e: expires.getTime(),
    n: token,
    p: (await sha256(password.senha_hash)).slice(0, 24),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return { token: `${encoded}.${await signSession(encoded)}`, expires };
}

export function attachSessionCookie(
  response: Response,
  session: { token: string; expires: Date },
) {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${session.token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; Expires=${session.expires.toUTCString()}; HttpOnly; Secure; SameSite=Strict`,
  );
  response.headers.append(
    "Set-Cookie",
    `${LEGACY_SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

export async function destroySession() {
  const jar = await cookies();
  const cookieValue = jar.get(SESSION_COOKIE)?.value;
  const legacyToken = jar.get(LEGACY_SESSION_COOKIE)?.value;
  const signed = cookieValue ? await decodeSignedSession(cookieValue) : null;
  const token = signed?.n || legacyToken;
  if (token)
    await getD1()
      .prepare("DELETE FROM sessoes WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  jar.set(LEGACY_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export type SessionState = {
  user: AppUser | null;
  reason:
    | "ok"
    | "cookie_ausente"
    | "sessao_invalida"
    | "sessao_expirada"
    | "usuario_ausente";
};

export async function getSessionState(): Promise<SessionState> {
  const jar = await cookies();
  const cookieValue = jar.get(SESSION_COOKIE)?.value;
  const legacyToken = jar.get(LEGACY_SESSION_COOKIE)?.value;
  if (!cookieValue && !legacyToken)
    return { user: null, reason: "cookie_ausente" };

  const db = getD1();
  if (cookieValue) {
    const signed = await decodeSignedSession(cookieValue);
    if (!signed) return { user: null, reason: "sessao_invalida" };
    if (signed.e <= Date.now())
      return { user: null, reason: "sessao_expirada" };
    const persistedSession = await db
      .prepare(
        `SELECT 1 AS active
        FROM sessoes
        WHERE usuario_id = ? AND token_hash = ?
          AND datetime(expira_em) > CURRENT_TIMESTAMP
        LIMIT 1`,
      )
      .bind(signed.u, await sha256(signed.n))
      .first<{ active: number }>();
    if (!persistedSession)
      return { user: null, reason: "sessao_invalida" };
    const row = await db
      .prepare(
        `SELECT u.id, u.nome, u.email, u.perfil, u.permissoes, u.foto_perfil, u.telefone,
      u.data_nascimento, u.nome_pais, u.endereco, u.celula, u.ministerio, u.observacoes,
      u.diaconia_equipe_id, d.nome AS diaconia_equipe_nome, u.tema_preferido,
      EXISTS(SELECT 1 FROM culto_rotinas c WHERE c.registrador_usuario_id = u.id) AS culto_registrador,
      u.titulo_eclesiastico, u.ativo, u.criado_em, u.senha_hash
      FROM usuarios u LEFT JOIN diaconia_equipes d ON d.id = u.diaconia_equipe_id
      WHERE u.id = ? LIMIT 1`,
      )
      .bind(signed.u)
      .first<AppUser & { senha_hash: string | null }>();
    if (!row) return { user: null, reason: "usuario_ausente" };
    if (
      !row.senha_hash ||
      (await sha256(row.senha_hash)).slice(0, 24) !== signed.p
    )
      return { user: null, reason: "sessao_invalida" };
    const user = Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "senha_hash"),
    ) as AppUser;
    return { user: applySystemOwnerRole(user), reason: "ok" };
  }

  const session = await db
    .prepare(
      "SELECT usuario_id, expira_em FROM sessoes WHERE token_hash = ? LIMIT 1",
    )
    .bind(await sha256(legacyToken!))
    .first<{ usuario_id: number; expira_em: string }>();
  if (!session) return { user: null, reason: "sessao_invalida" };

  const expiresAt = Date.parse(session.expira_em);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
    return { user: null, reason: "sessao_expirada" };

  const user = await db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.perfil, u.permissoes, u.foto_perfil, u.telefone,
    u.data_nascimento, u.nome_pais, u.endereco, u.celula, u.ministerio, u.observacoes,
    u.diaconia_equipe_id, d.nome AS diaconia_equipe_nome, u.tema_preferido,
    EXISTS(SELECT 1 FROM culto_rotinas c WHERE c.registrador_usuario_id = u.id) AS culto_registrador,
    u.titulo_eclesiastico, u.ativo, u.criado_em
    FROM usuarios u LEFT JOIN diaconia_equipes d ON d.id = u.diaconia_equipe_id
    WHERE u.id = ? LIMIT 1`,
    )
    .bind(session.usuario_id)
    .first<AppUser>();
  return user
    ? { user: applySystemOwnerRole(user), reason: "ok" }
    : { user: null, reason: "usuario_ausente" };
}

export function isSystemOwnerAccount(
  user: Pick<AppUser, "email" | "criado_em">,
) {
  const runtime = getRuntimeEnv();
  const configured = normalizeEmail(runtime.SYSTEM_OWNER_EMAIL);
  const lockedBefore = Date.parse(runtime.SYSTEM_OWNER_LOCKED_BEFORE || "");
  const createdAt = Date.parse(user.criado_em || "");
  return (
    Boolean(configured) &&
    normalizeEmail(user.email) === configured &&
    Number.isFinite(lockedBefore) &&
    Number.isFinite(createdAt) &&
    createdAt <= lockedBefore
  );
}

function applySystemOwnerRole(user: AppUser): AppUser {
  if (!isSystemOwnerAccount(user)) return user;
  return {
    ...user,
    perfil: "ADMIN",
    system_owner: true,
  };
}

export async function getSessionUser(): Promise<AppUser | null> {
  return (await getSessionState()).user;
}

export async function createResetToken(userId: number) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + 30 * 60000).toISOString();
  const db = getD1();
  await db
    .prepare(
      "UPDATE redefinicoes_senha SET usado = 1 WHERE usuario_id = ? AND usado = 0",
    )
    .bind(userId)
    .run();
  await db
    .prepare(
      "INSERT INTO redefinicoes_senha (usuario_id, token_hash, expira_em, usado) VALUES (?, ?, ?, 0)",
    )
    .bind(userId, await sha256(token), expires)
    .run();
  return token;
}

export async function consumeResetToken(token: string, password: string) {
  const db = getD1();
  const row = await db
    .prepare(
      "SELECT id, usuario_id FROM redefinicoes_senha WHERE token_hash = ? AND usado = 0 AND datetime(expira_em) > CURRENT_TIMESTAMP LIMIT 1",
    )
    .bind(await sha256(token))
    .first<{ id: number; usuario_id: number }>();
  if (!row) return false;
  await setUserPassword(row.usuario_id, password);
  await db
    .prepare("UPDATE redefinicoes_senha SET usado = 1 WHERE id = ?")
    .bind(row.id)
    .run();
  await db
    .prepare("DELETE FROM sessoes WHERE usuario_id = ?")
    .bind(row.usuario_id)
    .run();
  return true;
}

export async function sha256(value: string) {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}

async function signSession(value: string) {
  const secret = getRuntimeEnv().AUTH_SECRET;
  if (!secret)
    throw new Error("A chave de segurança do login não está configurada.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  );
}

async function decodeSignedSession(
  value: string,
): Promise<SignedSessionPayload | null> {
  const [encoded, signature, extra] = value.split(".");
  if (
    !encoded ||
    !signature ||
    extra ||
    !safeEqual(await signSession(encoded), signature)
  )
    return null;
  try {
    const parsed = JSON.parse(
      base64UrlDecode(encoded),
    ) as Partial<SignedSessionPayload>;
    if (
      !Number.isInteger(parsed.u) ||
      !Number.isFinite(parsed.e) ||
      typeof parsed.n !== "string" ||
      typeof parsed.p !== "string"
    )
      return null;
    return parsed as SignedSessionPayload;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function randomHex(size: number) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(size)));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}
