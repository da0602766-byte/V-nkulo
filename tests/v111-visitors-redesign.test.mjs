import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Visitantes usa dashboard real, lista WhatsApp e configurações em uma engrenagem", async () => {
  const [workspace, categoriesApi, styles] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/api/pilot/visitante-categorias/route.ts"),
    source("app/globals.css"),
  ]);

  assert.match(workspace, /DASHBOARD CRESCENTE/);
  assert.match(workspace, /Configurações de visitantes/);
  assert.match(workspace, /visitor-settings-panel/);
  assert.match(workspace, /https:\/\/wa\.me\//);
  assert.match(workspace, /Ministério responsável/);
  assert.match(categoriesApi, /COUNT\(\*\) AS novos/);
  assert.match(categoriesApi, /vc\.ministerio_id, m\.nome AS ministerio_nome/);
  assert.match(styles, /\.visitor-growth-chart/);
  assert.match(styles, /@media \(max-width:680px\)[\s\S]*\.visitor-settings-panel/);
});

test("associação categoria-ministério possui migration e aparece no módulo ministerial", async () => {
  const [schema, migration, ministryApi, ministryUi, categoryPatch, tenantPolicy] = await Promise.all([
    source("db/schema.ts"),
    source("drizzle/0046_eager_speed.sql"),
    source("app/api/pilot/ministerios/route.ts"),
    source("app/components/SecretaryMinisterialWorkspace.tsx"),
    source("app/api/pilot/visitante-categorias/[id]/route.ts"),
    source("app/lib/tenant-policy.mjs"),
  ]);

  assert.match(schema, /ministerioId: integer\("ministerio_id"\)/);
  assert.match(migration, /ADD `ministerio_id` integer/);
  assert.match(migration, /visitante_categorias_comunidade_ministerio_idx/);
  assert.match(categoryPatch, /O ministério deve pertencer à comunidade ativa/);
  assert.match(ministryApi, /categorias_visitantes/);
  assert.match(ministryUi, /Categorias de visitantes/);
  assert.match(tenantPolicy, /ADMIN_COMUNIDADE:[\s\S]*visitor\.categories\.manage/);
  assert.match(tenantPolicy, /SUPERADMIN:[\s\S]*visitor\.categories\.manage/);
});
