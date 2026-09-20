import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reordenação móvel exige pressão, permite arraste e persiste uma única ordem", async () => {
  const workspace = await source("app/components/TenantOperations.tsx");

  assert.match(workspace, /window\.setTimeout\(\(\) => \{/);
  assert.match(workspace, /\}, 320\)/);
  assert.match(workspace, /document\s*\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(workspace, /closest<HTMLElement>\("\[data-category-id\]"\)/);
  assert.match(workspace, /void persistCategoryOrder\(reordered, drag\.previousCategories, drag\.categoryName\)/);
  assert.match(workspace, /onPointerCancel=\{\(event\) => finishCategoryDrag\(event, false\)\}/);
});

test("cartão de visitante mantém dados e ações em uma hierarquia compacta", async () => {
  const [workspace, styles] = await Promise.all([
    source("app/components/TenantOperations.tsx"),
    source("app/globals.css"),
  ]);

  // A ficha do visitante deixou de ser um <details> dentro da lista e virou a
  // gaveta lateral montada em portal. As asserções abaixo miravam o cartão
  // antigo, que desde então vivia atrás de `{false && …}` e nunca chegava à
  // tela — passavam contra código inalcançável. Agora apontam para a superfície
  // que realmente entrega a mesma garantia.
  // Identidade e data de entrada na linha da tabela.
  assert.match(workspace, /className="visitor-person-cell-v2"/);
  assert.match(workspace, /Entrada \{formatDate\(visitor\.data_entrada\)\}/);
  assert.match(workspace, /className="visitor-category-tag-v2"/);
  // Categoria, célula e ministério continuam juntos no resumo da ficha.
  assert.match(workspace, /<dt>Célula<\/dt>/);
  assert.match(workspace, /<dt>Ministério<\/dt>/);
  // As três ações seguem lado a lado, agora no topo da gaveta.
  assert.match(workspace, /className="visitor-person-actions-v2"/);
  assert.match(workspace, /whatsappHref\(selectedVisitor\.telefone\)/);
  assert.match(workspace, /Marcar integrado/);
  assert.match(workspace, /void deactivateVisitor\(selectedVisitor\)/);
  assert.match(styles, /\.visitor-person-cell-v2/);
  assert.match(styles, /\.visitor-person-actions-v2 :is\(a, ?button\)/);
});
