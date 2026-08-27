import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("installed PWA hides the install prompt and respects the phone safe area", async () => {
  const [install, layout, css] = await Promise.all([
    read("app/components/MobileAppInstall.tsx"),
    read("app/layout.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(install, /android-app:\/\//);
  assert.match(install, /appinstalled/);
  assert.match(css, /display-mode:standalone/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(css, /env\(safe-area-inset-top\)/);
});

test("camera and notification permissions have explicit mobile flows", async () => {
  const [qr, notifications, serviceWorker, edgeWorker] = await Promise.all([
    read("app/components/ParkingReservationQr.tsx"),
    read("app/components/PilotNotificationCenter.tsx"),
    read("public/sw.js"),
    read("worker/index.ts"),
  ]);
  assert.match(qr, /navigator\.permissions\.query/);
  assert.match(qr, /const streamPromise = navigator\.mediaDevices\.getUserMedia/);
  assert.match(qr, /onClick=\{openScanner\}/);
  assert.match(qr, /Permitir câmera/);
  assert.match(qr, /Tentar novamente/);
  assert.match(notifications, /Notification\.requestPermission/);
  assert.match(notifications, /showNotification/);
  assert.match(notifications, /Liberar notificações do aplicativo/);
  assert.match(notifications, /Configurações › Aplicativos › Vínkulo › Notificações/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(edgeWorker, /camera=\(self\)/);
  assert.doesNotMatch(edgeWorker, /camera=\(\)/);
});

test("mobile parking keeps the ticket, QR and reusable profile available", async () => {
  const parking = await read("app/components/ParkingWorkspace.tsx");
  assert.match(parking, /vinkulo-parking-profile-v1/);
  assert.match(parking, /CPF\/CNPJ não será salvo/);
  assert.match(parking, /Código copiado/);
  assert.match(parking, /ParkingReservationQr code=\{ticketCode\}/);
  assert.match(parking, /ACESSO AUTENTICADO/);
  assert.match(parking, /canManageReservations && \(canEntry \|\| canExit \|\| canEdit \|\| canConfigure\)/);
  assert.match(parking, /parking-reservation-person/);
});
