import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("central de relacionamento conserva a leitura do cabeçalho em larguras intermediárias", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /@media \(max-width:1200px\)\s*\{[\s\S]*\.relationship-head-v3 \{ grid-template-columns:1fr;/);
  assert.match(css, /\.relationship-head-v3 > div \{ min-width:0; \}/);
  assert.match(css, /\.relationship-head-v3 > div > span \{[^}]*overflow-wrap:break-word;/);
});

test("atendimentos recarregam em segundo plano sem perder os filtros ativos", async () => {
  const workspace = await read("app/components/RequestsWorkspace.tsx");
  assert.match(workspace, /window\.setInterval\(refresh, 5_000\)/);
  assert.match(workspace, /document\.addEventListener\("visibilitychange", refresh\)/);
  assert.match(workspace, /applyOperationalFilters\(true\)/);
  assert.match(workspace, /Atualização automática ativa/);
});

test("hierarquias novas são modelos de permissões existentes e continuam validadas no servidor", async () => {
  const [workspace, validation] = await Promise.all([
    read("app/components/PeopleWorkspace.tsx"),
    read("app/lib/people-validation.ts"),
  ]);
  for (const title of ["COORDENADOR DE MINISTÉRIO", "SUPERVISOR DE CÉLULAS", "GESTOR DE CUIDADO"]) {
    assert.match(workspace, new RegExp(title));
    assert.match(validation, new RegExp(title));
  }
  assert.match(workspace, /people-permission-groups/);
  assert.match(workspace, /applyHierarchyModel/);
  assert.match(validation, /OFFICIAL_TITLES\.includes/);
});
