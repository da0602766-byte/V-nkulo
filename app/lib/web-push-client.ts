export type PushDeliveryStatus = {
  lastAttemptAt: string | null;
  lastAcceptedAt: string | null;
  lastStatus: number | null;
  consecutiveFailures: number;
};

type PushSubscriptionResponse = {
  publicKey?: string;
  enabled?: boolean;
  needsRefresh?: boolean;
  delivery?: PushDeliveryStatus | null;
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
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { supported: true, subscribed: false };
  const headers = { "x-vinkulo-push-endpoint": subscription.endpoint };
  let response = await fetch("/api/push-subscriptions", { cache: "no-store", headers });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as PushSubscriptionResponse;
    return { supported: true, subscribed: false, error: result.error || "Notificações push indisponíveis." };
  }
  let result = (await response.json()) as PushSubscriptionResponse;
  // Migra apenas uma assinatura já autorizada pela mesma conta. Nunca assume
  // consentimento da conta anterior em um navegador compartilhado.
  if (result.needsRefresh && Notification.permission === "granted") {
    const refreshed = await fetch("/api/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), refreshOnly: true }),
    });
    if (refreshed.ok) {
      response = await fetch("/api/push-subscriptions", { cache: "no-store", headers });
      if (response.ok) result = (await response.json()) as PushSubscriptionResponse;
    }
  }
  return {
    supported: true,
    subscribed: Boolean(subscription && result.enabled),
    publicKey: result.publicKey || "",
    delivery: result.delivery || null,
  };
}

export async function subscribeWebPushNotifications() {
  if (!isWebPushSupported()) {
    throw new Error("Este navegador não oferece notificações push.");
  }
  // Ask within the user's click, before network I/O can consume transient
  // activation (required by browsers such as Safari).
  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") {
    throw new Error("A permissão de notificações não foi liberada neste aparelho.");
  }
  const configResponse = await fetch("/api/push-subscriptions", { cache: "no-store" });
  const config = (await configResponse.json().catch(() => ({}))) as PushSubscriptionResponse;
  if (!configResponse.ok || !config.publicKey) {
    throw new Error(config.error || "As notificações push ainda não foram configuradas.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await waitForActiveServiceWorker(registration);
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

function waitForActiveServiceWorker(registration: ServiceWorkerRegistration) {
  if (registration.active?.state === "activated") return Promise.resolve();
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) return Promise.reject(new Error("Não foi possível preparar os avisos. Atualize a página e tente ativar novamente."));
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant") finish(new Error("A instalação dos avisos foi interrompida. Atualize a página e tente novamente."));
    };
    const timer = setTimeout(() => finish(new Error("A preparação dos avisos demorou mais que o esperado. Verifique a conexão e tente novamente.")), 15_000);
    worker.addEventListener("statechange", check);
    check();
  });
}

export async function unsubscribeWebPushNotifications() {
  if (!isWebPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  const response = await fetch("/api/push-subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error("Não foi possível desativar as notificações. Tente novamente.");
  await subscription.unsubscribe();
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
