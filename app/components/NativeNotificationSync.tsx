"use client";

import { useEffect } from "react";
import { isNativeNotificationBridgeAvailable } from "../lib/androidNativeBridge";
import { showUnreadDeviceNotifications, type DeviceNotificationRecord } from "../lib/device-notification-sync";

export default function NativeNotificationSync() {
  useEffect(() => {
    if (!isNativeNotificationBridgeAvailable()) return;
    let active = true;
    let loading = false;
    const load = async () => {
      if (!active || loading) return;
      loading = true;
      try {
        const response = await fetch("/api/pilot/notificacoes", { cache: "no-store" });
        if (!response.ok) return;
        const result = (await response.json()) as { notifications?: DeviceNotificationRecord[] };
        if (active) await showUnreadDeviceNotifications(result.notifications || []);
      } catch {
        // A próxima atualização tenta novamente sem interromper a navegação.
      } finally {
        loading = false;
      }
    };
    const refresh = () => void load();
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("vinkulo:native-notification-refresh", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("vinkulo:native-notification-refresh", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return null;
}
