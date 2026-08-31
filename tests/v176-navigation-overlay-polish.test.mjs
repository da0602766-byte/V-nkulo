import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("menu móvel preserva dimensões visíveis para todos os ícones", () => {
  const styles = read("app/globals.css");

  assert.match(styles, /\.pilot-mobile-nav-icon \{[\s\S]*?width: 24px !important;[\s\S]*?height: 24px !important;/);
  assert.match(styles, /\.pilot-mobile-nav-icon svg \{[\s\S]*?width: 21px !important;[\s\S]*?height: 21px !important;/);
});

test("Mural usa símbolo diferente da página inicial", () => {
  // Os traçados saíram de PilotDashboard.tsx para MenuIcon.tsx, para que a
  // área do proprietário use o mesmo conjunto. A garantia é a mesma.
  const icons = read("app/components/MenuIcon.tsx");
  const dashboard = read("app/components/PilotDashboard.tsx");
  const home = icons.match(/inicio: "([^"]+)"/)?.[1];
  const wall = icons.match(/mural: "([^"]+)"/)?.[1];

  assert.ok(home && wall);
  assert.notEqual(wall, home);
  assert.match(wall, /M4 5h16v14/);
  assert.match(dashboard, /MenuIcon id=\{item\.key as MenuIconId\}/);
});

test("Escalas usa símbolo diferente de Ministérios", () => {
  const icons = read("app/components/MenuIcon.tsx");
  const ministries = icons.match(/ministerios: "([^"]+)"/)?.[1];
  const schedules = icons.match(/escalas: "([^"]+)"/)?.[1];

  assert.ok(ministries && schedules);
  assert.notEqual(schedules, ministries);
});

test("atalho visual é removido e Ajuda não cobre diálogos", () => {
  const styles = read("app/globals.css");

  assert.match(styles, /\.pilot-command-search-trigger kbd \{ display: none; \}/);
  assert.match(styles, /body:has\(\[role="dialog"\]\[aria-modal="true"\]\) > \.global-feedback-launcher/);
});
