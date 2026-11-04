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

  assert.match(agenda, /aria-label="Camadas do calendário"/);
  const choices = agenda.slice(agenda.indexOf('className={styles.dayChoices}'), agenda.indexOf('{formAberto && ('));
  assert.match(choices, /aoCriarEvento && <button/);
  assert.match(choices, /const day = diaSelecionado; setDiaAberto\(null\); aoCriarEvento\(day\)/);
  assert.match(choices, /abrirCompromisso\(diaSelecionado\)/);
  assert.match(events, /className="event-form-actions"/);
  assert.match(events, />\s*Fechar\s*<\/button>/);
});

test("Gestão oferece edição de setores no editor de cenário", async () => {
  const managementConsole = await read("app/components/parking/ParkingManagementConsole.tsx");

  assert.match(managementConsole, /<ParkingSceneEditor/);
  const editor = await read("app/components/parking/ParkingSceneEditor.tsx");
  assert.match(editor, /Nome do setor/);
  assert.match(editor, /Excluir setor/);
  assert.match(editor, /Transfira ou remova as vagas deste setor antes de excluí-lo/);
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
