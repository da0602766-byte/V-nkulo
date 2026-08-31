import { getD1 } from "../../../../db";
import {
  getCommunityTheme,
  parseCommunityTheme,
  type CommunityTheme,
} from "../../../lib/community-theme";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const canEdit = access.context.permissions.includes(
    "community.theme.manage",
  );
  const canEditWallpaper = canEdit;
  return Response.json(
    {
      theme: await getCommunityTheme(access.context.comunidadeId),
      canEdit,
      canEditWallpaper,
      communityName: access.context.comunidadeNome,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("community.theme.manage");
  if ("error" in access) return access.error;
  const canEditWallpaper = true;
  const requested = (await request.json()) as Partial<CommunityTheme>;
  const currentTheme = await getCommunityTheme(access.context.comunidadeId);
  const requestedWallpaper = Object.prototype.hasOwnProperty.call(
    requested,
    "wallpaperUrl",
  )
    ? requested.wallpaperUrl
    : currentTheme.wallpaperUrl;
  const theme = parseCommunityTheme({
    ...requested,
    wallpaperUrl: canEditWallpaper
      ? requestedWallpaper
      : currentTheme.wallpaperUrl,
  });
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(chave) DO UPDATE SET
         valor = excluded.valor,
         atualizado_por = excluded.atualizado_por,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(
      `community_theme:${access.context.comunidadeId}`,
      JSON.stringify(theme),
      String(access.user.id),
    )
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "TEMA_DA_COMUNIDADE_ATUALIZADO",
    "SUCESSO",
    {
      comunidadeId: access.context.comunidadeId,
      papelDeParedeAlterado:
        canEditWallpaper && theme.wallpaperUrl !== currentTheme.wallpaperUrl,
    },
  );
  return Response.json({ theme, canEditWallpaper });
}
