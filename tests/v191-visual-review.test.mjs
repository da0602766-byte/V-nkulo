import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Início deixa o Fio na aba própria e simplifica o cabeçalho", async () => {
  const [home, dashboard] = await Promise.all([
    read("app/components/CommunityHome.tsx"),
    read("app/components/PilotDashboard.tsx"),
  ]);

  assert.doesNotMatch(home, /className="home-day-thread"/);
  assert.match(dashboard, /visibleView === "fio"/);
  assert.match(dashboard, /<DayThreadWorkspace permissions=\{active\.permissions\}/);
  assert.doesNotMatch(dashboard, /pilot-desktop-community-switcher/);
  assert.doesNotMatch(dashboard, /<small>Informações da comunidade<\/small>/);
  assert.match(dashboard, /Trocar comunidade pelo menu da conta/);
});

test("Agenda mantém ações juntas e editor sem faixa duplicada", async () => {
  const [agenda, events] = await Promise.all([
    read("app/components/AgendaCalendar.tsx"),
    read("app/components/EventsWorkspace.tsx"),
  ]);

  const layers = agenda.indexOf('className="agenda-camadas"');
  const newEvent = agenda.indexOf('className="agenda-novo-evento"');
  const commitment = agenda.indexOf('className="agenda-novo"');
  assert.ok(layers >= 0 && newEvent > layers && commitment > newEvent);
  assert.match(events, /className="event-form-summary"/);
  assert.match(events, />\s*Fechar\s*<\/button>/);
});

test("Estacionamento oferece posições dentro do editor do setor", async () => {
  const parking = await read("app/components/ParkingWorkspace.tsx");
  const header = parking.match(/<header><div><p className="pilot-kicker">MAPA DO ESTACIONAMENTO[\s\S]*?<\/header>/)?.[0] || "";

  assert.doesNotMatch(header, /Editar posições/);
  assert.match(parking, /className="parking-sector-editor-actions"/);
  assert.match(parking, /mapEditing \? "Concluir posições" : "Editar posições"/);
});

test("CSS final remove cartões e estabiliza o detalhe móvel de Células", async () => {
  const styles = await read("app/globals.css");

  assert.match(styles, /V191 — revisão visual de 31\/08/);
  assert.match(styles, /community-home-rail[\s\S]*background:\s*transparent\s*!important/);
  assert.match(styles, /event-poll-toggle[\s\S]*box-shadow:\s*none\s*!important/);
  assert.match(styles, /parking-sector-editor\[open\]::before/);
  assert.match(styles, /community-central-workspace > \.workspace-heading[\s\S]*background:\s*transparent/);
  assert.match(styles, /cell-detail-v2\.cell-detail-v4[\s\S]*width:\s*100%\s*!important/);
  assert.doesNotMatch(styles, /cell-detail-v2\.cell-detail-v4[\s\S]{0,160}width:\s*100vw\s*!important/);
  assert.match(styles, /cell-detail-v4 \.cell-tabs-v2[\s\S]*flex-flow:\s*row nowrap\s*!important/);
  assert.match(styles, /cell-detail-content-v4[\s\S]*overflow-y:\s*auto\s*!important/);
});
