import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("app/components/PilotDashboard.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

test("três posições móveis podem ser trocadas por toque prolongado", () => {
  assert.match(dashboard, /DEFAULT_MOBILE_SHORTCUTS: View\[\] = \["inicio", "eventos", "solicitacoes"\]/);
  assert.match(dashboard, /MOBILE_SHORTCUT_LONG_PRESS_MS = 520/);
  assert.match(dashboard, /onPointerDown=\{\(\) => beginMobileShortcutPress\(slot\)\}/);
  assert.match(dashboard, /onContextMenu=\{\(event\) => \{ event\.preventDefault\(\); openMobileShortcutEditor\(slot\); \}\}/);
  assert.match(dashboard, /mobileShortcutItems\.slice\(0, 2\)/);
  assert.match(dashboard, /mobileShortcutItems\.slice\(2, 3\)/);
});

test("preferência fica isolada por pessoa e comunidade e respeita permissões", () => {
  assert.match(dashboard, /vinkulo:mobile-shortcuts:\$\{userEmail\.trim\(\)\.toLowerCase\(\)\}:\$\{active\.comunidadeId\}/);
  assert.match(dashboard, /mobileShortcutsLoadedKey\.current !== mobileShortcutStorageKey/);
  assert.match(dashboard, /normalizeMobileShortcuts\(saved, primaryMenu\.map\(\(item\) => item\.id\)\)/);
  assert.match(dashboard, /window\.localStorage\.setItem\(mobileShortcutStorageKey, JSON\.stringify\(mobileShortcuts\)\)/);
  assert.match(dashboard, /primaryMenu\.map\(\(item\) => \(/);
});

test("Adicionar e Menu continuam fixos e a troca exige confirmação", () => {
  const mobileNav = dashboard.match(/<nav className="pilot-mobile-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.match(mobileNav, /pilot-mobile-create-button/);
  assert.match(mobileNav, /aria-label="Adicionar ou cadastrar"/);
  assert.match(mobileNav, /aria-label="Abrir menu geral"/);
  assert.match(dashboard, /Substituir atalho/);
  assert.match(dashboard, /Trocar por \$\{MENU\.find/);
  assert.match(dashboard, /applyMobileShortcutReplacement/);
});

test("coluna inferior usa a mesma largura e margem do feed no celular", () => {
  assert.match(styles, /Início V236 — coluna alinhada ao feed/);
  assert.match(styles, /\.community-home-grid,[\s\S]*?\.community-feed-panel,[\s\S]*?\.community-home-rail \{[\s\S]*?box-sizing:border-box;[\s\S]*?width:100%;[\s\S]*?max-width:100%;[\s\S]*?margin-inline:0!important;/);
});

test("seletor de atalhos cabe em telas estreitas", () => {
  assert.match(styles, /\.pilot-mobile-shortcut-options \{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\);[\s\S]*?overflow-y:auto;/);
  assert.match(styles, /@media\(max-width:390px\)[\s\S]*?\.pilot-mobile-shortcut-options \{ grid-template-columns:1fr; \}/);
});
