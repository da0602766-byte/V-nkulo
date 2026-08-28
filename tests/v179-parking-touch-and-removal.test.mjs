import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const parking = await readFile(new URL("../app/components/ParkingWorkspace.tsx", import.meta.url), "utf8");
const availability = await readFile(new URL("../app/api/pilot/estacionamento/disponibilidade/route.ts", import.meta.url), "utf8");
const people = await readFile(new URL("../app/components/PeopleWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("parking editor supports pointer movement and saves without a full successful reload", () => {
  assert.match(parking, /onPointerDown=\{\(event\) => startPointerMove\(event, space\.id\)\}/);
  assert.match(parking, /setPointerCapture/);
  assert.match(parking, /ATUALIZAR_POSICAO/);
  assert.match(parking, /setFeedback\("Posição da vaga salva\."\)/);
  assert.match(styles, /touch-action:none/);
});

test("sector selection reveals the persisted vacancy layout before booking", () => {
  assert.match(parking, /parking-mobile-sector-preview/);
  assert.match(parking, /Posicionamento das vagas/);
  assert.match(parking, /ParkingMobilePositionMap/);
  assert.match(parking, /space\.posicao_x \/ width/);
  assert.match(parking, /Ver vagas do setor/);
});

test("parking selection remains reachable while reservations are gated", () => {
  assert.doesNotMatch(parking, /return <ParkingReservationGate/);
  assert.match(parking, /Mapa disponível para consulta/);
  assert.match(parking, /Tentar novamente/);
  assert.match(availability, /vagas:spaces\.results/);
});

test("person removal is readable, guarded and updates the list without refetching it", () => {
  assert.match(people, /removeConfirmation !== "REMOVER"/);
  assert.match(people, /Remover da comunidade/);
  assert.match(people, /people: current\.people\.filter/);
  assert.match(styles, /\.people-modal-actions\s*\{[^}]*display:flex/s);
  assert.match(styles, /\.people-role-form>label\s*\{[^}]*display:grid/s);
});
