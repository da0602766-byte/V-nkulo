import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("schedule creation stays open when the user touches outside", async () => {
  const [closer, secretary] = await Promise.all([
    read("app/components/CloseDetailsOnOutside.tsx"),
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
  ]);
  assert.match(secretary, /data-keep-open-on-outside/);
  assert.match(closer, /closest\("details\[data-keep-open-on-outside\]"\)/);
  assert.match(closer, /if \(!keepOpen/);
});

test("every unread purple notice is forwarded once to the Android tray", async () => {
  const [center, deviceSync, nativeSync, serviceWorker] = await Promise.all([
    read("app/components/PilotNotificationCenter.tsx"),
    read("app/lib/device-notification-sync.ts"),
    read("app/components/NativeNotificationSync.tsx"),
    read("public/sw.js"),
  ]);
  assert.match(center, /showUnreadOnDevice/);
  assert.match(deviceSync, /DEVICE_NOTIFICATION_STORAGE_KEY/);
  assert.match(deviceSync, /filter\(\(item\) => !item\.read && !shownNotificationIds!\.has\(item\.id\)\)/);
  assert.match(deviceSync, /registration\.showNotification/);
  assert.match(nativeSync, /vinkulo:native-notification-refresh/);
  assert.match(center, /await load\(\);/);
  assert.match(center, /adote:refresh-notifications/);
  assert.match(serviceWorker, /vinkulo-shell-v4/);
  assert.match(serviceWorker, /renotify: true/);
});
