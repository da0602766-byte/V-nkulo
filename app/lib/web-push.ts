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
      `SELECT id, endpoint, p256dh, auth
       FROM notificacoes_push_dispositivos
       WHERE usuario_id = ?
       ORDER BY atualizado_em DESC`,
    )
    .bind(notification.userId)
    .all<PushSubscriptionRow>();
  const payload = JSON.stringify({
    title: notification.title.trim().slice(0, 120) || "Vínkulo",
    body: notification.message.trim().slice(0, 500) || "Você recebeu uma nova atualização.",
    tag: `vinkulo-notification-${notification.notificationId}`,
    url: safeDestination(notification.destination),
  });
  await Promise.all(
    subscriptions.results.map(async (subscription) => {
      try {
        const result = await sendWebPush(subscription, payload, configuration);
        // 404/410 mean the provider has discarded this browser endpoint.
        // Removing only that exact row keeps other devices of the user intact.
        if (result.status === 404 || result.status === 410) {
          await db
            .prepare("DELETE FROM notificacoes_push_dispositivos WHERE id = ? AND usuario_id = ?")
            .bind(subscription.id, notification.userId)
            .run();
        }
      } catch {
        // The persisted in-app notification remains the source of truth. A
        // temporary push-provider failure never blocks the user's action.
      }
    }),
  );
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

function safeDestination(value: string) {
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
