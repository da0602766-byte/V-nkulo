import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pedido de entrada notifica o proprietário real mesmo sem vínculo duplicado", async () => {
  const source = await read("app/lib/pilot-notifications.ts");
  assert.match(source, /u\.id = c\.proprietario_usuario_id/);
  assert.match(source, /EXISTS \([\s\S]*usuario_comunidades uc/);
  assert.match(source, /area: "SOLICITACOES"/);
});

test("APK sincroniza avisos em qualquer página, inclusive recepção e comunidades", async () => {
  const [layout, sync, device] = await Promise.all([
    read("app/layout.tsx"),
    read("app/components/NativeNotificationSync.tsx"),
    read("app/lib/device-notification-sync.ts"),
  ]);
  assert.match(layout, /<NativeNotificationSync \/>/);
  assert.match(sync, /isNativeNotificationBridgeAvailable\(\)/);
  assert.match(sync, /\/api\/pilot\/notificacoes/);
  assert.match(sync, /vinkulo:native-notification-refresh/);
  assert.match(device, /vinkulo-device-notifications-v1/);
  assert.match(device, /showDeviceNotification/);
});
