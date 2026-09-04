import { getD1 } from "../../db";
import { sha256 } from "./local-auth";

async function increment(key: string, windowMs: number) {
  const now = Date.now();
  const row = await getD1().prepare(`INSERT INTO auth_rate_limits (key, attempts, window_start)
    VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN window_start <= ? THEN 1 ELSE attempts + 1 END,
      window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
    RETURNING attempts`).bind(key, now, now - windowMs, now - windowMs).first<{ attempts: number }>();
  return row!.attempts;
}

export async function loginLimit(request: Request, email: string) {
  // Cloudflare sets this header at ingress; never trust X-Forwarded-For from a client.
  const origin = await sha256(request.headers.get("cf-connecting-ip") || "unavailable-origin");
  const account = await sha256(email);
  const [byOrigin, byPair] = await Promise.all([
    increment(`origin:${origin}`, 60_000), increment(`pair:${account}:${origin}`, 15 * 60_000),
  ]);
  return { allowed: byOrigin <= 30 && byPair <= 15, account };
}

export async function recordFailedLogin(account: string) {
  const failures = await increment(`account:${account}`, 15 * 60_000);
  // Account-wide abuse slows failed attempts only: it cannot lock out a valid password elsewhere.
  if (failures > 20) await new Promise((resolve) => setTimeout(resolve, 500));
  await getD1().prepare("DELETE FROM auth_rate_limits WHERE window_start < ?").bind(Date.now() - 24 * 60 * 60_000).run();
}
