import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const managementConsole = await readFile(new URL("../app/components/parking/ParkingManagementConsole.tsx", import.meta.url), "utf8");
const parkingData = await readFile(new URL("../app/components/parking/useParkingData.ts", import.meta.url), "utf8");
const memberPortal = await readFile(new URL("../app/components/parking/ParkingMemberPortal.tsx", import.meta.url), "utf8");
const format = await readFile(new URL("../app/components/parking/format.ts", import.meta.url), "utf8");
const availability = await readFile(new URL("../app/api/pilot/estacionamento/disponibilidade/route.ts", import.meta.url), "utf8");
const people = await readFile(new URL("../app/components/PeopleWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("parking editor supports pointer movement and saves without a full successful reload", () => {
  assert.match(managementConsole, /onPointerDown=\{\(event\) => startPointerMove\(event, space\.id\)\}/);
  assert.match(managementConsole, /setPointerCapture/);
  assert.match(parkingData, /ATUALIZAR_POSICAO/);
  assert.match(parkingData, /setFeedback\("Posição da vaga salva\."\)/);
  assert.match(styles, /\.gestao-position-canvas\s*\{[^}]*touch-action:\s*none/s);
});

// V2026 — a reserva do membro deixou de exigir um passo "ver vagas do
// setor": o mapa do estacionamento já mostra a disponibilidade de cada vaga
// de cada setor de uma vez. O posicionamento em pixels (posicao_x/posicao_y)
// persistido pelo líder continua existindo e é usado no console de gestão.
test("o mapa de reserva do membro mostra a disponibilidade de todos os setores de uma vez", () => {
  assert.match(memberPortal, /aria-label="Vagas por setor"/);
  assert.match(memberPortal, /gestao-lot-grid/);
  assert.match(memberPortal, /isSpaceAvailable/);
  assert.match(format, /export function hasCustomParkingLayout/);
  assert.match(managementConsole, /space\.posicao_x, top: space\.posicao_y/);
});

test("parking selection remains reachable while reservations are gated", () => {
  assert.match(memberPortal, /Mapa disponível para consulta/);
  assert.match(memberPortal, /Tentar novamente/);
  assert.match(availability, /vagas:spaces\.results/);
});

test("person removal is readable, guarded and updates the list without refetching it", () => {
  assert.match(people, /removeConfirmation !== "REMOVER"/);
  assert.match(people, /Remover da comunidade/);
  assert.match(people, /people: current\.people\.filter/);
  assert.match(styles, /\.people-modal-actions\s*\{[^}]*display:flex/s);
  assert.match(styles, /\.people-role-form>label\s*\{[^}]*display:grid/s);
});
