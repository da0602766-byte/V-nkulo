"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeNotificationBridgeAvailable } from "../lib/androidNativeBridge";
import {
  showUnreadDeviceNotifications,
  type DeviceNotificationRecord,
} from "../lib/device-notification-sync";

export default function NativeNotificationSync() {
  const pathname = usePathname();
  useEffect(() => {
    const bridge = window.VinkuloAndroid;
    if (!bridge?.requestPushToken) return;
    if (pathname === "/login" || pathname === "/api/auth/logout") {
      bridge.clearPushBinding?.(); window.VinkuloFcmActive = false;
      return;
    }
    let active = true;
    let request: AbortController | null = null;
    const receive = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { token?: string; permission?: boolean; projectId?: string };
      if (!active || typeof detail?.token !== "string") return;
      request?.abort();
      const controller = new AbortController(); request = controller;
      try {
        const response = await fetch("/api/push-native", { method: "POST", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(detail) });
        if (!active || controller.signal.aborted) return;
        if (response.status === 401) { bridge.clearPushBinding?.(); window.VinkuloFcmActive = false; return; }
        if (!response.ok) return;
        const result = await response.json() as { registered: boolean; bindingId?: string; configured: boolean };
        if (!active || controller.signal.aborted) return;
        if (result.registered && result.bindingId) bridge.setPushBinding?.(detail.token, result.bindingId);
        else bridge.clearPushBinding?.();
        window.VinkuloFcmActive = !!(result.registered && result.configured);
      } catch { /* Retoma no próximo evento de abertura; token nunca é registrado em logs. */ }
    };
    const refresh = () => { if (document.visibilityState === "visible") bridge.requestPushToken?.(); };
    const listener = (event: Event) => void receive(event);
    const suspend = () => { request?.abort(); };
    window.addEventListener("vinkulo:fcm-token", listener);
    window.addEventListener("vinkulo:native-notification-refresh", refresh);
    window.addEventListener("vinkulo:firebase-status", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pagehide", suspend);
    const timer = setTimeout(refresh, 0);
    return () => { active = false; clearTimeout(timer); request?.abort(); window.removeEventListener("vinkulo:fcm-token", listener);
      window.removeEventListener("vinkulo:native-notification-refresh", refresh); window.removeEventListener("vinkulo:firebase-status", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pagehide", suspend); };
  }, [pathname]);
  useEffect(() => {
    if (!isNativeNotificationBridgeAvailable()) return;

    let active = true;
    let loading = false;
    let request: AbortController | null = null;
    const load = async () => {
      if (!active || loading || window.VinkuloFcmActive || document.visibilityState !== "visible") return;
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
