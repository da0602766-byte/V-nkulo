import { getD1 } from "../../../db";
import { getCurrentSessionTokenHash, getSessionUser } from "../../lib/local-auth";
import { getWebPushPublicKey, isTrustedPushEndpoint, isWebPushConfigured } from "../../lib/web-push";

type SubscriptionPayload = {
  endpoint?: unknown;
  expirationTime?: unknown;
  refreshOnly?: boolean;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const publicKey = getWebPushPublicKey();
  if (!publicKey || !isWebPushConfigured()) {
    return Response.json({ error: "As notificações push ainda não foram configuradas." }, { status: 503 });
  }
  // O endpoint fica no cabeçalho para não aparecer nos logs de URLs.
  const endpoint = request.headers.get("x-vinkulo-push-endpoint") || "";
  if (!endpoint) return Response.json({ publicKey, enabled: false });
  if (endpoint.length > 2048 || !isTrustedPushEndpoint(endpoint)) {
    return Response.json({ error: "Assinatura do aparelho inválida." }, { status: 400 });
  }
  const sessionHash = await getCurrentSessionTokenHash();
  const subscription = await getD1().prepare(
    `SELECT sessao_token_hash, ultima_tentativa_em, ultimo_aceite_em,
       ultimo_status, falhas_consecutivas
     FROM notificacoes_push_dispositivos
     WHERE usuario_id = ? AND endpoint = ?
       AND (expiracao_em IS NULL OR datetime(expiracao_em) > CURRENT_TIMESTAMP)
     LIMIT 1`,
  ).bind(user.id, endpoint).first<{
    sessao_token_hash: string | null;
    ultima_tentativa_em: string | null;
    ultimo_aceite_em: string | null;
    ultimo_status: number | null;
    falhas_consecutivas: number;
  }>();
  const enabled = Boolean(sessionHash && subscription?.sessao_token_hash === sessionHash);
  return Response.json({
    publicKey,
    enabled,
    needsRefresh: Boolean(subscription && !enabled),
    delivery: enabled && subscription ? {
      lastAttemptAt: subscription.ultima_tentativa_em,
      lastAcceptedAt: subscription.ultimo_aceite_em,
      lastStatus: subscription.ultimo_status,
      consecutiveFailures: subscription.falhas_consecutivas,
    } : null,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  if (!getWebPushPublicKey() || !isWebPushConfigured()) {
    return Response.json({ error: "As notificações push ainda não foram configuradas." }, { status: 503 });
  }
  let payload: SubscriptionPayload;
  try {
    payload = (await request.json()) as SubscriptionPayload;
  } catch {
    return Response.json({ error: "Assinatura do aparelho inválida." }, { status: 400 });
  }
  const subscription = normalizeSubscription(payload);
  if (!subscription) {
    return Response.json({ error: "Assinatura do aparelho inválida." }, { status: 400 });
  }
  const sessionHash = await getCurrentSessionTokenHash();
  if (!sessionHash) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  const refreshOnly = payload.refreshOnly === true ? 1 : 0;
  const saved = await getD1()
    .prepare(
      `INSERT INTO notificacoes_push_dispositivos
       (usuario_id, endpoint, p256dh, auth, expiracao_em, sessao_token_hash, vinculo_id, atualizado_em)
       SELECT ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
       WHERE EXISTS (SELECT 1 FROM sessoes WHERE usuario_id = ? AND token_hash = ?
         AND datetime(expira_em) > CURRENT_TIMESTAMP)
         AND (? = 0 OR EXISTS (SELECT 1 FROM notificacoes_push_dispositivos
           WHERE usuario_id = ? AND endpoint = ?))
       ON CONFLICT(endpoint) DO UPDATE SET
         usuario_id = excluded.usuario_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         expiracao_em = excluded.expiracao_em,
         sessao_token_hash = excluded.sessao_token_hash,
         vinculo_id = CASE WHEN sessao_token_hash = excluded.sessao_token_hash
           AND usuario_id = excluded.usuario_id AND vinculo_id IS NOT NULL
           THEN vinculo_id ELSE excluded.vinculo_id END,
         ultima_tentativa_em = NULL,
         ultimo_aceite_em = NULL,
         ultimo_status = NULL,
         falhas_consecutivas = 0,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      user.id,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      subscription.expirationTime,
      sessionHash,
      crypto.randomUUID(),
      user.id,
      sessionHash,
      refreshOnly,
      user.id,
      subscription.endpoint,
    )
    .run();
  if (!Number(saved.meta.changes)) {
    return Response.json({ error: "Ative as notificações novamente nesta conta." }, { status: 409 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  let endpoint = "";
  try {
    const payload = (await request.json()) as { endpoint?: unknown };
    endpoint = typeof payload.endpoint === "string" ? payload.endpoint.trim() : "";
  } catch {
    return Response.json({ error: "Assinatura do aparelho inválida." }, { status: 400 });
  }
  if (!endpoint || endpoint.length > 2048 || !isTrustedPushEndpoint(endpoint)) {
    return Response.json({ error: "Assinatura do aparelho inválida." }, { status: 400 });
  }
  await getD1()
    .prepare("DELETE FROM notificacoes_push_dispositivos WHERE usuario_id = ? AND endpoint = ?")
    .bind(user.id, endpoint)
    .run();
  return Response.json({ ok: true });
}

function normalizeSubscription(payload: SubscriptionPayload) {
  const endpoint = typeof payload.endpoint === "string" ? payload.endpoint.trim() : "";
  const p256dh = typeof payload.keys?.p256dh === "string" ? payload.keys.p256dh.trim() : "";
  const auth = typeof payload.keys?.auth === "string" ? payload.keys.auth.trim() : "";
  const expirationTime = typeof payload.expirationTime === "number" && Number.isFinite(payload.expirationTime)
    && payload.expirationTime > Date.now() && payload.expirationTime <= 8.64e15
    ? new Date(payload.expirationTime).toISOString()
    : null;
  if (payload.expirationTime != null && !expirationTime) return null;
  if (
    endpoint.length > 2048 ||
    !isTrustedPushEndpoint(endpoint) ||
    !isValidBase64Url(p256dh, 65, 65) ||
    !isValidBase64Url(auth, 16, 64)
  ) {
    return null;
  }
  return { endpoint, p256dh, auth, expirationTime };
}

function isValidBase64Url(value: string, minimumBytes: number, maximumBytes: number) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
    const binary = atob(padded);
    const length = binary.length;
    return length >= minimumBytes && length <= maximumBytes && (minimumBytes !== 65 || binary.charCodeAt(0) === 4);
  } catch {
    return false;
  }
}
