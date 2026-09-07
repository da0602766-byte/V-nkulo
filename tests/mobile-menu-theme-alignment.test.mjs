import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("menu público móvel abre em camada legível acima da recepção", async () => {
  const [header, css] = await Promise.all([
    source("app/components/PublicHeader.tsx"),
    source("app/globals.css"),
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
  assert.match(css, /\.platform-icon\{[\s\S]*?display:grid;place-items:center/);
});

test("troca de tema usa revelação circular e respeita movimento reduzido", async () => {
  const [control, css] = await Promise.all([
    source("app/components/ThemeControl.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(control, /startViewTransition/);
  assert.match(control, /circle\(0px at \$\{x\}px \$\{y\}px\)/);
  assert.match(control, /pseudoElement: "::view-transition-new\(root\)"/);
  assert.match(control, /prefers-reduced-motion: reduce/);
  assert.match(css, /::view-transition-old\(root\),::view-transition-new\(root\)/);
  assert.match(css, /@keyframes vinkulo-theme-glyph-switch/);
});
