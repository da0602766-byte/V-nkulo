import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pedido de entrada alcança o proprietário mesmo sem vínculo comunitário duplicado", async () => {
  const source = await read("app/lib/pilot-notifications.ts");
  assert.match(source, /u\.id = c\.proprietario_usuario_id/);
  assert.match(source, /EXISTS \([\s\S]*usuario_comunidades uc/);
  assert.match(source, /area: "SOLICITACOES"/);
});

test("sincronização nativa funciona na recepção e demais páginas públicas", async () => {
  const [layout, sync, device] = await Promise.all([
    read("app/layout.tsx"),
    read("app/components/NativeNotificationSync.tsx"),
    read("app/lib/device-notification-sync.ts"),
  ]);
  assert.match(layout, /<NativeNotificationSync \/>/);
  assert.match(sync, /vinkulo:native-notification-refresh/);
  assert.match(sync, /\/api\/pilot\/notificacoes/);
  assert.match(device, /showDeviceNotification/);
});

test("WebView respeita barras do sistema e o recorte da câmera em todo o aplicativo", async () => {
  const [activity, layout] = await Promise.all([
    read("Vinkulo-Android/app/src/main/java/com/vinkulo/app/MainActivity.java"),
    read("Vinkulo-Android/app/src/main/res/layout/activity_main.xml"),
  ]);
  assert.match(activity, /applySafeSystemInsets\(\)/);
  assert.match(activity, /WindowInsets\.Type\.systemBars\(\)/);
  assert.match(activity, /WindowInsets\.Type\.displayCutout\(\)/);
  assert.match(activity, /view\.setPadding\(left, top, right, bottom\)/);
  assert.match(layout, /android:id="@\+id\/app_root"/);
  assert.match(activity, /vinkulo:native-notification-refresh/);
});
