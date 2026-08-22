import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("configurações de visitantes usam diálogo compacto e fechável no celular", async () => {
  const [workspace, styles] = await Promise.all([
    readFile(new URL("app/components/TenantOperations.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(workspace, /const \[settingsOpen, setSettingsOpen\] = useState\(false\)/);
  assert.match(workspace, /role="dialog"/);
  assert.match(workspace, /aria-modal="true"/);
  assert.match(workspace, /visitor-settings-close/);
  assert.match(workspace, /if \(event\.key === "Escape"\) setSettingsOpen\(false\)/);
  assert.doesNotMatch(workspace, /<details className="visitor-settings">/);

  assert.match(styles, /\.visitor-settings-list \{[^}]*grid-auto-rows:max-content;[^}]*align-content:start;/);
  assert.match(styles, /\.visitor-settings-panel \{[^}]*display:flex;[^}]*flex-direction:column;/);
  assert.match(styles, /@media \(max-width:680px\)[\s\S]*\.visitor-settings-panel \{ position:fixed;[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.visitor-settings-panel>header \{ position:sticky;/);
});

test("dashboard não exibe estado vazio antes de carregar categorias", async () => {
  const workspace = await readFile(new URL("app/components/TenantOperations.tsx", root), "utf8");

  assert.match(workspace, /const \[categoriesLoaded, setCategoriesLoaded\] = useState\(false\)/);
  assert.match(workspace, /finally \{\s*setCategoriesLoaded\(true\);/);
  assert.match(workspace, /!categoriesLoaded && <p className="visitor-dashboard-loading">Carregando crescimento/);
  assert.match(workspace, /categoriesLoaded && !categories\.length/);
});
