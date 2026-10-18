import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("APK usa a ponte nativa e mantém Service Worker como fallback do navegador", async () => {
  const [center, bridge, deviceSync] = await Promise.all([
    read("app/components/PilotNotificationCenter.tsx"),
    read("app/lib/androidNativeBridge.ts"),
    read("app/lib/device-notification-sync.ts"),
  ]);

  assert.match(bridge, /showNotification\?:/);
  assert.match(bridge, /isNativeNotificationBridgeAvailable/);
  assert.match(bridge, /export function showDeviceNotification/);
  assert.match(center, /showUnreadDeviceNotifications/);
  assert.match(deviceSync, /nativeBridge && showDeviceNotification/);
  assert.match(deviceSync, /registration\.showNotification/);
  assert.match(center, /vinkulo:notification-open/);
  assert.match(center, /isSafeInternalDestination\(destination\)/);
});
