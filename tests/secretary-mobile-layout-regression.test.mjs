import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("o resumo do repertório não herda grades genéricas nem comprime o cabeçalho", () => {
  const css = read("app/secretary.css");

  assert.doesNotMatch(css, /\.secretary-link-builder>div\{display:grid/);
  assert.match(css, /\.secretary-link-builder>\.secretary-link-draft\{display:grid/);
  assert.match(css, /\.secretary-link-builder :where\(button\)/);
  assert.match(css, /\.secretary-selected-repertoire>header\{[\s\S]*?width:100%;[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.secretary-selected-repertoire>header span\{white-space:nowrap\}/);
});

test("editar escala fica na área de ações e respeita permissão de gerenciamento", () => {
  const workspace = read("app/components/SecretaryMinisterialWorkspace.tsx");

  assert.match(workspace, /Boolean\(schedule\.can_manage\)[\s\S]*?setEditingSchedule\(schedule\)[\s\S]*?Editar escala/);
  assert.match(workspace, /function EditScheduleDialog/);
  assert.match(workspace, /acao: "ATUALIZAR"/);
  assert.match(workspace, /camposRespostas: schedule\.campos_respostas \|\| \{\}/);
  assert.match(workspace, /Atualize as informações principais e revise o repertório sem alterar as confirmações dos integrantes/);
});

test("as cinco ações móveis mantêm linhas completas e previsíveis", () => {
  const css = read("app/secretary.css");

  assert.match(css, /\.secretary-schedule-actions>\.share\{grid-column:1\/-1\}/);
  assert.match(css, /\.secretary-edit-schedule-footer\{display:grid;grid-template-columns:1fr 1fr/);
});
