import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cadastros recolhem informações sem remover dados ou ações", async () => {
  const [workspace, styles] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/globals.css"),
  ]);

  assert.doesNotMatch(workspace, /<details className="visitor-registration-section"/);
  assert.equal((workspace.match(/visitor-registration-form-section/g) || []).length, 4);
  assert.match(workspace, /<form className="pilot-form visitor-registration"/);
  assert.match(workspace, /<details\s+className=\{selectedId === visitor\.id/);
  assert.match(workspace, /className="visitor-card-summary-meta"/);
  assert.match(workspace, /className="visitor-card-collapsible"/);
  assert.match(workspace, /visitor-card-action visitor-whatsapp-link/);
  assert.match(workspace, /visitor-card-action visitor-card-action-primary/);
  assert.match(workspace, /visitor-card-action visitor-card-action-danger/);
  assert.match(styles, /\.visitor-registration-form-section>fieldset\s*\{[^}]*display:grid!important/s);
  assert.match(styles, /\.operations-list>details\[open\] \.visitor-card-chevron/);
});

test("interface de produção não exibe linguagem fictícia", async () => {
  const [workspace, communityPage] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/comunidades/[slug]/page.tsx"),
  ]);

  assert.doesNotMatch(`${workspace}\n${communityPage}`, /fict[ií]ci[oa]/i);
  assert.match(workspace, /Cadastrar novo visitante<\/summary>/);
  assert.match(workspace, /Desativar o cadastro de \$\{visitor\.nome_completo\}/);
});
