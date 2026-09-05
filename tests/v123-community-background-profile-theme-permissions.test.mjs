import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { tenantRoleHasPermission } from "../app/lib/tenant-policy.mjs";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("fundo comunitário ocupa a área da página e não cria um cartão externo", async () => {
  const [dashboard, home, styles] = await Promise.all([
    source("app/components/PilotDashboard.tsx"),
    source("app/components/CommunityHome.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(dashboard, /pilot-workspace[\s\S]*?has-community-wallpaper/);
  assert.match(dashboard, /--community-wallpaper-image/);
  assert.doesNotMatch(home, /has-community-wallpaper/);
  assert.doesNotMatch(styles, /\.community-home\.has-community-wallpaper/);
  assert.match(styles, /\.pilot-dashboard \.pilot-workspace\.has-community-wallpaper/);
});

test("banner público é exibido inteiro e apresentação respeita margens móveis", async () => {
  const [page, styles] = await Promise.all([
    source("app/comunidades/[slug]/page.tsx"),
    source("app/globals.css"),
  ]);
  const v123 = styles.slice(styles.indexOf("/* V123"));

  assert.match(page, /community\.bannerUrl && \([\s\S]*?<img[^>]*src=\{community\.bannerUrl\}/);
  assert.match(v123, /\.community-profile-cover\.has-image img \{[\s\S]*?object-fit:contain;/);
  assert.match(v123, /\.community-profile-information \{[\s\S]*?width:100%;[\s\S]*?padding:15px;/);
  assert.match(v123, /\.community-profile-information > p,[\s\S]*?overflow-wrap:anywhere;/);
  assert.match(v123, /\.community-profile-information > header > span \{ flex:0 0 auto; \}/);
});

test("líderes, pastores, responsáveis e proprietário recebem permissão de tema", async () => {
  for (const role of ["LIDER", "PASTOR", "ADMIN_COMUNIDADE", "SUPERADMIN"]) {
    assert.equal(tenantRoleHasPermission(role, "community.theme.manage"), true);
  }
  assert.equal(tenantRoleHasPermission("MEMBRO", "community.theme.manage"), false);

  const [tenant, route, dashboard] = await Promise.all([
    source("app/lib/tenant.ts"),
    source("app/api/pilot/community-theme/route.ts"),
    source("app/components/PilotDashboard.tsx"),
  ]);
  assert.match(tenant, /isCommunityOwner \|\| user\.system_owner[\s\S]*?community\.theme\.manage/);
  assert.match(route, /permissions\.includes\([\s\S]*?community\.theme\.manage/);
  assert.match(dashboard, /canManageCommunity=\{active\.permissions\.includes\([\s\S]*?community\.theme\.manage/);
});

test("gestores de tema sem permissão de perfil não alteram dados institucionais", async () => {
  const editor = await source("app/components/CommunityThemeEditor.tsx");

  assert.match(editor, /setCanEditProfile\(Boolean\(communityResult\.canEdit\)\)/);
  assert.match(editor, /if \(canEditProfile\) \{[\s\S]*?fetch\("\/api\/pilot\/comunidades"/);
  assert.match(editor, /\{canEditProfile && \(/);
});
