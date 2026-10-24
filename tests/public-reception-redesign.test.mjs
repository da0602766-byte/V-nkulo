import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("landing pública usa navegação compacta, tema e ícones responsivos", async () => {
  const [page, experience, header, mobile, icons, styles, landingStyles] = await Promise.all([
    source("app/page.tsx"),
    source("app/components/LandingPageExperience.tsx"),
    source("app/components/PublicHeader.tsx"),
    source("app/components/PublicMobileNav.tsx"),
    source("app/components/PublicIcon.tsx"),
    source("app/globals.css"),
    source("app/landing-vinkulo.css"),
  ]);

  assert.match(page, /LandingPageExperience/);
  assert.match(experience, /className="lp-nav"/);
  // Métricas e depoimentos estáticos não são evidência comercial.
  assert.doesNotMatch(experience, /TESTIMONIALS|1\.200|180K|94%|4\.9★|Mais popular/);
  assert.match(experience, /href="\/planos">Planos/);
  assert.match(experience, /id="recursos"/);
  assert.match(experience, /ThemeControl compact cycle/);
  assert.match(experience, /IntersectionObserver/);
  assert.match(header, /public-search-menu/);
  assert.match(header, /public-account-menu/);
  assert.match(header, /Sair da plataforma/);
  assert.match(header, /global-editor-toolbar-slot/);
  assert.match(mobile, /PublicIcon name="home"/);
  assert.match(mobile, /public-mobile-profile-avatar/);
  assert.match(icons, /strokeLinecap="round"/);
  assert.match(styles, /V8\.2 — recepção pública profissional/);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /html\[data-pilot-theme="escuro"\] \.commercial-landing/);
  assert.match(landingStyles, /@media \(max-width:620px\)/);
});
