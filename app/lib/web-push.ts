import { getRuntimeEnv } from "../../db/runtime-env";
import {
  createVapidAuthorization,
  encryptWebPushPayload,
  type VapidConfiguration,
} from "./web-push-crypto";

export { createVapidAuthorization, encryptWebPushPayload, type VapidConfiguration } from "./web-push-crypto";

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  vinculo_id: string;
};

type PushNotification = {
  userId: number;
  notificationId: number;
  title: string;
  message: string;
  destination: string;
};

const PUSH_TTL_SECONDS = 86_400;
const trustedPushHosts = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "wns2.notify.windows.com",
]);

/** The public VAPID key is safe to return to an authenticated browser. */
export function getWebPushPublicKey() {
  const value = String(getRuntimeEnv().VAPID_PUBLIC_KEY || "").trim();
  try {
    const bytes = base64UrlDecode(value);
    return bytes.length === 65 && bytes[0] === 4 ? value : null;
  } catch {
    return null;
  }
}

export function isWebPushConfigured() {
  return getVapidConfiguration() !== null;
}

export function isTrustedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.pathname || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return trustedPushHosts.has(host) || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

/**
 * Keeps delivery outside the request's visible response. The Worker owns the
 * promise, so a request that creates a notification is not held up by a slow
 * browser push service.
 */
export function scheduleWebPushDelivery(db: D1Database, notification: PushNotification) {
  const configuration = getVapidConfiguration();
  if (!configuration) return;
  const delivery = deliverWebPushNotifications(db, notification, configuration).catch(() => undefined);
  const executionContext = getRuntimeEnv().executionContext;
  if (executionContext) {
    executionContext.waitUntil(delivery);
    return;
  }
  void delivery;
}

async function deliverWebPushNotifications(
  db: D1Database,
  notification: PushNotification,
  configuration: VapidConfiguration,
) {
  const subscriptions = await db
    .prepare(
      `SELECT p.id, p.endpoint, p.p256dh, p.auth, p.vinculo_id
       FROM notificacoes_push_dispositivos p
       JOIN sessoes s ON s.token_hash = p.sessao_token_hash AND s.usuario_id = p.usuario_id
       JOIN usuarios u ON u.id = p.usuario_id AND u.ativo = 1
       WHERE p.usuario_id = ? AND p.vinculo_id IS NOT NULL
         AND datetime(s.expira_em) > CURRENT_TIMESTAMP
         AND (p.expiracao_em IS NULL OR datetime(p.expiracao_em) > CURRENT_TIMESTAMP)
       ORDER BY p.atualizado_em DESC`,
    )
    .bind(notification.userId)
    .all<PushSubscriptionRow>();
  await Promise.all(
    subscriptions.results.map(async (subscription) => {
      const payload = JSON.stringify({
        title: "Vínkulo",
        body: "Você recebeu uma atualização. Abra o Vínkulo para consultar.",
        tag: `vinkulo-notification-${notification.notificationId}`,
        url: "/painel",
        notificationId: notification.notificationId,
        bindingId: subscription.vinculo_id,
      });
      try {
        const result = await sendWebPush(subscription, payload, configuration);
        // 404/410 mean the provider has discarded this browser endpoint.
        // Removing only that exact row keeps other devices of the user intact.
        if (result.status === 404 || result.status === 410) {
          await db
            .prepare("DELETE FROM notificacoes_push_dispositivos WHERE id = ? AND usuario_id = ? AND vinculo_id = ?")
            .bind(subscription.id, notification.userId, subscription.vinculo_id)
            .run();
          return;
        }
        await recordDeliveryAttempt(db, subscription, result.status);
      } catch {
        // Registra apenas estado operacional, nunca endpoint, token ou mensagem.
        await recordDeliveryAttempt(db, subscription, 0).catch(() => undefined);
      }
    }),
  );
}

async function recordDeliveryAttempt(db: D1Database, subscription: PushSubscriptionRow, status: number) {
  const accepted = status >= 200 && status < 300 ? 1 : 0;
  await db.prepare(
    `UPDATE notificacoes_push_dispositivos
     SET ultima_tentativa_em = CURRENT_TIMESTAMP, ultimo_status = ?,
       ultimo_aceite_em = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE ultimo_aceite_em END,
       falhas_consecutivas = CASE WHEN ? = 1 THEN 0 ELSE falhas_consecutivas + 1 END
     WHERE id = ? AND vinculo_id = ?`,
  ).bind(status, accepted, accepted, subscription.id, subscription.vinculo_id).run();
}

async function sendWebPush(
  subscription: PushSubscriptionRow,
  payload: string,
  configuration: VapidConfiguration,
) {
  if (!isTrustedPushEndpoint(subscription.endpoint)) {
    throw new Error("Endpoint de push não autorizado.");
  }
  const encrypted = await encryptWebPushPayload(payload, subscription);
  const authorization = await createVapidAuthorization(subscription.endpoint, configuration);
  return fetch(subscription.endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: "high",
    },
    body: encrypted,
  });
}

function getVapidConfiguration(): VapidConfiguration | null {
  const publicKey = getWebPushPublicKey();
  const rawPrivateKey = String(getRuntimeEnv().VAPID_PRIVATE_KEY || "").trim();
  const subject = String(getRuntimeEnv().VAPID_SUBJECT || "").trim();
  if (!publicKey || !rawPrivateKey || !isVapidSubject(subject)) return null;
  try {
    const privateKey = JSON.parse(rawPrivateKey) as JsonWebKey;
    if (
      privateKey.kty !== "EC" || privateKey.crv !== "P-256" ||
      typeof privateKey.d !== "string" || typeof privateKey.x !== "string" || typeof privateKey.y !== "string"
    ) return null;
    const derivedPublicKey = base64UrlEncode(
      concatenate(new Uint8Array([4]), base64UrlDecode(privateKey.x), base64UrlDecode(privateKey.y)),
    );
    return derivedPublicKey === publicKey ? { publicKey, privateKey, subject } : null;
  } catch {
    return null;
  }
}

function isVapidSubject(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function safeDestination(value: string) {
  return value.startsWith("/painel?") || value.startsWith("/comunidades") || value.startsWith("/proprietario")
    ? value.slice(0, 300)
    : "/painel";
}

function concatenate(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function base64UrlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Base64url inválido.");
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlEncode(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
