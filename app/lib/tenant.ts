import { cookies } from "next/headers";
import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";
import type { AppUser } from "./access";
import {
  normalizeTenantRole,
  normalizeOfficialPermissions,
  permissionsForTenantRole,
} from "./tenant-policy.mjs";
import { getSessionUser } from "./local-auth";
import {
  getTemporaryAccessByToken,
  TEMPORARY_ACCESS_COOKIE,
  temporaryResourcePermissions,
  type TemporaryAccessResource,
} from "./temporary-access";
import {
  COMMUNITY_MODULES,
  filterPermissionsForCommunityModules,
  normalizeCommunityModules,
  type CommunityModuleKey,
} from "./community-modules";

const ACTIVE_COMMUNITY_COOKIE = "__Host-vinkulo_community";
const ACTIVE_COMMUNITY_TTL_SECONDS = 12 * 60 * 60;

export type TenantMembership = {
  membershipId: number;
  comunidadeId: number;
  comunidadeNome: string;
  comunidadeSlug: string;
  papel: string;
  status: string;
  ambienteDemo: boolean;
  oficial: boolean;
  tituloOficial: string;
  customPermissions: string[];
  isCommunityOwner: boolean;
  communityAccess: "OWNER" | "MEMBER" | "FEED_ONLY";
};

export type TenantContext = {
  userId: number;
  membershipId: number;
  comunidadeId: number;
  comunidadeNome: string;
  comunidadeSlug: string;
  papel: string;
  permissions: string[];
  modules: CommunityModuleKey[];
  isSuperadmin: boolean;
  isOwner: boolean;
  isCommunityOwner: boolean;
  communityAccess: "OWNER" | "MEMBER" | "FEED_ONLY";
  ambienteDemo: boolean;
  temporaryAccess?: {
    id: number;
    resource: TemporaryAccessResource;
    startsAt: string;
    endsAt: string;
  } | null;
};

type MembershipRow = {
  membership_id: number;
  comunidade_id: number;
  comunidade_nome: string;
  comunidade_slug: string;
  papel: string;
  status: string;
  ambiente_demo: number;
  oficial: number;
  titulo_oficial: string;
  permissoes: string;
  proprietario_usuario_id: number | null;
};

type CommunityCookiePayload = {
  membershipId: number;
  expiresAt: number;
};

export async function listTenantMemberships(
  user: Pick<AppUser, "id" | "perfil" | "system_owner">,
): Promise<TenantMembership[]> {
  const statement = user.system_owner
    ? getD1().prepare(
        `SELECT COALESCE(uc.id, 900000000 + c.id) AS membership_id,
        c.id AS comunidade_id, c.nome AS comunidade_nome,
        c.slug AS comunidade_slug,
        'SUPERADMIN' AS papel,
        'ATIVO' AS status, c.ambiente_demo,
        c.proprietario_usuario_id,
        CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial,
        COALESCE(oc.titulo, '') AS titulo_oficial,
        COALESCE(oc.permissoes, '') AS permissoes
        FROM comunidades c
        LEFT JOIN usuario_comunidades uc
          ON uc.comunidade_id = c.id
         AND uc.usuario_id = ?
         AND uc.status = 'ATIVO'
        LEFT JOIN oficiais_comunidade oc
          ON oc.usuario_comunidade_id = uc.id
        WHERE c.status = 'ATIVA'
        ORDER BY c.nome`,
      )
    : getD1().prepare(
        `SELECT uc.id AS membership_id, uc.comunidade_id, c.nome AS comunidade_nome,
      c.slug AS comunidade_slug, uc.papel, uc.status, c.ambiente_demo,
      c.proprietario_usuario_id,
      CASE WHEN oc.id IS NULL THEN 0 ELSE 1 END AS oficial,
      COALESCE(oc.titulo, '') AS titulo_oficial,
      COALESCE(oc.permissoes, '') AS permissoes
      FROM usuario_comunidades uc
      JOIN comunidades c ON c.id = uc.comunidade_id
      LEFT JOIN oficiais_comunidade oc
        ON oc.usuario_comunidade_id = uc.id
      WHERE uc.usuario_id = ? AND uc.status = 'ATIVO' AND c.status = 'ATIVA'
      ORDER BY c.nome`,
      );
  const result = user.system_owner
    ? await statement.bind(user.id).all<MembershipRow>()
    : await statement.bind(user.id).all<MembershipRow>();

  return result.results.map((row) => ({
    membershipId: Number(row.membership_id),
    comunidadeId: Number(row.comunidade_id),
    comunidadeNome: row.comunidade_nome,
    comunidadeSlug: row.comunidade_slug,
    papel: user.system_owner
      ? normalizeTenantRole(row.papel)
      : user.perfil === "ADMIN"
        ? "SUPERADMIN"
        : normalizeTenantRole(row.papel),
    status: row.status,
    ambienteDemo: Boolean(row.ambiente_demo),
    oficial: Boolean(row.oficial),
    tituloOficial: row.titulo_oficial || "",
    customPermissions: Boolean(row.oficial)
      ? normalizeOfficialPermissions(row.permissoes)
      : [],
    isCommunityOwner:
      Number(row.proprietario_usuario_id) === Number(user.id),
    communityAccess: user.system_owner ? "OWNER" : "MEMBER",
  }));
}

export async function getActiveTenantContext(
  user: Pick<AppUser, "id" | "perfil" | "system_owner">,
): Promise<{ context: TenantContext | null; memberships: TenantMembership[] }> {
  const memberships = await listTenantMemberships(user);
  if (!memberships.length) return { context: null, memberships };

  const jar = await cookies();
  const selected = await readCommunityCookie(
    jar.get(ACTIVE_COMMUNITY_COOKIE)?.value,
  );
  const membership =
    memberships.find((item) => item.membershipId === selected?.membershipId) ??
    memberships[0];
  const papel =
    user.system_owner || user.perfil === "ADMIN"
      ? "SUPERADMIN"
      : normalizeTenantRole(membership.papel);
  let permissions = permissionsForTenantRole(papel);
  const isCommunityOwner = membership.isCommunityOwner;
  const continuityPermissions = new Set([
    "community.lifecycle.request",
    "community.lifecycle.review",
  ]);
  permissions = permissions.filter(
    (permission) => !continuityPermissions.has(permission),
  );
  let temporaryAccess: TenantContext["temporaryAccess"] = null;
  if (membership.communityAccess !== "FEED_ONLY") {
    for (const permission of membership.customPermissions) {
      if (!permissions.includes(permission)) permissions.push(permission);
    }
    const diaconiaPermissions = await getDiaconiaPermissions(
      user.id,
      membership.comunidadeId,
    );
    for (const permission of diaconiaPermissions) {
      if (!permissions.includes(permission)) permissions.push(permission);
    }
    const networkPermissions = await getNetworkPermissions(
      user.id,
      membership.comunidadeId,
    );
    for (const permission of networkPermissions) {
      if (!permissions.includes(permission)) permissions.push(permission);
    }
    const parkingAssignment = await getActiveParkingAssignment(
      user.id,
      membership.comunidadeId,
    );
    if (parkingAssignment) {
      for (const permission of [
        "parking.view",
        "parking.entry",
        "parking.exit",
        "parking.edit",
        "parking.helpers.manage",
      ]) {
        if (!permissions.includes(permission)) permissions.push(permission);
      }
    }
    const temporaryToken = jar.get(TEMPORARY_ACCESS_COOKIE)?.value;
    const cookieGrant = temporaryToken
      ? await getTemporaryAccessByToken(getD1(), temporaryToken)
      : null;
    const temporaryGrant =
      cookieGrant?.status === "ATIVO" &&
      Number(cookieGrant.beneficiario_usuario_id) === Number(user.id) &&
      Number(cookieGrant.comunidade_id) === Number(membership.comunidadeId)
        ? cookieGrant
        : null;
    if (temporaryGrant) {
      const grantedPermissions = temporaryResourcePermissions(
        temporaryGrant.recurso,
      );
      const grantsAdditionalAccess = grantedPermissions.some(
        (permission) => !permissions.includes(permission),
      );
      for (const permission of grantedPermissions) {
        if (!permissions.includes(permission)) permissions.push(permission);
      }
      // A contagem regressiva só controla sessões que realmente dependem da
      // autorização temporária. Um gestor que já possui a permissão normal não
      // deve ser expulso do Compartilhar quando um cookie antigo expirar.
      if (grantsAdditionalAccess) {
        temporaryAccess = {
          id: temporaryGrant.id,
          resource: temporaryGrant.recurso,
          startsAt: temporaryGrant.inicia_em,
          endsAt: temporaryGrant.termina_em,
        };
      }
    } else if (
      cookieGrant &&
      Number(cookieGrant.beneficiario_usuario_id) === Number(user.id) &&
      Number(cookieGrant.comunidade_id) === Number(membership.comunidadeId) &&
      cookieGrant.ativado_em &&
      normalizeTenantRole(papel) === "MEMBRO"
    ) {
      // Se a autorização usada por um membro foi cancelada ou expirou, ela
      // prevalece sobre a liberação operacional derivada da própria escala.
      // Assim uma aba já aberta deixa de operar na próxima requisição.
      const revoked = new Set(temporaryResourcePermissions(cookieGrant.recurso));
      permissions = permissions.filter((permission) => !revoked.has(permission));
    }
  }

  // Permissões personalizadas, ministeriais ou temporárias nunca podem
  // transformar um cargo em dono da comunidade. Reaplicamos a política após
  // todas as extensões de escopo para que a autorização dependa somente do
  // proprietário cadastrado ou da supervisão global protegida.
  permissions = permissions.filter(
    (permission) => !continuityPermissions.has(permission),
  );
  if (isCommunityOwner || user.system_owner) {
    permissions.push("community.lifecycle.request");
    if (!permissions.includes("community.theme.manage")) {
      permissions.push("community.theme.manage");
    }
  }
  if (user.system_owner) {
    permissions.push("community.lifecycle.review");
  }

  const modules = await getCommunityModules(membership.comunidadeId);
  permissions = filterPermissionsForCommunityModules(permissions, modules);

  return {
    memberships,
    context: {
      userId: user.id,
      membershipId: membership.membershipId,
      comunidadeId: membership.comunidadeId,
      comunidadeNome: membership.comunidadeNome,
      comunidadeSlug: membership.comunidadeSlug,
      papel,
      permissions,
      modules,
      isSuperadmin:
        papel === "SUPERADMIN" || Boolean(user.system_owner),
      isOwner: Boolean(user.system_owner),
      isCommunityOwner,
      communityAccess: membership.communityAccess,
      ambienteDemo: membership.ambienteDemo,
      temporaryAccess,
    },
  };
}

async function getCommunityModules(
  comunidadeId: number,
): Promise<CommunityModuleKey[]> {
  const row = await getD1()
    .prepare(
      "SELECT valor FROM configuracoes WHERE chave = 'community_modules:' || ? LIMIT 1",
    )
    .bind(comunidadeId)
    .first<{ valor: string }>();
  if (!row?.valor) {
    return COMMUNITY_MODULES.map((module) => module.key);
  }
  try {
    return normalizeCommunityModules(JSON.parse(row.valor), []);
  } catch {
    return COMMUNITY_MODULES.map((module) => module.key);
  }
}

async function getDiaconiaPermissions(
  userId: number,
  comunidadeId: number,
): Promise<string[]> {
  const assignment = await getD1()
    .prepare(
      `SELECT
        MAX(CASE WHEN mv.papel = 'LIDER' THEN 1 ELSE 0 END) AS lider,
        COUNT(*) AS total
      FROM ministerio_voluntarios mv
      JOIN ministerios_comunidade m
        ON m.id = mv.ministerio_id
       AND m.comunidade_id = mv.comunidade_id
      WHERE mv.usuario_id = ? AND mv.comunidade_id = ?
        AND mv.ativo = 1 AND m.status = 'ATIVO'`,
    )
    .bind(userId, comunidadeId)
    .first<{ lider: number; total: number }>();
  if (!assignment || Number(assignment.total) <= 0) return [];
  const permissions = ["diaconia.view", "diaconia.checklist.update"];
  if (Number(assignment.lider) === 1) {
    permissions.push("diaconia.manage", "diaconia.report");
  }
  return permissions;
}

export async function requireTenantPermission(permission: string) {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: Response.json(
        { error: "Faça login para continuar." },
        { status: 401 },
      ),
    } as const;
  }
  if (!user.ativo) {
    return {
      error: Response.json({ error: "Usuário inativo." }, { status: 403 }),
    } as const;
  }
  const tenant = await getActiveTenantContext(user);
  if (!tenant.context) {
    return {
      error: Response.json(
        { error: "Nenhum vínculo ativo com comunidade foi encontrado." },
        { status: 403 },
      ),
    } as const;
  }
  if (!tenant.context.permissions.includes(permission)) {
    return {
      error: Response.json(
        { error: "Você não possui permissão para esta ação." },
        { status: 403 },
      ),
    } as const;
  }
  return { user, ...tenant } as const;
}

export async function getActiveParkingAssignment(
  userId: number,
  comunidadeId: number,
) {
  const assignment = await getD1()
    .prepare(
      `SELECT d.id, d.escala_id, s.ministerio_id, s.titulo,
        s.inicia_em, s.termina_em, d.funcao
      FROM escala_designacoes d
      JOIN escalas_ministerio s
        ON s.id = d.escala_id
       AND s.comunidade_id = d.comunidade_id
      JOIN ministerios_comunidade m
        ON m.id = s.ministerio_id
       AND m.comunidade_id = s.comunidade_id
      WHERE d.usuario_id = ?
        AND d.comunidade_id = ?
        AND d.ativo = 1
        AND d.status = 'CONFIRMADA'
        AND s.status = 'PUBLICADA'
        AND m.status = 'ATIVO'
        AND (
          m.categoria = 'ESTACIONAMENTO'
          OR lower(m.nome) LIKE '%estacionamento%'
        )
        AND datetime('now') BETWEEN datetime(s.inicia_em, '-2 hours')
          AND datetime(s.termina_em, '+2 hours')
      LIMIT 1`,
    )
    .bind(userId, comunidadeId)
    .first<{
      id: number;
      escala_id: number;
      ministerio_id: number;
      titulo: string;
      inicia_em: string;
      termina_em: string;
      funcao: string;
    }>();
  return assignment || null;
}

async function getNetworkPermissions(userId: number, comunidadeId: number) {
  const manager = await getD1()
    .prepare(
      `SELECT ra.papel
       FROM rede_administradores ra
       JOIN rede_unidades ru ON ru.rede_id = ra.rede_id
       WHERE ra.usuario_id = ? AND ra.ativo = 1
         AND ru.comunidade_id = ?
         AND (ra.inicia_em IS NULL OR datetime(ra.inicia_em) <= datetime('now'))
         AND (ra.termina_em IS NULL OR datetime(ra.termina_em) > datetime('now'))
       LIMIT 1`,
    )
    .bind(userId, comunidadeId)
    .first<{ papel: string }>();
  if (!manager) return [];
  const permissions = ["networks.view"];
  if (
    [
      "NETWORK_OWNER",
      "NETWORK_PRESIDENT",
      "NETWORK_ADMIN",
      "REGIONAL_SUPERVISOR",
    ].includes(manager.papel)
  ) {
    permissions.push("networks.manage");
  }
  return permissions;
}

export async function attachActiveCommunityCookie(
  response: Response,
  membershipId: number,
) {
  const payload: CommunityCookiePayload = {
    membershipId,
    expiresAt: Date.now() + ACTIVE_COMMUNITY_TTL_SECONDS * 1000,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encoded);
  response.headers.append(
    "Set-Cookie",
    `${ACTIVE_COMMUNITY_COOKIE}=${encoded}.${signature}; Path=/; Max-Age=${ACTIVE_COMMUNITY_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

async function readCommunityCookie(
  value: string | undefined,
): Promise<CommunityCookiePayload | null> {
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (
    !encoded ||
    !signature ||
    !(await signaturesMatch(signature, await sign(encoded)))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      base64UrlDecode(encoded),
    ) as CommunityCookiePayload;
    if (
      !Number.isInteger(payload.membershipId) ||
      payload.membershipId <= 0 ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function sign(value: string) {
  const secret = getRuntimeEnv().AUTH_SECRET;
  if (!secret) throw new Error("A chave de segurança não está configurada.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`community:${value}`),
      ),
    ),
  );
}

function signaturesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
