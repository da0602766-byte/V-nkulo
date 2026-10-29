import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("landing móvel usa a identidade real e mantém a página sem overflow", async () => {
  const [page, landing, header, styles, landingStyles] = await Promise.all([source("app/page.tsx"), source("app/components/LandingPageExperience.tsx"), source("app/components/PublicHeader.tsx"), source("app/globals.css"), source("app/landing-vinkulo.css")]);
  assert.match(page, /LandingPageExperience/);
  assert.match(landing, /className="lp-brand"/);
  assert.match(landing, /className="lp-hero"/);
  assert.match(header, /<VinkuloMark logoUrl=\{branding\.logoUrl\}/);
  const mark = await source("app/components/VinkuloMark.tsx");
  assert.match(mark, /src=\{VINKULO_LOGO\}/);
  assert.match(mark, /objectFit: "contain"/);
  assert.match(landingStyles, /overflow-x:clip/);
  assert.match(landingStyles, /@media \(max-width:620px\)/);
  assert.match(styles, /overflow-x:clip/);
});

test("configuração de categorias permanece rolável e não corta campos", async () => {
  const styles = await source("app/components/visitors/visitors-page.css");
  const categories = await source("app/components/visitors/Categories.tsx");
  assert.match(categories, /editing&&<Dialog/);
  assert.match(styles, /\.vp-dialog\{[^}]*max-height:calc\(100dvh - 32px\)[^}]*overflow:auto/);
  assert.match(styles, /\.vp-dialog,\.vp-dialog-wide\{[^}]*width:calc\(100% - 16px\)[^}]*max-height:calc\(100dvh - 16px\)/);
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
