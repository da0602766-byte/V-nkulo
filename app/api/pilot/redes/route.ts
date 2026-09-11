import { getD1 } from "../../../../db";
import { getPilotFeatureState } from "../../../lib/pilot-data";
import {
  parseNetwork,
  parseNetworkCommercial,
  parseNetworkManager,
  parseNetworkPlan,
  parseNetworkUnit,
  parseNetworkUnitUpdate,
} from "../../../lib/network-validation";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import {
  requireTenantPermission,
  type TenantPermissionSuccess,
} from "../../../lib/tenant";

type NetworkAccess =
  | { error: Response }
  | (TenantPermissionSuccess & {
      flags: Awaited<ReturnType<typeof getPilotFeatureState>>;
    });

export async function GET() {
  const access = await requireNetworkAccess("networks.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const superadmin = access.context.isSuperadmin;
  const networkRows = await db
    .prepare(
      `SELECT r.id, r.nome, r.slug, r.comunidade_mae_id, r.plano_id, r.status,
        r.limite_afiliadas, r.valor_futuro_centavos, r.isenta,
        r.teste_inicio, r.teste_fim, r.status_comercial,
        c.nome AS comunidade_mae_nome, p.nome AS plano_nome,
        CASE WHEN ? = 1 OR EXISTS (
          SELECT 1 FROM rede_administradores own
          WHERE own.rede_id = r.id AND own.usuario_id = ?
            AND own.ativo = 1
            AND (own.inicia_em IS NULL OR datetime(own.inicia_em) <= datetime('now'))
            AND (own.termina_em IS NULL OR datetime(own.termina_em) > datetime('now'))
        ) THEN 1 ELSE 0 END AS can_manage
       FROM redes_igrejas r
       JOIN comunidades c ON c.id = r.comunidade_mae_id
       LEFT JOIN planos_rede p ON p.id = r.plano_id
       WHERE ? = 1
          OR EXISTS (
            SELECT 1 FROM rede_administradores own
            WHERE own.rede_id = r.id AND own.usuario_id = ? AND own.ativo = 1
          )
          OR EXISTS (
            SELECT 1 FROM rede_unidades own_unit
            WHERE own_unit.rede_id = r.id AND own_unit.comunidade_id = ?
          )
       ORDER BY r.nome`,
    )
    .bind(
      superadmin ? 1 : 0,
      access.user.id,
      superadmin ? 1 : 0,
      access.user.id,
      access.context.comunidadeId,
    )
    .all<Record<string, unknown> & { id: number }>();
  const networkIds = networkRows.results.map((item) => Number(item.id));
  if (!networkIds.length) {
    const [available, plans] = superadmin
      ? await Promise.all([
          db
            .prepare(
              `SELECT c.id, c.nome FROM comunidades c
               WHERE c.status = 'ATIVA'
                 AND NOT EXISTS (
                   SELECT 1 FROM rede_unidades ru WHERE ru.comunidade_id = c.id
                 )
               ORDER BY c.nome`,
            )
            .all<Record<string, unknown>>(),
          db
            .prepare(
              `SELECT id, nome, slug, limite_afiliadas,
                valor_futuro_centavos, ativo
               FROM planos_rede WHERE ativo = 1 ORDER BY nome`,
            )
            .all<Record<string, unknown>>(),
        ])
      : [
          { results: [] as Record<string, unknown>[] },
          { results: [] as Record<string, unknown>[] },
        ];
    return Response.json({
      ...emptyPayload(access.flags),
      comunidadesDisponiveis: available.results,
      planos: plans.results,
      canManageCommercial: superadmin,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const placeholders = networkIds.map(() => "?").join(",");
  const [units, managers, availableCommunities, availableUsers, plans] =
    await Promise.all([
      db
        .prepare(
          `SELECT ru.id, ru.rede_id, ru.comunidade_id, ru.tipo, ru.regiao,
            ru.status, ru.restricao_nivel, ru.prazo_responsavel,
            c.nome AS comunidade_nome, c.slug AS comunidade_slug,
            responsible.nome AS responsavel_nome,
            interim.nome AS pastor_interino_nome
           FROM rede_unidades ru
           JOIN comunidades c ON c.id = ru.comunidade_id
           LEFT JOIN usuarios responsible ON responsible.id = ru.responsavel_usuario_id
           LEFT JOIN usuarios interim ON interim.id = ru.pastor_interino_usuario_id
           WHERE ru.rede_id IN (${placeholders})
           ORDER BY CASE ru.tipo WHEN 'SEDE' THEN 0
             WHEN 'UNIDADE_REGIONAL' THEN 1 ELSE 2 END,
             ru.regiao, c.nome`,
        )
        .bind(...networkIds)
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT ra.id, ra.rede_id, ra.usuario_id, ra.papel, ra.regiao,
            ra.inicia_em, ra.termina_em, u.nome, u.email
           FROM rede_administradores ra
           JOIN usuarios u ON u.id = ra.usuario_id
           WHERE ra.rede_id IN (${placeholders}) AND ra.ativo = 1
           ORDER BY ra.papel, u.nome`,
        )
        .bind(...networkIds)
        .all<Record<string, unknown>>(),
      superadmin
        ? db
            .prepare(
              `SELECT c.id, c.nome
               FROM comunidades c
               WHERE c.status = 'ATIVA'
                 AND NOT EXISTS (
                   SELECT 1 FROM rede_unidades ru WHERE ru.comunidade_id = c.id
                 )
               ORDER BY c.nome`,
            )
            .all<Record<string, unknown>>()
        : Promise.resolve({ results: [] as Record<string, unknown>[] }),
      db
        .prepare(
          `SELECT DISTINCT u.id, u.nome, uc.comunidade_id
           FROM usuarios u
           JOIN usuario_comunidades uc ON uc.usuario_id = u.id
           JOIN rede_unidades ru ON ru.comunidade_id = uc.comunidade_id
           WHERE ru.rede_id IN (${placeholders})
             AND uc.status = 'ATIVO' AND u.ativo = 1
           ORDER BY u.nome LIMIT 500`,
        )
        .bind(...networkIds)
        .all<Record<string, unknown>>(),
      superadmin
        ? db
            .prepare(
              `SELECT id, nome, slug, limite_afiliadas,
                valor_futuro_centavos, ativo
               FROM planos_rede WHERE ativo = 1 ORDER BY nome`,
            )
            .all<Record<string, unknown>>()
        : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    ]);
  return Response.json(
    {
      redes: networkRows.results,
      unidades: units.results,
      gestores: managers.results,
      comunidadesDisponiveis: availableCommunities.results,
      usuariosDisponiveis: availableUsers.results,
      planos: plans.results,
      canManageCommercial: superadmin,
      flags: access.flags,
      paymentsEnabled: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireNetworkAccess("networks.manage");
  if ("error" in access) return access.error;
  const accessContext = access.context;
  const accessUser = access.user;
  const payload = (await request.json()) as Record<string, unknown>;
  const action = String(payload.action || "").toUpperCase();
  const db = getD1();

  if (action === "CRIAR_REDE") {
    if (!access.context.isSuperadmin) {
      return Response.json(
        { error: "Somente o superadministrador pode criar redes." },
        { status: 403 },
      );
    }
    const parsed = parseNetwork(payload);
    if ("error" in parsed) return badRequest(parsed.error || "Dados inválidos.");
    const community = await activeCommunity(parsed.comunidadeMaeId);
    if (!community) return notFound("Igreja-mãe não encontrada.");
    try {
      const result = await db
        .prepare(
          `INSERT INTO redes_igrejas
           (nome, slug, comunidade_mae_id, criado_por, atualizado_por)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          parsed.nome,
          parsed.slug,
          parsed.comunidadeMaeId,
          access.user.id,
          access.user.id,
        )
        .run();
      const redeId = Number(result.meta.last_row_id);
      await db.batch([
        db
          .prepare(
            `INSERT INTO rede_unidades
             (rede_id, comunidade_id, tipo, status, criado_por)
             VALUES (?, ?, 'SEDE', 'AGUARDANDO_RESPONSAVEL', ?)`,
          )
          .bind(redeId, parsed.comunidadeMaeId, access.user.id),
        db
          .prepare(
            `INSERT INTO rede_administradores
             (rede_id, usuario_id, papel, criado_por)
             VALUES (?, ?, 'NETWORK_OWNER', ?)`,
          )
          .bind(redeId, access.user.id, access.user.id),
      ]);
      await audit("REDE_V45_CRIADA", { redeId, comunidadeMaeId: parsed.comunidadeMaeId });
      return Response.json({ id: redeId }, { status: 201 });
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "A igreja-mãe ou o identificador já pertence a outra rede." },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  if (action === "VINCULAR_UNIDADE") {
    const parsed = parseNetworkUnit(payload);
    if ("error" in parsed) return badRequest(parsed.error || "Dados inválidos.");
    if (!(await canManageNetwork(parsed.redeId))) return forbidden();
    if (
      ["AFILIADA", "CONGREGACAO", "UNIDADE_REGIONAL"].includes(parsed.tipo) &&
      !access.flags.affiliateCreationEnabled
    ) {
      return Response.json(
        {
          error: "Criação de afiliadas desativada pela política comercial.",
          featureFlag: "affiliate_creation_enabled",
        },
        { status: 423 },
      );
    }
    const [community, commercial, count] = await Promise.all([
      activeCommunity(parsed.comunidadeId),
      db
        .prepare(
          `SELECT limite_afiliadas FROM redes_igrejas WHERE id = ?`,
        )
        .bind(parsed.redeId)
        .first<{ limite_afiliadas: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM rede_unidades
           WHERE rede_id = ? AND tipo IN ('AFILIADA','CONGREGACAO','UNIDADE_REGIONAL')`,
        )
        .bind(parsed.redeId)
        .first<{ total: number }>(),
    ]);
    if (!community) return notFound("Comunidade não encontrada.");
    if (
      commercial?.limite_afiliadas &&
      Number(count?.total || 0) >= commercial.limite_afiliadas
    ) {
      return Response.json(
        { error: "O limite comercial de afiliadas foi atingido." },
        { status: 409 },
      );
    }
    try {
      const result = await db
        .prepare(
          `INSERT INTO rede_unidades
           (rede_id, comunidade_id, tipo, regiao, status, criado_por)
           VALUES (?, ?, ?, ?, 'AGUARDANDO_RESPONSAVEL', ?)`,
        )
        .bind(
          parsed.redeId,
          parsed.comunidadeId,
          parsed.tipo,
          parsed.regiao,
          access.user.id,
        )
        .run();
      const unidadeId = Number(result.meta.last_row_id);
      await audit("REDE_V45_UNIDADE_VINCULADA", {
        redeId: parsed.redeId,
        unidadeId,
        comunidadeId: parsed.comunidadeId,
        tipo: parsed.tipo,
      });
      return Response.json({ id: unidadeId }, { status: 201 });
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Esta comunidade já está vinculada a uma rede." },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  if (action === "DEFINIR_RESPONSAVEL") {
    const parsed = parseNetworkUnitUpdate(payload);
    if ("error" in parsed) return badRequest(parsed.error || "Dados inválidos.");
    if (!(await canManageNetwork(parsed.redeId))) return forbidden();
    const unit = await db
      .prepare(
        `SELECT id, comunidade_id FROM rede_unidades
         WHERE id = ? AND rede_id = ?`,
      )
      .bind(parsed.unidadeId, parsed.redeId)
      .first<{ id: number; comunidade_id: number }>();
    if (!unit) return notFound("Unidade não encontrada.");
    for (const userId of [
      parsed.responsavelUsuarioId,
      parsed.pastorInterinoUsuarioId,
    ].filter(Boolean) as number[]) {
      const membership = await db
        .prepare(
          `SELECT id FROM usuario_comunidades
           WHERE usuario_id = ? AND comunidade_id = ? AND status = 'ATIVO'`,
        )
        .bind(userId, unit.comunidade_id)
        .first<{ id: number }>();
      if (!membership) {
        return Response.json(
          { error: "Responsáveis precisam pertencer à unidade selecionada." },
          { status: 409 },
        );
      }
    }
    await db
      .prepare(
        `UPDATE rede_unidades
         SET responsavel_usuario_id = ?, pastor_interino_usuario_id = ?,
           status = ?, restricao_nivel = ?, prazo_responsavel = ?,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND rede_id = ?`,
      )
      .bind(
        parsed.responsavelUsuarioId,
        parsed.pastorInterinoUsuarioId,
        parsed.status,
        parsed.restricaoNivel,
        parsed.prazoResponsavel,
        parsed.unidadeId,
        parsed.redeId,
      )
      .run();
    await audit("REDE_V45_UNIDADE_ATUALIZADA", {
      redeId: parsed.redeId,
      unidadeId: parsed.unidadeId,
      status: parsed.status,
      restricaoNivel: parsed.restricaoNivel,
    });
    return Response.json({ ok: true });
  }

  if (action === "ADICIONAR_GESTOR") {
    const parsed = parseNetworkManager(payload);
    if ("error" in parsed) return badRequest(parsed.error || "Dados inválidos.");
    if (!(await canManageNetwork(parsed.redeId))) return forbidden();
    const eligible = await db
      .prepare(
        `SELECT u.id FROM usuarios u
         JOIN usuario_comunidades uc ON uc.usuario_id = u.id
         JOIN rede_unidades ru ON ru.comunidade_id = uc.comunidade_id
         WHERE u.id = ? AND ru.rede_id = ?
           AND uc.status = 'ATIVO' AND u.ativo = 1
         LIMIT 1`,
      )
      .bind(parsed.usuarioId, parsed.redeId)
      .first<{ id: number }>();
    if (!eligible) {
      return Response.json(
        { error: "O gestor precisa pertencer a uma unidade da rede." },
        { status: 409 },
      );
    }
    await db
      .prepare(
        `INSERT INTO rede_administradores
         (rede_id, usuario_id, papel, regiao, ativo, criado_por)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(rede_id, usuario_id) DO UPDATE SET
           papel = excluded.papel, regiao = excluded.regiao, ativo = 1`,
      )
      .bind(
        parsed.redeId,
        parsed.usuarioId,
        parsed.papel,
        parsed.regiao,
        access.user.id,
      )
      .run();
    await audit("REDE_V45_GESTOR_ADICIONADO", {
      redeId: parsed.redeId,
      usuarioId: parsed.usuarioId,
      papel: parsed.papel,
    });
    return Response.json({ ok: true });
  }

  if (action === "ATUALIZAR_COMERCIAL") {
    if (!access.context.isSuperadmin) return forbidden();
    const parsed = parseNetworkCommercial(payload);
    if ("error" in parsed) return badRequest(parsed.error || "Dados inválidos.");
    await db
      .prepare(
        `UPDATE redes_igrejas
         SET plano_id = ?, limite_afiliadas = ?, valor_futuro_centavos = ?, isenta = ?,
           teste_inicio = ?, teste_fim = ?, status_comercial = ?,
           atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        parsed.planoId,
        parsed.limiteAfiliadas,
        parsed.valorFuturoCentavos,
        parsed.isenta ? 1 : 0,
        parsed.testeInicio,
        parsed.testeFim,
        parsed.statusComercial,
        access.user.id,
        parsed.redeId,
      )
      .run();
    await audit("REDE_V45_COMERCIAL_PREPARADO", {
      redeId: parsed.redeId,
      limiteAfiliadas: parsed.limiteAfiliadas,
      statusComercial: parsed.statusComercial,
      cobrancaExecutada: false,
    });
    return Response.json({ ok: true, paymentProcessed: false });
  }

  if (action === "SALVAR_PLANO") {
    if (!access.context.isSuperadmin) return forbidden();
    const parsed = parseNetworkPlan(payload);
    if ("error" in parsed) return badRequest(parsed.error || "Dados inválidos.");
    try {
      const result = await db
        .prepare(
          `INSERT INTO planos_rede
           (nome, slug, limite_afiliadas, valor_futuro_centavos, ativo)
           VALUES (?, ?, ?, ?, 1)`,
        )
        .bind(
          parsed.nome,
          parsed.slug,
          parsed.limiteAfiliadas,
          parsed.valorFuturoCentavos,
        )
        .run();
      await audit("REDE_V45_PLANO_CRIADO", {
        planoId: Number(result.meta.last_row_id),
        limiteAfiliadas: parsed.limiteAfiliadas,
        cobrancaExecutada: false,
      });
      return Response.json(
        { id: Number(result.meta.last_row_id), paymentProcessed: false },
        { status: 201 },
      );
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        return Response.json(
          { error: "Já existe um plano com esse identificador." },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  return badRequest("Ação inválida.");

  async function canManageNetwork(redeId: number) {
    if (accessContext.isSuperadmin) return true;
    const manager = await db
      .prepare(
        `SELECT id FROM rede_administradores
         WHERE rede_id = ? AND usuario_id = ? AND ativo = 1
           AND papel IN ('NETWORK_OWNER','NETWORK_PRESIDENT','NETWORK_ADMIN','REGIONAL_SUPERVISOR')
           AND (inicia_em IS NULL OR datetime(inicia_em) <= datetime('now'))
           AND (termina_em IS NULL OR datetime(termina_em) > datetime('now'))
         LIMIT 1`,
      )
      .bind(redeId, accessUser.id)
      .first<{ id: number }>();
    return Boolean(manager);
  }

  async function activeCommunity(comunidadeId: number) {
    return db
      .prepare("SELECT id FROM comunidades WHERE id = ? AND status = 'ATIVA'")
      .bind(comunidadeId)
      .first<{ id: number }>();
  }

  async function audit(
    event: string,
    metadata: Record<string, unknown>,
  ) {
    return recordTenantAudit(
      db,
      accessContext,
      accessUser.id,
      event,
      "SUCESSO",
      metadata,
    );
  }
}

async function requireNetworkAccess(permission: string): Promise<NetworkAccess> {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access;
  const flags = await getPilotFeatureState(access.context.comunidadeId);
  if (!flags.networkModuleEnabled) {
    return {
      error: Response.json(
        {
          error: "Módulo de redes e afiliadas desativado.",
          featureFlag: "network_module_enabled",
        },
        { status: 404 },
      ),
    } as const;
  }
  if (!access.context.permissions.includes(permission)) {
    return {
      error: Response.json(
        { error: "Você não possui permissão para esta ação." },
        { status: 403 },
      ),
    } as const;
  }
  return {
    user: access.user,
    context: access.context,
    memberships: access.memberships,
    flags,
  };
}

function emptyPayload(flags: Awaited<ReturnType<typeof getPilotFeatureState>>) {
  return {
    redes: [],
    unidades: [],
    gestores: [],
    comunidadesDisponiveis: [],
    usuariosDisponiveis: [],
    planos: [],
    canManageCommercial: false,
    flags,
    paymentsEnabled: false,
  };
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function notFound(error: string) {
  return Response.json({ error }, { status: 404 });
}

function forbidden() {
  return Response.json(
    { error: "Você não pode administrar esta rede." },
    { status: 403 },
  );
}
