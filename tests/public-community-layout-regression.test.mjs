import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("cabeçalho público mantém navegação na mesma linha entre 1051 e 1180px", () => {
  assert.match(css, /@media \(min-width: 1051px\) and \(max-width: 1180px\) \{[\s\S]*?\.social-directory \.social-public-header\.reception-header[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto auto;/);
  assert.match(css, /\.reception-header \.reception-primary-nav,[\s\S]*?\.reception-header-actions \{\s*grid-column: auto;\s*grid-row: auto;/);
});

test("busca do diretório não desloca o botão para uma terceira linha no desktop", () => {
  assert.match(css, /\.social-directory \.directory-search-v81 > button \{\s*grid-column: 2;\s*grid-row: 1;/);
});

test("cartão do perfil empilha imagem e conteúdo no tablet estreito", () => {
  assert.match(css, /@media \(min-width: 681px\) and \(max-width: 860px\) \{\s*\.social-directory \.directory-community-profile \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
