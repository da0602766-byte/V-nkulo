type PushSubscriptionResponse = {
  publicKey?: string;
  enabled?: boolean;
  error?: string;
};

export function isWebPushSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export async function getWebPushSubscriptionState() {
  if (!isWebPushSupported()) return { supported: false, subscribed: false };
  const response = await fetch("/api/push-subscriptions", { cache: "no-store" });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as PushSubscriptionResponse;
    return { supported: true, subscribed: false, error: result.error || "Notificações push indisponíveis." };
  }
  const result = (await response.json()) as PushSubscriptionResponse;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    subscribed: Boolean(subscription && result.enabled),
    publicKey: result.publicKey || "",
  };
}

export async function subscribeWebPushNotifications() {
  if (!isWebPushSupported()) {
    throw new Error("Este navegador não oferece notificações push.");
  }
  const configResponse = await fetch("/api/push-subscriptions", { cache: "no-store" });
  const config = (await configResponse.json().catch(() => ({}))) as PushSubscriptionResponse;
  if (!configResponse.ok || !config.publicKey) {
    throw new Error(config.error || "As notificações push ainda não foram configuradas.");
  }
  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") {
    throw new Error("A permissão de notificações não foi liberada neste aparelho.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  let subscription = await registration.pushManager.getSubscription();
  const applicationServerKey = base64UrlToUint8Array(config.publicKey);
  if (subscription && !sameApplicationServerKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }
  const saveResponse = await fetch("/api/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  const saved = (await saveResponse.json().catch(() => ({}))) as PushSubscriptionResponse;
  if (!saveResponse.ok) {
    throw new Error(saved.error || "Não foi possível ativar as notificações push.");
  }
  return { registration, subscription };
}

export async function unsubscribeWebPushNotifications() {
  if (!isWebPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch("/api/push-subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

function sameApplicationServerKey(subscription: PushSubscription, expected: Uint8Array) {
  const actual = subscription.options.applicationServerKey;
  if (!actual) return false;
  const bytes = new Uint8Array(actual);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

function base64UrlToUint8Array(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Chave pública de push inválida.");
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
