import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("cabeçalhos públicos, comunitários e do proprietário respondem à direção da rolagem", async () => {
  const [behavior, layout, publicHeader, pilot, owner, styles] = await Promise.all([
    source("app/components/SmartScrollHeader.tsx"),
    source("app/layout.tsx"),
    source("app/components/PublicHeader.tsx"),
    source("app/components/PilotDashboard.tsx"),
    source("app/components/OwnerWorkspace.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(layout, /<SmartScrollHeader \/>/);
  assert.match(publicHeader, /data-smart-scroll-header/);
  assert.match(pilot, /data-smart-scroll-header/);
  assert.match(owner, /data-smart-scroll-header/);
  assert.match(behavior, /delta > 8 && currentY > 110/);
  assert.match(behavior, /delta < -8/);
  assert.match(styles, /\[data-smart-scroll-header\]\[data-scroll-hidden="true"\]/);
});

test("perfil público separa capa, identidade e informações no modo claro", async () => {
  const [page, styles] = await Promise.all([
    source("app/comunidades/[slug]/page.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(page, /community-profile-cover/);
  assert.match(page, /community-profile-identity-v120/);
  assert.match(page, /community-profile-quick-info/);
  assert.doesNotMatch(page, /community-public-hero/);
  assert.match(styles, /html\[data-pilot-theme="claro"\] \.community-profile-shell/);
  assert.match(styles, /\.community-profile-information/);
});
