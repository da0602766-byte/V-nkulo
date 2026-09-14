import { getD1 } from "../../../db";
import { getSessionUser } from "../../lib/local-auth";
import { getWebPushPublicKey, isTrustedPushEndpoint, isWebPushConfigured } from "../../lib/web-push";

type SubscriptionPayload = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const publicKey = getWebPushPublicKey();
  if (!publicKey || !isWebPushConfigured()) {
    return Response.json({ error: "As notificações push ainda não foram configuradas." }, { status: 503 });
  }
  const subscription = await getD1()
    .prepare("SELECT id FROM notificacoes_push_dispositivos WHERE usuario_id = ? LIMIT 1")
    .bind(user.id)
    .first<{ id: number }>();
  return Response.json({ publicKey, enabled: Boolean(subscription) });
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
  await getD1()
    .prepare(
      `INSERT INTO notificacoes_push_dispositivos
       (usuario_id, endpoint, p256dh, auth, expiracao_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(endpoint) DO UPDATE SET
         usuario_id = excluded.usuario_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         expiracao_em = excluded.expiracao_em,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      user.id,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      subscription.expirationTime,
    )
    .run();
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
    ? new Date(payload.expirationTime).toISOString()
    : null;
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
