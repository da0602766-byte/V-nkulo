import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("event actions use an independent menu and expose both opening times", async () => {
  const workspace = await read("app/components/EventsWorkspace.tsx");
  assert.match(workspace, /actionMenuId/);
  assert.match(workspace, /aria-expanded=\{actionMenuId === item\.id\}/);
  assert.match(workspace, /Escalas disponíveis em/);
  assert.match(workspace, /Reservas do estacionamento em/);
});

test("parking reservations use the published event without requiring personal confirmation", async () => {
  const availability = await read("app/api/pilot/estacionamento/disponibilidade/route.ts");
  const reservations = await read("app/api/pilot/estacionamento/reservas/route.ts");
  const workspace = await read("app/components/ParkingWorkspace.tsx");
  assert.doesNotMatch(availability, /confirmacoes_evento/);
  assert.doesNotMatch(reservations, /confirmacoes_evento/);
  assert.match(reservations, /e\.status='PUBLICADO'/);
  assert.match(reservations, /reservas_abrem_em/);
  assert.match(workspace, /ParkingReservationGate/);
});

test("ministry schedules can be collected for timed publication with live status feedback", async () => {
  const route = await read("app/api/pilot/escalas/route.ts");
  const workspace = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  const migration = await read("drizzle/0053_reforma_fluxos.sql");
  assert.match(route, /publishDueSchedules/);
  assert.match(route, /status='AGENDADA'/);
  assert.match(workspace, /Agendar publicação/);
  assert.match(workspace, /SchedulePublicationCountdown/);
  assert.match(migration, /publicar_em/);
});

test("reading mode offers signup and cell profiles render above the page", async () => {
  const gate = await read("app/components/SharedScheduleAccessGate.tsx");
  const cells = await read("app/components/TenantOperations.tsx");
  const styles = await read("app/globals.css");
  assert.match(gate, /\/login\?modo=cadastro/);
  assert.match(cells, /selectedMemberProfile/);
  assert.match(cells, /cell-member-profile-dialog/);
  assert.match(styles, /\.cell-member-profile-overlay[^}]*z-index:1200/s);
});

test("publication copy uses the tubular message treatment", async () => {
  const styles = await read("app/globals.css");
  assert.match(styles, /\.social-feed-card \.social-post-copy \{/);
  assert.match(styles, /border-radius:28px 28px 28px 9px/);
  assert.match(styles, /\.social-feed-card \.social-post-copy::before/);
});
