import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("a criação de publicação abre em cartão modal", () => {
  const source = read("app/components/CommunityHome.tsx");
  assert.match(source, /community-composer-trigger/);
  assert.match(source, /community-composer-overlay/);
  assert.match(source, /setComposerOpen\(true\)/);
  assert.match(source, /setComposerOpen\(false\)/);
});

test("a ficha do visitante tem fechamento e semântica de diálogo", () => {
  const source = read("app/components/TenantOperations.tsx");
  assert.match(source, /visitor-profile-dialog-header/);
  assert.match(source, /visitor-profile-close/);
  assert.match(source, /role="dialog" aria-modal="true"/);
});

// V147 trocou o campo de uma linha por um textarea que cresce com o texto:
// Enter envia e Shift+Enter quebra linha. O envio compacto permanece.
test("o comentário usa campo que cresce com o texto e envio compacto", () => {
  const source = read("app/components/CommunityPostInteractions.tsx");
  assert.match(source, /<textarea/);
  assert.match(source, /name="texto"/);
  assert.match(source, /community-comment-send-icon/);
  assert.doesNotMatch(source, /<input name="texto"/);
});

test("os estilos preservam modal, feed compacto e largura estável", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /\.community-composer-overlay/);
  assert.match(styles, /\.visitor-workspace-redesign \.operations-list>details\[open\]::before/);
  assert.match(styles, /width:min\(1280px,calc\(100vw - 132px\)\)/);
  assert.match(styles, /\.feed-responsive-image \{ aspect-ratio:16 \/ 7\.4; max-height:360px; \}/);
});
