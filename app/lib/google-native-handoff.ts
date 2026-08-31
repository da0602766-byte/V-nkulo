import { getD1 } from "../../db";

export type GoogleNativeHandoff = {
  pairing_hash: string;
  purpose: "login" | "drive";
  requested_user_id: number | null;
  return_to: string;
  completed_user_id: number | null;
  error_message: string | null;
  expires_at: string;
  completed_at: string | null;
};

export function validGooglePairingSecret(value: unknown) {
  return /^[A-Za-z0-9_-]{40,128}$/.test(String(value || ""));
}

export async function googlePairingHash(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareGoogleNativeHandoff(input: {
  pairingHash: string;
  purpose: "login" | "drive";
  requestedUserId: number | null;
  returnTo: string;
}) {
  const db = getD1();
  await db.prepare("DELETE FROM google_native_handoffs WHERE datetime(expires_at) <= CURRENT_TIMESTAMP").run();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await db.prepare(
    `INSERT INTO google_native_handoffs
      (pairing_hash, purpose, requested_user_id, return_to, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pairing_hash) DO UPDATE SET purpose = excluded.purpose,
       requested_user_id = excluded.requested_user_id, return_to = excluded.return_to,
       completed_user_id = NULL, error_message = NULL, expires_at = excluded.expires_at,
       completed_at = NULL, created_at = CURRENT_TIMESTAMP`,
  ).bind(input.pairingHash, input.purpose, input.requestedUserId, input.returnTo, expiresAt).run();
}

export async function readGoogleNativeHandoff(pairingHash: string) {
  return getD1().prepare(
    `SELECT pairing_hash, purpose, requested_user_id, return_to, completed_user_id,
      error_message, expires_at, completed_at
     FROM google_native_handoffs WHERE pairing_hash = ? LIMIT 1`,
  ).bind(pairingHash).first<GoogleNativeHandoff>();
}

export async function finishGoogleNativeHandoff(pairingHash: string, userId: number) {
  await getD1().prepare(
    `UPDATE google_native_handoffs SET completed_user_id = ?, completed_at = CURRENT_TIMESTAMP,
       error_message = NULL WHERE pairing_hash = ? AND completed_at IS NULL`,
  ).bind(userId, pairingHash).run();
}

export async function failGoogleNativeHandoff(pairingHash: string, message: string) {
  await getD1().prepare(
    `UPDATE google_native_handoffs SET error_message = ?, completed_at = CURRENT_TIMESTAMP
     WHERE pairing_hash = ? AND completed_at IS NULL`,
  ).bind(message.slice(0, 500), pairingHash).run();
}

export async function consumeGoogleNativeHandoff(pairingHash: string) {
  await getD1().prepare("DELETE FROM google_native_handoffs WHERE pairing_hash = ?").bind(pairingHash).run();
}
