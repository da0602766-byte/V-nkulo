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

test("event actions and cell details use blocking, scroll-safe overlays", async () => {
  const events = await read("app/components/EventsWorkspace.tsx");
  const cells = await read("app/components/TenantOperations.tsx");
  const styles = await read("app/globals.css");
  assert.match(events, /event-action-overlay/);
  assert.match(events, /document\.body\.style\.overflow = "hidden"/);
  assert.match(cells, /selected && <div className="cell-detail-overlay-v2"/);
  assert.match(styles, /\.cell-detail-content-v4[^}]*overflow-y:auto!important/s);
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
  const workspace = await read("app/components/ParkingWorkspace.tsx");
  const qr = await read("app/components/ParkingReservationQr.tsx");
  assert.match(availability, /EXISTS\(SELECT 1 FROM estacionamento_reservas/);
  assert.match(workspace, /Reservada/);
  assert.doesNotMatch(reservations, /confirmacoes_evento/);
  assert.match(reservations, /status\s*=\s*'PUBLICADO'/);
  assert.match(qr, /typeof accepted === "string"/);
  assert.match(workspace, /reservation\.status === "CONFIRMADA"[\s\S]*<ParkingReservationQr/);
  assert.match(qr, /Válido até/);
  assert.match(qr, /formatRemaining/);
  assert.match(workspace, /Horário sugerido do culto/);
  assert.match(reservations, /O check-in era permitido até esse horário/);
});
