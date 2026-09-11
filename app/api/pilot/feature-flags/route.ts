import { getD1 } from "../../../../db";
import { getPilotFeatureState } from "../../../lib/pilot-data";
import { verifyPassword } from "../../../lib/local-auth";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const NETWORK_FLAGS = [
  "network_module_enabled",
  "affiliate_creation_enabled",
] as const;
const SCOPE_TYPES = new Set([
  "GLOBAL",
  "PLAN",
  "NETWORK",
  "COMMUNITY",
  "PILOT",
]);

export async function GET() {
  const access = await requireTenantPermission("feature_flags.view");
  if ("error" in access) return access.error;
  if (!access.context.isSuperadmin) {
    return Response.json(
      { error: "Somente o superadministrador pode consultar este controle." },
      { status: 403 },
    );
  }
  const db = getD1();
  const [resolved, rules, communities, networks, plans] = await Promise.all([
    getPilotFeatureState(access.context.comunidadeId),
    db
      .prepare(
        `SELECT id, flag_key, scope_type, scope_id, enabled,
          inicia_em, termina_em, alterado_em
         FROM feature_flags
         WHERE flag_key IN ('network_module_enabled','affiliate_creation_enabled')
         ORDER BY CASE scope_type
           WHEN 'COMMUNITY' THEN 0
           WHEN 'NETWORK' THEN 1
           WHEN 'PLAN' THEN 2
           WHEN 'PILOT' THEN 3
           ELSE 4
         END, scope_id`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, nome FROM comunidades
         WHERE status = 'ATIVA' ORDER BY nome`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, nome FROM redes_igrejas
         WHERE status = 'ATIVA' ORDER BY nome`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, nome FROM planos_rede
         WHERE ativo = 1 ORDER BY nome`,
      )
      .all<Record<string, unknown>>(),
  ]);
  return Response.json(
    {
      ...resolved,
      networkControl: {
        rules: rules.results,
        communities: communities.results,
        networks: networks.results,
        plans: plans.results,
        activeCommunityId: access.context.comunidadeId,
        requiresPassword: true,
        requiresConfirmation: "REDES",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("feature_flags.view");
  if ("error" in access) return access.error;
  if (!access.context.isSuperadmin) {
    return Response.json(
      { error: "Somente o superadministrador pode alterar feature flags." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as Record<string, unknown>;
  const enabled = payload.enabled === true;
  const affiliateCreationEnabled =
    enabled && payload.affiliateCreationEnabled === true;
  const scopeType = String(payload.scopeType || "GLOBAL").toUpperCase();
  const confirmation = String(payload.confirmation || "").trim().toUpperCase();
  const reason = String(payload.reason || "").trim().slice(0, 300);
  const password = String(payload.password || "");
  if (!SCOPE_TYPES.has(scopeType)) {
    return badRequest("Escopo de ativação inválido.");
  }
  if (confirmation !== "REDES") {
    return badRequest("Digite REDES para confirmar esta alteração.");
  }
  if (reason.length < 5) {
    return badRequest("Informe o motivo da alteração.");
  }
  if (!password) {
    return badRequest("Confirme sua senha para continuar.");
  }

  const scopeId =
    scopeType === "GLOBAL" ? 0 : Number(payload.scopeId || 0);
  if (!Number.isInteger(scopeId) || scopeId <= 0 && scopeType !== "GLOBAL") {
    return badRequest("Selecione o destino desta ativação.");
  }
  const startsAt = parseDate(payload.startsAt);
  const endsAt = parseDate(payload.endsAt);
  if (payload.startsAt && !startsAt) return badRequest("Data inicial inválida.");
  if (payload.endsAt && !endsAt) return badRequest("Data final inválida.");
  if (scopeType === "PILOT" && (!startsAt || !endsAt)) {
    return badRequest("O período de teste exige início e término.");
  }
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return badRequest("O término precisa ser posterior ao início.");
  }

  const db = getD1();
  const credentials = await db
    .prepare(
      `SELECT senha_hash, senha_salt FROM usuarios
       WHERE id = ? AND ativo = 1 LIMIT 1`,
    )
    .bind(access.user.id)
    .first<{ senha_hash: string | null; senha_salt: string | null }>();
  if (
    !credentials?.senha_hash ||
    !credentials.senha_salt ||
    !(await verifyPassword(password, credentials.senha_salt, credentials.senha_hash))
  ) {
    await recordTenantAudit(
      db,
      access.context,
      access.user.id,
      "FEATURE_FLAG_REDE_REAUTENTICACAO",
      "NEGADO",
      { scopeType, scopeId, enabled },
    );
    return Response.json(
      { error: "Senha inválida. A alteração não foi realizada." },
      { status: 401 },
    );
  }

  if (!(await targetExists(db, scopeType, scopeId))) {
    return Response.json(
      { error: "O destino selecionado não existe ou está inativo." },
      { status: 404 },
    );
  }

  const values: Record<(typeof NETWORK_FLAGS)[number], boolean> = {
    network_module_enabled: enabled,
    affiliate_creation_enabled: affiliateCreationEnabled,
  };
  await db.batch(
    NETWORK_FLAGS.map((flagKey) =>
      db
        .prepare(
          `INSERT INTO feature_flags
           (flag_key, scope_type, scope_id, enabled, inicia_em, termina_em,
            config_json, alterado_por, alterado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(flag_key, scope_type, scope_id) DO UPDATE SET
             enabled = excluded.enabled,
             inicia_em = excluded.inicia_em,
             termina_em = excluded.termina_em,
             config_json = excluded.config_json,
             alterado_por = excluded.alterado_por,
             alterado_em = CURRENT_TIMESTAMP`,
        )
        .bind(
          flagKey,
          scopeType,
          scopeId,
          values[flagKey] ? 1 : 0,
          startsAt,
          endsAt,
          JSON.stringify({
            managed_from: "platform_control",
            reason,
            password_reauthenticated: true,
          }),
          access.user.id,
        ),
    ),
  );
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "FEATURE_FLAG_REDE_ATUALIZADA",
    "SUCESSO",
    {
      scopeType,
      scopeId,
      enabled,
      affiliateCreationEnabled,
      startsAt,
      endsAt,
      reason,
    },
  );
  return Response.json({
    ok: true,
    enabled,
    affiliateCreationEnabled,
    scopeType,
    scopeId,
  });
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function parseDate(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

async function targetExists(
  db: ReturnType<typeof getD1>,
  scopeType: string,
  scopeId: number,
) {
  if (scopeType === "GLOBAL") return scopeId === 0;
  if (scopeType === "COMMUNITY" || scopeType === "PILOT") {
    return Boolean(
      await db
        .prepare("SELECT id FROM comunidades WHERE id = ? AND status = 'ATIVA'")
        .bind(scopeId)
        .first<{ id: number }>(),
    );
  }
  if (scopeType === "NETWORK") {
    return Boolean(
      await db
        .prepare("SELECT id FROM redes_igrejas WHERE id = ? AND status = 'ATIVA'")
        .bind(scopeId)
        .first<{ id: number }>(),
    );
  }
  return Boolean(
    await db
      .prepare("SELECT id FROM planos_rede WHERE id = ? AND ativo = 1")
      .bind(scopeId)
      .first<{ id: number }>(),
  );
}
