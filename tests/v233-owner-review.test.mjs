import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("revisão ministerial alinha substituto e centraliza o formulário da escala", async () => {
  const css = await read("app/secretary.css");
  assert.match(
    css,
    /"schedule-replacement schedule-replacement schedule-actions"/,
  );
  assert.match(
    css,
    /\.secretary-create-schedule \.secretary-form-grid\{[\s\S]*?width:min\(1040px,100%\);[\s\S]*?margin-inline:auto/,
  );
  assert.match(css, /\.secretary-replacement-form>strong\{white-space:nowrap\}/);
});

test("editor mostra a prévia e permite ajustar o repertório linha a linha", async () => {
  const workspace = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  assert.match(workspace, /const \[repertoireValue, setRepertoireValue\]/);
  assert.match(workspace, /Repertório atual/);
  assert.match(workspace, /Ajustar repertório/);
  assert.match(workspace, /value=\{repertoireValue\}/);
  assert.match(workspace, /setRepertoireValue\(event\.target\.value\)/);
});

test("intensidade do vidro também controla cartões com paleta comunitária", async () => {
  const css = await read("app/globals.css");
  const matches = css.match(
    /--surface: color-mix\(in srgb, var\(--community-(?:light|dark)-surface\) calc\(var\(--vinkulo-glass-alpha\) \* 100%\), transparent\);/g,
  );
  assert.equal(matches?.length, 2);
  assert.match(css, /--pilot-surface: var\(--surface\)/);
});

test("histórico aceita retenção de 1 a 30 dias sem apagar acessos ativos", async () => {
  const [route, workspace] = await Promise.all([
    read("app/api/pilot/escalas/[id]/acessos/route.ts"),
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
  ]);
  assert.match(route, /MIN_HISTORY_RETENTION_DAYS = 1/);
  assert.match(route, /MAX_HISTORY_RETENTION_DAYS = 30/);
  assert.match(route, /status IN \('EXPIRADO','CANCELADO','NEGADO'\)/);
  const cleanupQuery = route.match(
    /DELETE FROM acessos_temporarios[\s\S]*?datetime\('now', \?\)/,
  )?.[0];
  assert.ok(cleanupQuery);
  assert.doesNotMatch(cleanupQuery, /ATIVO/);
  assert.match(route, /temporary_access_history_retention:/);
  assert.match(workspace, /min="1" max="30"/);
  assert.match(workspace, /Acessos ativos nunca entram na exclusão automática/);
});
