import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const console_ = await readFile(new URL("../app/components/parking/ParkingManagementConsole.tsx", import.meta.url), "utf8");
const events = await readFile(new URL("../app/components/EventsWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

// V2026 — o antigo painel único "Configuração do estacionamento" virou a aba
// "Equipe e configuração" (responsável e instruções) mais o bloco
// "Criar setores e vagas" dentro da aba "Mapa e vagas" do novo console.
test("gestão organiza responsável, setores e vagas em blocos dedicados", () => {
  assert.match(console_, /Responsável e instruções/);
  assert.match(console_, /Novo setor/);
  assert.match(console_, /Adicionar vagas/);
  assert.match(styles, /\.gestao-settings-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\)/s);
  assert.match(styles, /\.gestao-tabs button\.is-active/);
});

test("votação usa ação compacta, legível e responsiva", () => {
  assert.match(events, /event-poll-toggle-icon/);
  assert.match(events, /event-poll-toggle-action/);
  assert.match(events, /pollEnabled \? "Remover" : "Adicionar"/);
  assert.match(styles, /\.event-poll-toggle:hover/);
  assert.match(styles, /\.event-poll-toggle-action em\s*\{\s*display:none/);
});
