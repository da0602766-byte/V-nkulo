import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cadastro novo usa a data real de entrada e nunca inventa 999 dias sem contato", async () => {
  const [route, tools] = await Promise.all([
    read("app/api/pilot/relacionamento/route.ts"),
    read("app/components/RelacionamentoTools.tsx"),
  ]);

  assert.match(route, /v\.data_entrada/);
  assert.match(route, /diasDesde\(\s*semPrimeiroContato \? v\.data_entrada : v\.ultimo_contato/);
  assert.match(route, /sem_primeiro_contato: semPrimeiroContato/);
  assert.doesNotMatch(route, /:\s*999/);
  assert.match(tools, /Cadastrado hoje · primeiro contato pendente/);
  assert.match(tools, /rotuloTempoSemContato\(item\)/);
});

test("post-its continuam disponíveis na central completa sem poluir o layout principal", async () => {
  const [operations, notes, css] = await Promise.all([
    read("app/components/TenantOperations.tsx"),
    read("app/components/CareNotesBoard.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(operations, /visitor-project-center-drawer-v6/);
  assert.match(operations, /<RelacionamentoTools visitantes=\{visitors\} compacto=\{false\}/);
  assert.match(operations, /<CareNotesBoard \/>/);
  assert.match(notes, /side\?: boolean/);
  assert.match(css, /\.visitor-project-center-drawer-v6[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.care-notes-board\.is-side \.care-note[^}]*aspect-ratio:1/);
});

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
