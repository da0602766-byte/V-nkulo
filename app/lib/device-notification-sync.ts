import {
  isNativeNotificationBridgeAvailable,
  showDeviceNotification,
} from "./androidNativeBridge";

const DEVICE_NOTIFICATION_STORAGE_KEY = "vinkulo-device-notifications-v1";

export type DeviceNotificationRecord = {
  id: number;
  title: string;
  message: string;
  read: boolean;
  destination: string;
};

let shownNotificationIds: Set<number> | null = null;

export async function showUnreadDeviceNotifications(items: DeviceNotificationRecord[]) {
  const nativeBridge = isNativeNotificationBridgeAvailable();
  if (!nativeBridge && (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator))) {
    return;
  }
  if (!shownNotificationIds) shownNotificationIds = readShownNotificationIds();

  const pending = items.filter((item) => !item.read && !shownNotificationIds!.has(item.id)).slice(0, 5);
  if (!pending.length) return;

  const registration = nativeBridge ? null : await navigator.serviceWorker.ready;
  for (const item of pending) {
    const destination = isSafeInternalDestination(item.destination) ? item.destination : "/painel";
    const tag = `vinkulo-notification-${item.id}`;
    const shownNatively = nativeBridge && showDeviceNotification({
      title: item.title || "Vínkulo",
      body: item.message,
      tag,
      url: destination,
    });
    if (!shownNatively && registration) {
      await registration.showNotification(item.title || "Vínkulo", {
        body: item.message,
        icon: "/vinkulo-app-icon-192.png",
        badge: "/vinkulo-app-icon-192.png",
        tag,
        renotify: true,
        data: { notificationId: item.id, url: destination },
      } as NotificationOptions & { renotify: boolean });
    }
    if (!shownNatively && !registration) continue;
    shownNotificationIds.add(item.id);
  }
  persistShownNotificationIds(shownNotificationIds);
}

function readShownNotificationIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(DEVICE_NOTIFICATION_STORAGE_KEY) || "[]");
    return new Set<number>(Array.isArray(value) ? value.filter((id) => Number.isInteger(id)).slice(-300) : []);
  } catch {
    return new Set<number>();
  }
}

function persistShownNotificationIds(ids: Set<number>) {
  try {
    window.localStorage.setItem(DEVICE_NOTIFICATION_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-300)));
  } catch {
    // O armazenamento pode estar bloqueado; o alerta atual já foi entregue.
  }
}

function isSafeInternalDestination(value: string) {
  return value.startsWith("/painel?") || value.startsWith("/comunidades") || value.startsWith("/proprietario");
}
