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
  const [qr, notifications, webPushClient, serviceWorker, edgeWorker] = await Promise.all([
    read("app/components/ParkingReservationQr.tsx"),
    read("app/components/PilotNotificationCenter.tsx"),
    read("app/lib/web-push-client.ts"),
    read("public/sw.js"),
    read("worker/index.ts"),
  ]);
  assert.match(qr, /navigator\.permissions\.query/);
  assert.match(qr, /const streamPromise = navigator\.mediaDevices\.getUserMedia/);
  assert.match(qr, /onClick=\{openScanner\}/);
  assert.match(qr, /Permitir câmera/);
  assert.match(qr, /Tentar novamente/);
  assert.match(webPushClient, /Notification\.requestPermission/);
  assert.match(webPushClient, /pushManager\.subscribe/);
  assert.match(notifications, /subscribeWebPushNotifications/);
  assert.match(notifications, /showNotification/);
  assert.match(notifications, /Liberar notificações do aplicativo/);
  assert.match(notifications, /Configurações › Aplicativos › Vínkulo › Notificações/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(edgeWorker, /camera=\(self\)/);
  assert.doesNotMatch(edgeWorker, /camera=\(\)/);
});

// V2026 — a Gestão do estacionamento foi redesenhada: o antigo "perfil"
// salvo em localStorage virou uma garagem com vários veículos, e o
// console de gestão passou a ser a mesma experiência (responsiva) tanto no
// celular quanto no computador para quem tem acesso permanente.
test("a reserva mantém comprovante, QR e uma garagem reutilizável do próprio usuário", async () => {
  const [memberPortal, garage] = await Promise.all([
    read("app/components/parking/ParkingMemberPortal.tsx"),
    read("app/components/parking/useParkingGarage.ts"),
  ]);
  assert.match(garage, /vinkulo:gestao:garagem:/);
  assert.match(memberPortal, /CPF\/CNPJ não será salvo/);
  assert.match(memberPortal, /Código copiado/);
  assert.doesNotMatch(memberPortal, /ParkingReservationQr code=\{justCreated\.codigo\}/);
  assert.match(memberPortal, /Quando aprovada, o comprovante para entrada/);
  assert.match(memberPortal, /ParkingReservationQr code=\{reservation\.codigo\}/);
  assert.match(memberPortal, /Entrada já liberada/);
});

test("quem tem acesso permanente à gestão não perde o console ao trocar de aparelho", async () => {
  const [orchestrator, managementConsole, reservations] = await Promise.all([
    read("app/components/ParkingWorkspace.tsx"),
    read("app/components/parking/ParkingManagementConsole.tsx"),
    read("app/api/pilot/estacionamento/reservas/route.ts"),
  ]);
  assert.match(orchestrator, /isPermanentLeader/);
  assert.match(orchestrator, /parking\.configure/);
  assert.match(orchestrator, /showOperatorMobile = isMobile && isOnDutyShift && !isPermanentLeader/);
  assert.match(managementConsole, /ParkingReservationTable parking=\{parking\}/);
  const table = await read("app/components/parking/ParkingReservationTable.tsx");
  assert.match(table, /<summary>Detalhes<\/summary>/);
  assert.match(reservations, /"parking.entry", "parking.exit", "parking.edit", "parking.configure"/);
});

test("public mobile header is compact and install prompt is browser-driven", async () => {
  const [header, theme, install, css] = await Promise.all([
    read("app/components/PublicHeader.tsx"),
    read("app/components/ThemeControl.tsx"),
    read("app/components/MobileAppInstall.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(header, /<ThemeControl compact cycle storageId=\{user\?\.email\} \/>/);
  assert.match(theme, /theme-control-cycle/);
  assert.match(install, /if \(isAppleMobile\(\)\) setVisible\(true\)/);
  assert.match(install, /beforeinstallprompt[\s\S]*setVisible\(true\)/);
  assert.match(css, /social-public-header\.reception-header[\s\S]*grid-template-columns:38px minmax\(0,1fr\)/);
});
