import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const parking = await readFile(new URL("../app/components/ParkingWorkspace.tsx", import.meta.url), "utf8");
const events = await readFile(new URL("../app/components/EventsWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("configuração do estacionamento organiza liderança, setores e vagas", () => {
  assert.match(parking, /Configuração do estacionamento/);
  assert.match(parking, /Liderança e orientações/);
  assert.match(parking, /Criar novo setor/);
  assert.match(parking, /Adicionar vagas/);
  assert.match(styles, /\.parking-settings-grid\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/s);
  assert.match(styles, /\.parking-map-settings>summary\s*\{[^}]*grid-template-columns/s);
});

test("votação usa ação compacta, legível e responsiva", () => {
  assert.match(events, /event-poll-toggle-icon/);
  assert.match(events, /event-poll-toggle-action/);
  assert.match(events, /pollEnabled \? "Remover" : "Adicionar"/);
  assert.match(styles, /\.event-poll-toggle:hover/);
  assert.match(styles, /\.event-poll-toggle-action em\s*\{\s*display:none/);
});
