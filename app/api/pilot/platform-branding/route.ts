import { getD1 } from "../../../../db";
import {
  getPlatformBranding,
  parsePlatformBranding,
} from "../../../lib/platform-branding";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;
  return Response.json(
    { branding: await getPlatformBranding() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;
  if (!access.user.system_owner) {
    return Response.json(
      { error: "Somente o proprietário pode alterar a marca global." },
      { status: 403 },
    );
  }
  const branding = parsePlatformBranding(await request.json());
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
       VALUES ('platform_branding', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
         atualizado_por = excluded.atualizado_por,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(JSON.stringify(branding), String(access.user.id))
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "IDENTIDADE_GLOBAL_ATUALIZADA",
    "SUCESSO",
    {
      nome: branding.siteName,
      logoConfigurada: Boolean(branding.logoUrl),
      bannerConfigurado: Boolean(branding.feedBannerUrl),
      tema: branding.themePreset,
    },
  );
  return Response.json({ branding });
}
