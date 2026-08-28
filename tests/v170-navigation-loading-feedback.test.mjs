import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("atalhos de proprietário e comunidade exibem carregamento antes da navegação", () => {
  const link = read("app/components/StableLink.tsx");
  const header = read("app/components/PublicHeader.tsx");
  const mobile = read("app/components/PublicMobileNav.tsx");

  assert.match(link, /showLoading = false/);
  assert.match(link, /global-navigation-loading/);
  assert.match(link, /document\.documentElement\.dataset\.navigationLoading = "true"/);
  assert.match(header, /showLoading[\s\S]*Abrindo a Área do proprietário/);
  assert.match(header, /href="\/painel" showLoading loadingLabel="Abrindo sua comunidade/);
  assert.match(mobile, /showLoading=\{Boolean\(user\)\}/);
});

test("Ajuda fica oculta enquanto uma tela ou navegação está carregando", () => {
  const styles = read("app/globals.css");

  assert.match(styles, /body:has\(\.global-navigation-loading\) > \.global-feedback-launcher/);
  assert.match(styles, /body:has\(\.pilot-loading\[aria-busy="true"\]\) > \.global-feedback-launcher/);
  assert.match(styles, /body:has\(\.pilot-page-loading\) > \.global-feedback-launcher/);
  assert.match(styles, /body:has\(\.pilot-community-switching-v3\) > \.global-feedback-launcher/);
});
