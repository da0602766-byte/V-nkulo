import { getD1 } from "../../../../db";
import { rejectDisabledOffline } from "../../../lib/android-offline-policy";
import { getCurrentSessionTokenHash } from "../../../lib/local-auth";
import { requireTenantPermission } from "../../../lib/tenant";

const reply = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store, private", Vary: "Cookie, Origin" },
});

// This is an authenticated snapshot, not an API access token. Android obtains
// it over HTTPS directly and seals it with Keystore. No signing secret is sent.
export async function GET(request: Request) {
  const blocked = await rejectDisabledOffline();
  if (blocked) return blocked;
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply({ error: "Origem inválida." }, 403);
  }
  const challenge = request.headers.get("x-vinkulo-challenge") || "";
  if (!/^[a-f0-9]{64}$/.test(challenge) || request.headers.get("x-vinkulo-client") !== "android-foundation-1") {
    return reply({ error: "Versão de preparação incompatível." }, 400);
  }
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return reply({ error: "Entre novamente para preparar este aparelho." }, access.error.status);
  if (!access.user.ativo || access.context.temporaryAccess || access.context.communityAccess === "FEED_ONLY") {
    return reply({ error: "Este acesso precisa de conexão." }, 403);
  }
  const sessionHash = await getCurrentSessionTokenHash();
  if (!sessionHash) return reply({ error: "Sessão expirada." }, 401);
  const session = await getD1().prepare(
    "SELECT expira_em FROM sessoes WHERE usuario_id = ? AND token_hash = ? AND datetime(expira_em) > CURRENT_TIMESTAMP LIMIT 1",
  ).bind(access.user.id, sessionHash).first<{ expira_em: string }>();
  const issuedAt = Date.now();
  const rawExpiry = session?.expira_em || "";
  const sessionExpires = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(rawExpiry) ? rawExpiry : `${rawExpiry.replace(" ", "T")}Z`);
  if (!Number.isFinite(sessionExpires) || sessionExpires <= issuedAt) return reply({ error: "Sessão expirada." }, 401);
  return reply({
    protocol: 1, challenge,
    accountId: access.user.id,
    communityId: access.context.comunidadeId,
    communityName: access.context.comunidadeNome.slice(0, 160),
    issuedAt, expiresAt: Math.min(sessionExpires, issuedAt + 24 * 60 * 60 * 1000),
    // Foundation only. No permission to read/write operational modules offline.
    capabilities: ["shell.open"],
  });
}
