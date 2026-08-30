import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("o acento é o mesmo cobre nos dois temas, na superfície pública e no painel", async () => {
  const styles = await read("app/globals.css");
  const root = styles.slice(0, styles.indexOf('[data-theme="dark"]'));
  assert.match(root, /--violet:\s*#B25A33/i);
  assert.match(styles, /\[data-theme="dark"\][\s\S]{0,400}--violet:\s*#D9784C/i);
  // O painel trocava de matiz entre os temas: dourado no claro, azul no escuro.
  assert.match(styles, /--pilot-purple:\s*#b25a33/i);
  assert.doesNotMatch(styles, /--pilot-purple:\s*#4d9fff/i);
  assert.doesNotMatch(styles, /--pilot-purple:\s*#e0a542/i);
});

test(":root declara cada neutro uma única vez", async () => {
  const styles = await read("app/globals.css");
  const root = styles.slice(styles.indexOf(":root {"), styles.indexOf('[data-theme="dark"]'));
  for (const token of ["--ink", "--muted", "--line"]) {
    const hits = root.match(new RegExp(`^\\s*${token}:`, "gm")) || [];
    assert.equal(hits.length, 1, `${token} declarado ${hits.length}x em :root`);
  }
});

test("a recepção tem tema padrão e o título usa o acento chapado", async () => {
  const styles = await read("app/globals.css");
  assert.match(styles, /\.commercial-landing,\s*\n\.commercial-landing\[data-platform-theme="cobre"\]\s*\{[^}]*--landing-b:#b25a33/i);
  assert.match(
    styles,
    /\.commercial-landing \.landing-hero h1 span \{[^}]*color: var\(--violet\)/,
  );
  assert.doesNotMatch(styles, /landing-hero h1 span \{[^}]*linear-gradient/);
});

test("Cobre é o preset padrão da plataforma e Violeta continua disponível", async () => {
  const branding = await read("app/lib/platform-branding.ts");
  assert.match(branding, /themePreset:\s*"COBRE"/);
  assert.match(branding, /PLATFORM_THEME_PRESETS/);
  for (const preset of ["COBRE", "VIOLETA", "ESMERALDA", "AURORA", "GRAFITE"]) {
    assert.ok(branding.includes(`"${preset}"`), `preset ${preset} sumiu`);
  }
  const workspace = await read("app/components/PlatformBrandingWorkspace.tsx");
  assert.match(workspace, /id: "COBRE", name: "Cobre"/);
});

test("a navegação não usa mais glifos tipográficos como ícone", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  assert.doesNotMatch(dashboard, /symbol:/);
  assert.match(dashboard, /icon: "visitantes" as MenuIconId/);
  assert.match(dashboard, /<MenuIcon id=\{action\.icon\} \/>/);
});

test("as seções do trilho são Dia, Comunidade e Gestão", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  const dia = dashboard.indexOf('label: "Dia"');
  const comunidade = dashboard.indexOf('label: "Comunidade"', dia);
  const gestao = dashboard.indexOf('label: "Gestão"', comunidade);
  assert.ok(dia > 0 && comunidade > dia && gestao > comunidade);
  assert.doesNotMatch(dashboard, /label: "Principal"/);
});

test("Mural e Escalas levam a destinos próprios em vez de repetir a view", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  assert.match(dashboard, /makeItem\("inicio", "Mural", "mural", \{ anchor: "mural" \}\)/);
  assert.match(dashboard, /event: "vinkulo:open-schedules"/);
  assert.match(dashboard, /openView\(item\.id, item\.focus\)/);

  const home = await read("app/components/CommunityHome.tsx");
  assert.match(home, /<header id="mural">/);

  // O ouvinte que só revela a aba depende de poder ver escalas, nunca de ter
  // ministério administrável — isso é requisito de criar.
  const ministries = await read("app/components/MinistriesWorkspace.tsx");
  const reveal = ministries.slice(ministries.indexOf('window.addEventListener("vinkulo:open-schedules"') - 320);
  assert.match(reveal, /if \(!canViewSchedules\) return;/);
  assert.doesNotMatch(
    reveal.slice(0, reveal.indexOf('window.addEventListener("vinkulo:open-schedules"')),
    /manageableMinistries\.length/,
  );
});
