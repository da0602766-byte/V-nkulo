import { getD1 } from "../../../../db";
import {
  mergeVisualConfigs as mergeConfigs,
  parseGlobalVisualConfig,
} from "../../../lib/global-visual-editor";
import { getSessionUser } from "../../../lib/local-auth";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const PLATFORM_KEY = "visual_editor_platform_v1";

type StoredRow = { configuracao: string };

function parseJson(value?: string | null) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function readLayout(
  db: ReturnType<typeof getD1>,
  communityId: number,
  scope: string,
) {
  const row = await db
    .prepare(
      `SELECT configuracao FROM layouts_interface
       WHERE comunidade_id = ? AND escopo = ?`,
    )
    .bind(communityId, scope)
    .first<StoredRow>();
  return row
    ? parseGlobalVisualConfig(parseJson(row.configuracao))
    : null;
}

export async function GET(request: Request) {
  const audience = new URL(request.url).searchParams.get("audience") || "PERSONAL";
  if (!["PERSONAL", "COMMUNITY", "PLATFORM"].includes(audience)) {
    return Response.json({ error: "Público inválido." }, { status: 400 });
  }
  const publicSurface =
    new URL(request.url).searchParams.get("surface") === "public";
  const db = getD1();
  const platformRow = await db
    .prepare("SELECT valor FROM configuracoes WHERE chave = ?")
    .bind(PLATFORM_KEY)
    .first<{ valor: string }>();
  const platform = platformRow
    ? parseGlobalVisualConfig(parseJson(platformRow.valor))
    : null;
  if (publicSurface) {
    const user = await getSessionUser();
    const canEdit = Boolean(user?.system_owner);
    return Response.json({
      config: mergeConfigs(platform),
      canEdit,
      canSavePlatform: canEdit,
      layers: {
        platform: Boolean(platform),
        community: false,
        personal: false,
      },
    });
  }
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const community = await readLayout(
    db,
    access.context.comunidadeId,
    "visual:community",
  );
  const personal = await readLayout(
    db,
    access.context.comunidadeId,
    `visual:user:${access.user.id}`,
  );
  return Response.json({
    config: mergeConfigs(platform, audience === "PLATFORM" ? null : community, audience === "PERSONAL" ? personal : null),
    canEdit:
      access.context.isOwner &&
      access.context.communityAccess === "OWNER",
    canSavePlatform:
      access.context.isOwner &&
      access.context.isSuperadmin &&
      access.context.communityAccess === "OWNER",
    layers: {
      platform: Boolean(platform),
      community: Boolean(community),
      personal: Boolean(personal),
    },
  });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  let body: { scope?: string; config?: unknown; surface?: string };
  try {
    body = (await request.json()) as {
      scope?: string;
      config?: unknown;
      surface?: string;
    };
  } catch {
    return Response.json({ error: "Configuração inválida." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !body.config || typeof body.config !== "object" || Array.isArray(body.config)) {
    return Response.json({ error: "Configuração inválida." }, { status: 400 });
  }
  const publicSurface = body.surface === "public";
  if (
    !access.context.isOwner ||
    (!publicSurface && access.context.communityAccess !== "OWNER")
  ) {
    return Response.json(
      { error: "Somente o proprietário desta comunidade pode editar o visual." },
      { status: 403 },
    );
  }
  const scope = String(body.scope || "");
  if (!["PERSONAL", "COMMUNITY", "PLATFORM"].includes(scope)) {
    return Response.json({ error: "Escopo inválido." }, { status: 400 });
  }
  if (
    (scope === "PLATFORM" || publicSurface) &&
    (!access.context.isSuperadmin || !access.context.isOwner)
  ) {
    return Response.json(
      { error: "Somente o proprietário da plataforma pode salvar globalmente." },
      { status: 403 },
    );
  }
  if (publicSurface && scope !== "PLATFORM") {
    return Response.json(
      { error: "A área pública deve ser salva no visual da plataforma." },
      { status: 400 },
    );
  }
  const config = parseGlobalVisualConfig(body.config);
  const serialized = JSON.stringify(config);
  const db = getD1();
  if (scope === "PLATFORM") {
    await db
      .prepare(
        `INSERT INTO configuracoes (chave, valor, atualizado_por)
         VALUES (?, ?, ?)
         ON CONFLICT(chave) DO UPDATE SET
           valor = excluded.valor,
           atualizado_por = excluded.atualizado_por,
           atualizado_em = CURRENT_TIMESTAMP`,
      )
      .bind(PLATFORM_KEY, serialized, access.user.email)
      .run();
  } else {
    const editorScope =
      scope === "COMMUNITY"
        ? "visual:community"
        : `visual:user:${access.user.id}`;
    const type = scope === "COMMUNITY" ? "COMUNIDADE" : "PESSOAL";
    await db
      .prepare(
        `INSERT INTO layouts_interface
         (comunidade_id, usuario_id, escopo, tipo, nome, configuracao, atualizado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(comunidade_id, escopo) DO UPDATE SET
           configuracao = excluded.configuracao,
           versao = layouts_interface.versao + 1,
           atualizado_por = excluded.atualizado_por,
           atualizado_em = CURRENT_TIMESTAMP`,
      )
      .bind(
        access.context.comunidadeId,
        scope === "PERSONAL" ? access.user.id : null,
        editorScope,
        type,
        scope === "PERSONAL" ? "Meu layout visual" : "Visual da comunidade",
        serialized,
        access.user.id,
      )
      .run();
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "EDITOR_VISUAL_GLOBAL_SALVO",
    "SUCESSO",
    {
      scope,
      surface: publicSurface ? "PUBLIC" : "PANEL",
      regras: Object.keys(config.rules).length,
      caixasTexto: config.textBoxes.length,
    },
  );
  return Response.json({ ok: true, config, scope });
}
