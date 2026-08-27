import type { getD1 } from "../../db";

type D1Database = ReturnType<typeof getD1>;

const LINK_KEY_PREFIX = "cadastro_membro_link:";

export type MemberRegistrationLinkStatus = "ATIVO" | "CANCELADO";

export type MemberRegistrationLink = {
  tokenHash: string;
  ownerId: number;
  expiresAt: string;
  status: MemberRegistrationLinkStatus;
  createdAt: string;
};

type StoredLinkValue = {
  ownerId: number;
  expiresAt: string;
  status: MemberRegistrationLinkStatus;
  createdAt: string;
};

export function isOpaqueLinkToken(value: unknown) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

export function createOpaqueLinkToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashLinkToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function linkKey(ownerId: number, tokenHash: string) {
  return `${LINK_KEY_PREFIX}${ownerId}:${tokenHash}`;
}

export async function saveMemberRegistrationLink(
  db: D1Database,
  options: { ownerId: number; ownerEmail: string; tokenHash: string; expiresAt: string },
) {
  const value: StoredLinkValue = {
    ownerId: options.ownerId,
    expiresAt: options.expiresAt,
    status: "ATIVO",
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare(
      `INSERT INTO configuracoes (chave, valor, atualizado_por)
       VALUES (?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET
         valor = excluded.valor, atualizado_por = excluded.atualizado_por,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(linkKey(options.ownerId, options.tokenHash), JSON.stringify(value), options.ownerEmail)
    .run();
}

export async function getMemberRegistrationLinkByToken(
  db: D1Database,
  token: string,
): Promise<MemberRegistrationLink | null> {
  if (!isOpaqueLinkToken(token)) return null;
  const tokenHash = await hashLinkToken(token);
  const row = await db
    .prepare(
      `SELECT chave, valor FROM configuracoes WHERE chave LIKE ? ESCAPE '\\' LIMIT 1`,
    )
    .bind(`${LINK_KEY_PREFIX}%:${tokenHash}`.replaceAll("_", "\\_"))
    .first<{ chave: string; valor: string }>();
  if (!row) return null;
  return parseLinkRow(row.chave, row.valor, tokenHash);
}

export async function listMemberRegistrationLinks(
  db: D1Database,
  ownerId: number,
): Promise<MemberRegistrationLink[]> {
  const prefix = `${LINK_KEY_PREFIX}${ownerId}:`;
  const result = await db
    .prepare(
      `SELECT chave, valor FROM configuracoes WHERE chave LIKE ? ESCAPE '\\' ORDER BY atualizado_em DESC LIMIT 50`,
    )
    .bind(`${prefix.replaceAll("_", "\\_")}%`)
    .all<{ chave: string; valor: string }>();
  return result.results
    .map((row) => {
      const tokenHash = row.chave.slice(prefix.length);
      return parseLinkRow(row.chave, row.valor, tokenHash);
    })
    .filter((link): link is MemberRegistrationLink => Boolean(link));
}

export async function cancelMemberRegistrationLink(
  db: D1Database,
  ownerId: number,
  tokenHash: string,
) {
  const key = linkKey(ownerId, tokenHash);
  const row = await db
    .prepare(`SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1`)
    .bind(key)
    .first<{ valor: string }>();
  if (!row) return false;
  let value: StoredLinkValue;
  try {
    value = JSON.parse(row.valor) as StoredLinkValue;
  } catch {
    return false;
  }
  value.status = "CANCELADO";
  await db
    .prepare(
      `UPDATE configuracoes SET valor = ?, atualizado_em = CURRENT_TIMESTAMP WHERE chave = ?`,
    )
    .bind(JSON.stringify(value), key)
    .run();
  return true;
}

function parseLinkRow(
  chave: string,
  valor: string,
  tokenHash: string,
): MemberRegistrationLink | null {
  try {
    const parsed = JSON.parse(valor) as Partial<StoredLinkValue>;
    if (
      !Number.isInteger(parsed.ownerId) ||
      typeof parsed.expiresAt !== "string" ||
      (parsed.status !== "ATIVO" && parsed.status !== "CANCELADO")
    ) {
      return null;
    }
    return {
      tokenHash,
      ownerId: parsed.ownerId as number,
      expiresAt: parsed.expiresAt,
      status: parsed.status,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    return null;
  }
}

export function isMemberRegistrationLinkOpen(link: MemberRegistrationLink, now = Date.now()) {
  return link.status === "ATIVO" && Date.parse(link.expiresAt) > now;
}

export function formatLinkCountdown(remainingMs: number) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "Encerrado";
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}min`;
}
