import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("recepção pública usa cabeçalho compacto, conta e ícones responsivos", async () => {
  const [page, header, mobile, icons, styles] = await Promise.all([
    source("app/page.tsx"),
    source("app/components/PublicHeader.tsx"),
    source("app/components/PublicMobileNav.tsx"),
    source("app/components/PublicIcon.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(page, /landing-status-badge/);
  assert.match(page, /VISUAL DEMONSTRATIVO/);
  assert.match(page, /id="recursos"/);
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
});
