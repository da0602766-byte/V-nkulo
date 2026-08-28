import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("o comentário mostra papel, data relativa e estado de envio", () => {
  const source = read("app/components/CommunityPostInteractions.tsx");
  assert.match(source, /community-comment-role/);
  assert.match(source, /data-highlight=/);
  assert.match(source, /relativeDate\(comment\.criadoEm\)/);
  assert.match(source, /title=\{fullDate\(comment\.criadoEm\)\}/);
  assert.match(source, /data-pending=/);
});

test("o envio é otimista e desfaz o rascunho quando a rede falha", () => {
  const source = read("app/components/CommunityPostInteractions.tsx");
  // O comentário entra na lista antes do POST e só sai se a requisição falhar.
  assert.match(source, /setComments\(\(current\) => \[\.\.\.current, draft\]\)/);
  assert.match(source, /setComments\(\(current\) => current\.filter\(\(item\) => item\.id !== draft\.id\)\)/);
  assert.match(source, /await load\(true\)/);
});

test("o campo envia com Enter e quebra linha com Shift+Enter", () => {
  const source = read("app/components/CommunityPostInteractions.tsx");
  assert.match(source, /event\.key !== "Enter" \|\| event\.shiftKey/);
  assert.match(source, /requestSubmit\(\)/);
  assert.match(source, /FIELD_MAX_HEIGHT/);
});

test("a lista tem skeleton, aria-live e corte por página", () => {
  const source = read("app/components/CommunityPostInteractions.tsx");
  assert.match(source, /community-comments-skeleton/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /community-comments-more/);
  assert.match(source, /comentários anteriores/);
});

test("o erro é renderizado acima do formulário", () => {
  const source = read("app/components/CommunityPostInteractions.tsx");
  const errorAt = source.indexOf("community-comments-error");
  const formAt = source.indexOf("community-comment-form");
  assert.ok(errorAt > -1 && formAt > -1);
  assert.ok(errorAt < formAt, "o alerta de erro deve preceder o formulário");
});

test("os estilos dos comentários vivem em um bloco único e sem !important", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /\.community-comment-form > label:focus-within/);
  assert.match(styles, /\.community-comment-form > button \{/);
  assert.match(styles, /\.community-comments-skeleton/);
  // A regressão corrigida: uma camada posterior anulava o gradiente do botão.
  assert.doesNotMatch(styles, /community-comment[^{}]*\{[^}]*!important/);
  // O campo virou textarea; as regras antigas de input deixaram de existir.
  assert.doesNotMatch(styles, /\.community-comments-panel>form input/);
});
