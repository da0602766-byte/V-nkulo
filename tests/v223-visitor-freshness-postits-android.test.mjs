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

test("post-its ficam em uma coluna lateral compacta com cartões quadrados", async () => {
  const [operations, notes, css] = await Promise.all([
    read("app/components/TenantOperations.tsx"),
    read("app/components/CareNotesBoard.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(operations, /visitor-care-workspace-v3/);
  assert.match(operations, /<CareNotesBoard side \/>/);
  assert.match(notes, /side\?: boolean/);
  assert.match(css, /\.visitor-care-workspace-v3[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(250px,300px\)/);
  assert.match(css, /\.care-notes-board\.is-side \.care-note[^}]*aspect-ratio:1/);
});

test("APK usa a ponte nativa e mantém Service Worker como fallback do navegador", async () => {
  const [center, bridge] = await Promise.all([
    read("app/components/PilotNotificationCenter.tsx"),
    read("app/lib/androidNativeBridge.ts"),
  ]);

  assert.match(bridge, /showNotification\?:/);
  assert.match(bridge, /isNativeNotificationBridgeAvailable/);
  assert.match(bridge, /export function showDeviceNotification/);
  assert.match(center, /nativeBridge && showDeviceNotification/);
  assert.match(center, /registration\.showNotification/);
  assert.match(center, /vinkulo:notification-open/);
  assert.match(center, /isSafeInternalDestination\(destination\)/);
});
