"use client";

import { useEffect } from "react";
import { isNativeNotificationBridgeAvailable } from "../lib/androidNativeBridge";
import {
  showUnreadDeviceNotifications,
  type DeviceNotificationRecord,
} from "../lib/device-notification-sync";

export default function NativeNotificationSync() {
  useEffect(() => {
    if (!isNativeNotificationBridgeAvailable()) return;

    let active = true;
    let loading = false;
    let request: AbortController | null = null;
    const load = async () => {
      if (!active || loading || document.visibilityState !== "visible") return;
      loading = true;
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/pilot/notificacoes", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const result = (await response.json()) as { notifications?: DeviceNotificationRecord[] };
        if (active && !controller.signal.aborted && document.visibilityState === "visible") {
          await showUnreadDeviceNotifications(result.notifications || []);
        }
      } catch {
        // A próxima atualização tenta novamente sem interromper a navegação.
      } finally {
        if (request === controller) { request = null; loading = false; }
      }
    };
    const refresh = () => void load();
    const suspend = () => { request?.abort(); request = null; loading = false; };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
      else suspend();
    };
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("vinkulo:native-notification-refresh", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", suspend);
    return () => {
      active = false;
      suspend();
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("vinkulo:native-notification-refresh", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", suspend);
    };
  }, []);

  return null;
}
