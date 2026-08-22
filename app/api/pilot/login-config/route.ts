import { getD1 } from "../../../../db";
import {
  getPilotLoginConfig,
  parsePilotLoginConfig,
  PILOT_LOGIN_CONFIG_KEY,
  type PilotLoginConfig,
} from "../../../lib/pilot-login-config";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

export async function GET() {
  return Response.json({ config: await getPilotLoginConfig() });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;
  let body: Partial<PilotLoginConfig>;
  try {
    body = (await request.json()) as Partial<PilotLoginConfig>;
  } catch {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const config = parsePilotLoginConfig(body);
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO configuracoes (chave, valor, atualizado_por)
      VALUES (?, ?, ?)
      ON CONFLICT(chave) DO UPDATE SET
        valor = excluded.valor,
        atualizado_por = excluded.atualizado_por,
        atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(PILOT_LOGIN_CONFIG_KEY, JSON.stringify(config), access.user.email)
    .run();
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "LOGIN_V45_CONFIGURADO",
    "SUCESSO",
    {
      cadastroHabilitado: config.cadastroHabilitado,
      recuperacaoHabilitada: config.recuperacaoHabilitada,
      camposCadastroAtivos: config.signupFields.filter((field) => field.enabled)
        .length,
      logoConfigurada: Boolean(config.logoUrl),
      fundoConfigurado: Boolean(config.backgroundImageUrl),
      redesSociaisConfiguradas: [
        config.facebookUrl,
        config.instagramUrl,
        config.youtubeUrl,
        config.whatsappUrl,
      ].filter(Boolean).length,
    },
  );
  return Response.json({ ok: true, config });
}
