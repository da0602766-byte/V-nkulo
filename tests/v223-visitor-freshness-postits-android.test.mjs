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

test("post-its ficam na coluna lateral da visão geral", async () => {
  const [operations, notes, secretaryCss, visitorsCss] = await Promise.all([
    read("app/components/TenantOperations.tsx"),
    read("app/components/CareNotesBoard.tsx"),
    read("app/secretary.css"),
    read("app/visitors.css"),
  ]);

  // A coluna lateral agora é a coluna estreita da grade de cartões que a aba
  // divide com Ministérios, e não mais uma grade só dos visitantes.
  assert.match(operations, /visitor-dashboard-v7/);
  assert.match(operations, /<CareNotesBoard side \/>/);
  assert.match(notes, /side\?: boolean/);
  assert.match(secretaryCss, /\.secretary-dashboard-grid\{display:grid;grid-template-columns:1\.35fr 1fr/);
  assert.match(visitorsCss, /\.visitor-dashboard-v7 > \.care-notes-board\.is-side/);
  // O quadrado forçado saiu de propósito: um recado de uma linha virava um
  // cartão de 220 px com o resto em branco.
  assert.match(visitorsCss, /\.care-notes-board\.is-side \.care-notes-grid \{ align-items: start/);
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
