import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("tema é persistido por comunidade, protegido no servidor e aplicado na cascata final", async () => {
  const [route, theme, styles] = await Promise.all([
    read("app/api/pilot/community-theme/route.ts"),
    read("app/lib/community-theme.ts"),
    read("app/globals.css"),
  ]);
  assert.match(route, /requireTenantPermission\("community\.theme\.manage"\)/);
  assert.match(route, /community_theme:\$\{access\.context\.comunidadeId\}/);
  assert.match(theme, /NOITE_CARMESIM/);
  assert.match(styles, /V198 — paleta real por comunidade/);
  assert.match(styles, /--bg: var\(--community-light-bg\)/);
  assert.match(styles, /--bg: var\(--community-dark-bg\)/);
});

test("login informa sucesso ou erro e OAuth do APK devolve JSON real", async () => {
  const [portal, start, integration] = await Promise.all([
    read("app/components/LoginPortal.tsx"),
    read("app/api/auth/google/start/route.ts"),
    read("app/lib/google-integration.ts"),
  ]);
  assert.match(portal, /submit\("\/api\/auth\/login", data\)/);
  assert.match(portal, /Login confirmado\. Abrindo sua conta/);
  assert.match(portal, /Abrindo a Conta Google com segurança/);
  assert.match(start, /androidChannel && url\.searchParams\.get\("format"\) === "json"/);
  assert.match(start, /target\.searchParams\.set\("erro", message\)/);
  assert.doesNotMatch(integration, /state\.purpose === "drive" \? "consent" : "select_account"/);
});

test("imagem de publicação usa Drive e oferece visualizar ou baixar", async () => {
  const [upload, client, image, download] = await Promise.all([
    read("app/api/pilot/uploads/route.ts"),
    read("app/lib/media-upload-client.ts"),
    read("app/components/ResponsiveFeedImage.tsx"),
    read("app/api/pilot/uploads/[...key]/route.ts"),
  ]);
  assert.doesNotMatch(upload, /bucket\.put/);
  assert.match(upload, /storage: "GOOGLE_DRIVE"/);
  assert.match(client, /GOOGLE_DRIVE/);
  assert.match(image, /Visualizar imagem/);
  assert.match(image, /Baixar imagem/);
  assert.match(download, /Content-Disposition/);
});

test("carregamento é portalizado e menu móvel continua acessível com zoom", async () => {
  const [link, dashboard, styles] = await Promise.all([
    read("app/components/StableLink.tsx"),
    read("app/components/PilotDashboard.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(link, /createPortal/);
  assert.match(link, /document\.body/);
  assert.match(dashboard, /menu-movel-google-drive/);
  assert.match(dashboard, /<MenuIcon id="drive"/);
  assert.match(styles, /grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(styles, /\.pilot-mobile-sheet > :not\(header\)[\s\S]*overflow-y: auto/);
});
