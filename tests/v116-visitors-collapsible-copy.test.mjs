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
  // A ficha do visitante deixou de ser um <details> dentro da lista e virou a
  // gaveta lateral montada em portal. As asserções abaixo miravam o cartão
  // antigo, que desde então vivia atrás de `{false && …}` e nunca chegava à
  // tela — passavam contra código inalcançável. Agora apontam para a superfície
  // que realmente entrega a mesma garantia.
  assert.match(workspace, /selectedVisitor && createPortal\(/);
  assert.match(workspace, /className="visitor-person-cell-v2"/);
  assert.match(workspace, /className="visitor-person-drawer-v2"/);
  assert.match(workspace, /className="visitor-person-actions-v2"/);
  assert.match(workspace, /Marcar integrado/);
  assert.match(workspace, /void deactivateVisitor\(selectedVisitor\)/);
  assert.match(styles, /\.visitor-registration-form-section>fieldset\s*\{[^}]*display:grid!important/s);
  assert.match(styles, /\.operations-list>details\[open\] \.visitor-card-chevron/);
});

test("interface de produção não exibe linguagem fictícia", async () => {
  const [workspace, communityPage] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/comunidades/[slug]/page.tsx"),
  ]);

  assert.doesNotMatch(`${workspace}\n${communityPage}`, /fict[ií]ci[oa]/i);
  assert.match(workspace, /Cadastrar visitante<\/h2>/);
  assert.match(workspace, /Desativar o cadastro de \$\{visitor\.nome_completo\}/);
});
