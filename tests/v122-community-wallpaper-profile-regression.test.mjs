import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("perfil público preserva a área completa das informações rápidas no celular", async () => {
  const styles = await source("app/globals.css");
  const v122 = styles.slice(styles.indexOf("/* V122"));

  assert.match(v122, /\.community-profile-quick-info \{[\s\S]*?grid-area:info;[\s\S]*?width:100%;[\s\S]*?min-width:0;/);
  assert.doesNotMatch(v122, /grid-column:auto/);
  assert.match(v122, /word-break:normal;/);
});

test("tema comunitário persiste um papel de parede separado de logo e banner", async () => {
  const [theme, dashboard] = await Promise.all([
    source("app/lib/community-theme.ts"),
    source("app/components/PilotDashboard.tsx"),
  ]);

  assert.match(theme, /wallpaperUrl: string;/);
  assert.match(theme, /wallpaperUrl: assetUrl\(source\?\.wallpaperUrl\)/);
  assert.match(dashboard, /--community-wallpaper-image/);
  assert.match(dashboard, /pilot-workspace\$\{/);
});

test("papel de parede exige permissão comunitária validada no backend", async () => {
  const [route, editor] = await Promise.all([
    source("app/api/pilot/community-theme/route.ts"),
    source("app/components/CommunityThemeEditor.tsx"),
  ]);

  assert.match(route, /export async function PATCH[\s\S]*requireTenantPermission\("community\.theme\.manage"\)/);
  assert.match(route, /const canEditWallpaper = true;/);
  assert.match(route, /wallpaperUrl: canEditWallpaper[\s\S]*requestedWallpaper[\s\S]*currentTheme\.wallpaperUrl/);
  assert.match(route, /theme: await getCommunityTheme[\s\S]*?canEditWallpaper/);
  assert.match(editor, /\{data\.canEditWallpaper && \(/);
  assert.match(editor, /Papel de parede da página inicial/);
});

test("papel de parede usa imagem intensa no topo e degradê vertical até o fundo", async () => {
  const styles = await source("app/globals.css");
  const v123 = styles.slice(styles.indexOf("/* V123"));

  assert.match(v123, /\.pilot-dashboard \.pilot-workspace\.has-community-wallpaper/);
  assert.match(v123, /to bottom,/);
  assert.match(v123, /var\(--community-wallpaper-image\) center top \/ 100% auto no-repeat/);
  assert.match(v123, /var\(--pilot-bg\) 100%/);
});
