import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("paletas incluem identidades pretas realmente distintas", async () => {
  const theme = await read("app/lib/community-theme.ts");
  for (const id of ["NOITE_CARMESIM", "NOITE_OCEANO", "NOITE_DOURADA"]) {
    assert.match(theme, new RegExp(`id: "${id}"`));
  }
  assert.match(theme, /background: "#050506"/);
  assert.match(theme, /background: "#030609"/);
  assert.match(theme, /background: "#050504"/);
});

test("tema claro móvel usa superfícies sólidas e respiro lateral", async () => {
  const styles = await read("app/globals.css");
  assert.match(styles, /data-pilot-theme="claro"[\s\S]*pilot-mobile-sheet/);
  assert.match(styles, /data-pilot-theme="claro"[\s\S]*backdrop-filter: none !important/);
  assert.match(styles, /community-home-rail[\s\S]*padding-inline: 18px !important/);
});

test("Fio do Dia expõe estado visual animado com acessibilidade", async () => {
  const [thread, styles] = await Promise.all([
    read("app/components/DayThreadWorkspace.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(thread, /data-status=/);
  assert.match(styles, /@keyframes fio-status-now/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("Ministérios mantém criar escala e checklist junto do retorno", async () => {
  const ministry = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  const toolbar = ministry.match(/<div className="secretary-toolbar">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || ministry;
  assert.match(toolbar, /Todos os ministérios/);
  assert.match(toolbar, /Criar escala/);
  assert.match(toolbar, /Checklist/);
});

test("QR apresenta resultado detalhado e histórico removível", async () => {
  const [qr, parking, route] = await Promise.all([
    read("app/components/ParkingReservationQr.tsx"),
    read("app/components/ParkingWorkspace.tsx"),
    read("app/api/pilot/estacionamento/reservas/route.ts"),
  ]);
  assert.match(qr, /parking-qr-result/);
  assert.match(qr, /Ler próximo QR Code/);
  assert.match(parking, /onDetected=\{\(codigo\)=>reservationAction/);
  assert.match(parking, /parking-mobile-reservation-history/);
  assert.match(route, /Você só pode excluir o seu próprio histórico/);
});

test("PDF preserva personalização e usa download compatível com aplicativo", async () => {
  const [composer, bridge] = await Promise.all([
    read("app/components/PdfComposer.tsx"),
    read("app/lib/androidNativeBridge.ts"),
  ]);
  assert.match(composer, /downloadFileForDevice\(downloadUrl, filename\)/);
  assert.match(composer, /titulo: title, nota: note/);
  assert.match(bridge, /downloadFile\?: \(url: string, filename: string\)/);
  assert.match(bridge, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
});

test("menu móvel permite ativar notificações do aparelho", async () => {
  const [dashboard, notifications] = await Promise.all([
    read("app/components/PilotDashboard.tsx"),
    read("app/components/PilotNotificationCenter.tsx"),
  ]);
  assert.match(dashboard, /Avisar neste celular/);
  assert.match(dashboard, /vinkulo:enable-device-notifications/);
  assert.match(notifications, /addEventListener\("vinkulo:enable-device-notifications"/);
  assert.match(notifications, /showNotification\("Notificações ativadas"/);
});
