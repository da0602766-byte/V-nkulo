import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const managementConsole = await readFile(new URL("../app/components/parking/ParkingManagementConsole.tsx", import.meta.url), "utf8");
const sceneView = await readFile(new URL("../app/components/parking/ParkingSceneView.tsx", import.meta.url), "utf8");
const memberPortal = await readFile(new URL("../app/components/parking/ParkingMemberPortal.tsx", import.meta.url), "utf8");
const format = await readFile(new URL("../app/components/parking/format.ts", import.meta.url), "utf8");
const availability = await readFile(new URL("../app/api/pilot/estacionamento/disponibilidade/route.ts", import.meta.url), "utf8");
const people = await readFile(new URL("../app/components/PeopleWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

// Runtime persistence/concurrency coverage lives in parking-scene.test.mjs;
// browser gestures, undo/redo and publication in parking-scene-qa.mjs.
test("parking editor exposes pointer capture and a separate publication workflow", () => {
  assert.match(sceneView, /setPointerCapture/);
  assert.match(sceneView, /onPointerCancel/);
  assert.match(managementConsole, /ParkingSceneEditor/);
});

// Redesign de outubro/2026: membro e gestão usam as posições persistidas,
// com seleção de setor e alternativa em lista para navegação acessível.
test("o mapa do membro preserva posições reais e permite escolher setor e lista acessível", async () => {
  assert.match(memberPortal, /selectedSector\?\.spaces/);
  const map = await readFile(new URL("../app/components/parking/ParkingSpaceMap.tsx", import.meta.url), "utf8");
  assert.match(map, /left:space.posicao_x,top:space.posicao_y/);
  assert.match(map, /Lista de vagas/);
  assert.match(memberPortal, /isSpaceAvailable/);
  assert.match(format, /export function hasCustomParkingLayout/);
  assert.match(map, /ParkingPublishedScene/);
});

test("parking selection remains reachable while reservations are gated", () => {
  assert.match(memberPortal, /Escolha uma atividade para consultar a disponibilidade/);
  assert.match(memberPortal, /Tentar novamente/);
  assert.match(availability, /readParkingContext/);
});

test("person removal is readable, guarded and updates the list without refetching it", () => {
  assert.match(people, /removeConfirmation !== "REMOVER"/);
  assert.match(people, /Remover da comunidade/);
  assert.match(people, /people: current\.people\.filter/);
  assert.match(styles, /\.people-modal-actions\s*\{[^}]*display:flex/s);
  assert.match(styles, /\.people-role-form>label\s*\{[^}]*display:grid/s);
});
