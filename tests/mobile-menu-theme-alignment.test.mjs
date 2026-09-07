import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("menu público móvel abre em camada legível acima da recepção", async () => {
  const [header, css] = await Promise.all([
    source("app/components/PublicHeader.tsx"),
    Promise.all([source("app/globals.css"), source("app/interface-fixes.css")]).then((parts) => parts.join("\n")),
  ]);

  assert.match(header, /className="public-account-menu"/);
  assert.match(header, /className="public-account-backdrop"/);
  assert.match(css, /\.public-account-menu\[open\]>\.public-account-backdrop \{/);
  assert.match(css, /\.public-account-popover \{[\s\S]*?position:fixed;[\s\S]*?z-index:200;[\s\S]*?background:var\(--reception-surface\)/);
  assert.match(css, /max-height:calc\(100dvh/);
  assert.match(css, /overscroll-behavior:contain/);
});

test("ícones da biblioteca ministerial formam um grupo centralizado no celular", async () => {
  const [workspace, css] = await Promise.all([
    source("app/components/SecretaryMinisterialWorkspace.tsx"),
    source("app/secretary.css"),
  ]);

  assert.match(workspace, /className="ministry-library-actions"/);
  assert.match(css, /\.ministry-library-actions\{display:flex;align-items:center;justify-content:center/);
  assert.match(css, /\.ministry-library-actions\{width:100%;margin-left:0;justify-content:center\}/);
  assert.match(css, /\.platform-icon\{[^}]*display:inline-flex;align-items:center;justify-content:center/);
  assert.match(css, /\.platform-icon>svg\{[^}]*display:block;flex:0 0 16px;margin:0/);
});

test("troca de tema evita captura da tela e mantém só a resposta curta do ícone", async () => {
  const [control, css] = await Promise.all([
    source("app/components/ThemeControl.tsx"),
    Promise.all([source("app/globals.css"), source("app/interface-fixes.css")]).then((parts) => parts.join("\n")),
  ]);

  assert.doesNotMatch(control, /startViewTransition/);
  assert.match(control, /setTimeout\(resolve, 180\)/);
  assert.match(control, /prefers-reduced-motion: reduce/);
  assert.match(css, /@keyframes vinkulo-theme-glyph-switch/);
  assert.match(css, /animation:vinkulo-theme-glyph-switch \.18s ease-out/);
});
