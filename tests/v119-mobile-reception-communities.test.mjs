import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("recepção móvel usa a identidade real e mantém conteúdo fora do banner", async () => {
  const [page, header, styles] = await Promise.all([source("app/page.tsx"), source("app/components/PublicHeader.tsx"), source("app/globals.css")]);
  assert.match(page, /className="landing-banner-stage"/);
  assert.doesNotMatch(page, /landing-banner-brand/);
  assert.match(header, /branding\.logoUrl \|\| "\/adote-symbol\.svg"/);
  assert.match(styles, /\.landing-banner-stage \.landing-top-banner img \{ object-position:86% center; \}/);
  assert.match(styles, /\.landing-product-preview \{ display:none; \}/);
  assert.match(styles, /\.commercial-landing \.landing-hero \{[\s\S]*?background:var\(--reception-bg\)/);
});

test("configuração de categorias permanece rolável e não corta campos", async () => {
  const styles = await source("app/globals.css");
  assert.match(styles, /\.visitor-settings-panel \{[\s\S]*?overflow-y:auto!important/);
  assert.match(styles, /\.visitor-settings \.visitor-category-create\[open\][\s\S]*?overflow:visible!important/);
  assert.match(styles, /\.visitor-settings \.visitor-category-create>form \{[\s\S]*?max-height:none!important/);
});

test("diretório mostra um perfil por vez com rotação acessível", async () => {
  const [page, carousel, styles] = await Promise.all([
    source("app/comunidades/page.tsx"),
    source("app/components/CommunityDirectoryCarousel.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(page, /<CommunityDirectoryCarousel communities=\{communities\}/);
  assert.doesNotMatch(page, /className="community-grid"/);
  assert.match(carousel, /window\.setInterval/);
  assert.match(carousel, /prefers-reduced-motion: reduce/);
  assert.match(carousel, /Pausar/);
  assert.match(styles, /@keyframes directory-profile-arrive/);
  assert.match(styles, /html\[data-pilot-theme="claro"\] \.directory-community-showcase/);
});
