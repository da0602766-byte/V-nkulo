import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPilotD1 } from "./helpers/sqlite-d1.mjs";

const read = (path) => readFileSync(path, "utf8");

test("migração preserva a equipe de cada pessoa e permite várias equipes por escala", async () => {
  const { database } = await createPilotD1();
  const tableColumns = database.prepare("PRAGMA table_info('escala_designacoes')").all();
  assert.ok(tableColumns.some((column) => column.name === "equipe_id"));
  const relationColumns = database.prepare("PRAGMA table_info('escala_equipes')").all();
  assert.deepEqual(
    relationColumns.map((column) => column.name),
    [
      "id",
      "comunidade_id",
      "escala_id",
      "equipe_id",
      "funcao",
      "criado_em",
      "atualizado_em",
      "ponto_encontro",
      "horario_encontro",
    ],
  );
  database.close();
});

test("criação, leitura e compartilhamento mantêm a separação por equipe", () => {
  const createRoute = read("app/api/pilot/escalas/route.ts");
  const updateRoute = read("app/api/pilot/escalas/[id]/route.ts");
  const workspace = read("app/components/SecretaryMinisterialWorkspace.tsx");
  const styles = read("app/secretary.css");
  const sharedPage = read("app/escala/[token]/page.tsx");
  const pdfRoute = read("app/api/pilot/escalas/[id]/pdf/route.ts");

  assert.match(createRoute, /INSERT INTO escala_equipes/);
  assert.match(createRoute, /equipe_id, funcao, status, ativo/);
  assert.match(createRoute, /equipes: \(teamsBySchedule\.get/);
  assert.match(updateRoute, /DELETE FROM escala_equipes/);
  assert.match(updateRoute, /Escolha a equipe de origem desta pessoa/);
  assert.match(workspace, /Selecione quantas equipes forem necessárias/);
  assert.match(workspace, /secretary-assignment-team/);
  assert.match(styles, /@media\(min-width:1181px\) and \(max-width:1500px\)/);
  assert.match(styles, /secretary-schedule-card \.secretary-assignment-team>article\{grid-template-columns:38px minmax\(0,1fr\)\}/);
  assert.match(sharedPage, /groupAssignmentsByTeam/);
  assert.match(pdfRoute, /formatAssignmentsByTeam/);
});

test("tema automático escuro preserva as superfícies do painel do proprietário", () => {
  const styles = read("app/globals.css");

  assert.match(
    styles,
    /:is\(html\[data-theme="dark"\],html\[data-pilot-theme="escuro"\]\) :is\(\.owner-grid-toolbar,\.owner-metric-grid article\)/,
  );
  assert.match(
    styles,
    /:is\(html\[data-theme="dark"\],html\[data-pilot-theme="escuro"\]\) :is\(\.owner-page-quick-actions>button,\.owner-insights-grid>article/,
  );
});
