import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile navigation keeps compact captions and teams open as accordions", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  const ministries = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  const styles = await read("app/globals.css");
  assert.match(dashboard, /pilot-mobile-label/);
  assert.match(styles, /\.pilot-mobile-nav>a,[\s\S]*font-size:var\(--fs-2xs\)/);
  assert.match(ministries, /expandedTeamId/);
  assert.match(ministries, /ministry-team-collapse-trigger/);
});

test("event actions use blocking, scroll-safe overlays", async () => {
  const events = await read("app/components/EventsWorkspace.tsx");
  assert.match(events, /event-action-overlay/);
  assert.match(events, /document\.body\.style\.overflow = "hidden"/);
});

test("célula em Gestão abre como página cheia, não como modal", async () => {
  // O design aprovado é explícito: "Página inteira, não um modal" (Frame 2).
  // O antigo overlay .cell-detail-overlay-v2 saiu com o redesenho de
  // Gestão/Participação — ver app/components/cells/CellManagementConsole.tsx.
  const managementConsole = await read("app/components/cells/CellManagementConsole.tsx");
  const styles = await read("app/globals.css");
  assert.match(managementConsole, /function CellDetailPage/);
  assert.match(managementConsole, /cgestao-back/);
  assert.doesNotMatch(managementConsole, /cell-detail-overlay-v2/);
  assert.match(styles, /\.cgestao-back \{/);
});

test("publication comments and composer controls are compact and readable", async () => {
  const home = await read("app/components/CommunityHome.tsx");
  const styles = await read("app/globals.css");
  const createComposer = home.slice(home.indexOf("community-composer-dialog"), home.indexOf("community-composer-dialog") + 7000);
  assert.doesNotMatch(createComposer, /name="imagemAlt"/);
  assert.match(styles, /\.community-comment-body p\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styles, /\.community-composer \.composer-share input\s*\{[^}]*width:17px/s);
  assert.match(styles, /\.community-composer-close\s*\{[^}]*width:34px/s);
});

test("parking exposes reserved spaces and reservations do not require an RSVP", async () => {
  const availability = await read("app/api/pilot/estacionamento/disponibilidade/route.ts");
  const reservations = await read("app/api/pilot/estacionamento/reservas/route.ts");
  const memberPortal = await read("app/components/parking/ParkingMemberPortal.tsx");
  const qr = await read("app/components/ParkingReservationQr.tsx");
  assert.match(availability, /EXISTS\(SELECT 1 FROM estacionamento_reservas/);
  assert.match(memberPortal, /Reservada/);
  assert.doesNotMatch(reservations, /confirmacoes_evento/);
  assert.match(reservations, /status\s*=\s*'PUBLICADO'/);
  assert.match(qr, /typeof accepted === "string"/);
  assert.match(memberPortal, /reservation\.status === "CONFIRMADA"[\s\S]*<ParkingReservationQr/);
  assert.match(qr, /Válido até/);
  assert.match(qr, /formatRemaining/);
  // V2026 — o horário sugerido do culto virou preenchimento automático dos
  // campos de chegada/saída ao escolher o evento, em vez de um aviso fixo.
  assert.match(memberPortal, /function chooseEvent[\s\S]*getEventParkingWindow\(event\)/);
  assert.match(reservations, /O check-in era permitido até esse horário/);
});
