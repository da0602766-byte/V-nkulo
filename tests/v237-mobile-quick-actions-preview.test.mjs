import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const enhancer = readFileSync("app/components/MobileQuickActionsEnhancer.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const styles = readFileSync("app/mobile-quick-actions.css", "utf8");

test("prévia aprovada dos atalhos móveis mantém busca real e acabamento visual", () => {
  assert.match(layout, /MobileQuickActionsEnhancer/);
  assert.match(enhancer, /placeholder="Buscar ação\.\.\."/);
  assert.match(enhancer, /normalize\(button\.textContent/);
  assert.match(enhancer, /Precisa de outra opção\?/);
  assert.match(styles, /Escolha uma opção para continuar/);
  assert.match(styles, /Recepção/);
  assert.match(styles, /Acolhimento/);
  assert.match(styles, /Controle/);
  assert.match(styles, /Segurança/);
  assert.match(styles, /Agenda/);
  assert.match(styles, /Comunhão/);
  assert.match(styles, /Ministérios/);
  assert.match(styles, /Organização/);
  assert.match(styles, /Cuidado/);
  assert.match(styles, /Apoio/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /data-data-saver="true"/);
});
