import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const secretary = readFileSync("app/components/SecretaryMinisterialWorkspace.tsx", "utf8");
const secretaryCss = readFileSync("app/secretary.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

test("a biblioteca agrupa vários links no mesmo recurso", () => {
  assert.match(secretary, /ReusableSecretaryLinkGroup/);
  assert.match(secretary, /savedGroups\.map/);
  assert.match(secretary, /group\.links\.map/);
  assert.match(secretary, /Adicionar outro link para/);
  assert.match(secretary, /Salvar na biblioteca/);
  assert.match(secretaryCss, /secretary-saved-link-chips/);
});

test("o checklist permite reaproveitar a escala anterior", () => {
  assert.match(secretary, /previousChecklistTemplate/);
  assert.match(secretary, /Usar checklist anterior/);
  assert.match(secretary, /Checklist anterior aplicado/);
  assert.match(secretaryCss, /secretary-checklist-tools/);
});

test("os cartões da página inicial e das escalas têm organização responsiva", () => {
  assert.match(globals, /V225 — coluna inicial organizada/);
  assert.match(globals, /home-needs-you \.home-rail-card-link/);
  assert.match(globals, /grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(secretaryCss, /grid-template-areas:"schedule-heading schedule-summary schedule-people"/);
  assert.match(secretaryCss, /@media\(max-width:760px\)/);
});
