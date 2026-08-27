import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("read notifications can be cleared without deleting unread notices", async () => {
  const [center, route] = await Promise.all([
    read("app/components/PilotNotificationCenter.tsx"),
    read("app/api/pilot/notificacoes/route.ts"),
  ]);
  assert.match(center, /Limpar visualizadas/);
  assert.match(center, /notification-clear-one/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /Visualize a notificação antes de limpá-la/);
  assert.match(route, /JOIN notificacoes_lidas/);
});

test("authorized parking roles keep management access even with an active ticket", async () => {
  const [parking, reservations] = await Promise.all([
    read("app/components/ParkingWorkspace.tsx"),
    read("app/api/pilot/estacionamento/reservas/route.ts"),
  ]);
  assert.match(parking, /canEntry \|\| canExit \|\| canEdit \|\| canConfigure/);
  assert.match(parking, /canManage && <div className="parking-mobile-role"/);
  assert.match(parking, /Abrir gestão/);
  assert.match(reservations, /"parking.entry", "parking.exit", "parking.edit", "parking.configure"/);
});

test("public mobile header is compact and install prompt is browser-driven", async () => {
  const [header, theme, install, css] = await Promise.all([
    read("app/components/PublicHeader.tsx"),
    read("app/components/ThemeControl.tsx"),
    read("app/components/MobileAppInstall.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(header, /<ThemeControl compact cycle \/>/);
  assert.match(theme, /theme-control-cycle/);
  assert.match(install, /if \(isAppleMobile\(\)\) setVisible\(true\)/);
  assert.match(install, /beforeinstallprompt[\s\S]*setVisible\(true\)/);
  assert.match(css, /social-public-header\.reception-header[\s\S]*grid-template-columns:38px minmax\(0,1fr\)/);
});
