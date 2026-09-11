import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("experiência local detecta conexão lenta e melhora mensagens de validação", async () => {
  const controller = await read("app/components/SystemExperienceController.tsx");
  assert.match(controller, /effectiveType === "2g"/);
  assert.match(controller, /document\.addEventListener\("invalid"/);
  assert.match(controller, /Digite um CEP válido com 8 números/);
  assert.match(controller, /Modo de conexão lenta ativado/);
});

test("cache local preserva apenas o shell e arquivos estáticos", async () => {
  const worker = await read("public/sw.js");
  assert.match(worker, /vinkulo-static-v4/);
  assert.match(worker, /\["script", "style", "font", "image"\]/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(worker, /cache\.put\(request[^\n]+navigate/);
});

test("preferências de transparência e economia são restauradas antes da tela", async () => {
  const [layout, dashboard] = await Promise.all([
    read("app/layout.tsx"),
    read("app/components/PilotDashboard.tsx"),
  ]);
  assert.match(layout, /vinkulo:glass-opacity/);
  assert.match(layout, /vinkulo:data-saver/);
  assert.match(layout, /skip-to-content/);
  assert.match(dashboard, /Intensidade do vidro <b>\{glassOpacity\}%<\/b>/);
  assert.match(dashboard, /Economizar dados/);
  assert.match(dashboard, /dynamic\(\(\) => import\("\.\/TenantOperations"\)/);
  assert.match(dashboard, /vinkulo:recent-views/);
});

test("perfil próprio normaliza telefone e rejeita data futura", async () => {
  const validation = await read("app/lib/people-validation.ts");
  assert.match(validation, /normalizeBrazilianPhone/);
  assert.match(validation, /A data de nascimento não pode estar no futuro/);
});
