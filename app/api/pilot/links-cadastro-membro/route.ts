import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import {
  cancelMemberRegistrationLink,
  createOpaqueLinkToken,
  formatLinkCountdown,
  hashLinkToken,
  listMemberRegistrationLinks,
  saveMemberRegistrationLink,
} from "../../../lib/member-registration-links";

const MAX_VALIDITY_DAYS = 30;

export async function GET() {
  const access = await requireTenantPermission("community.membership-links.manage");
  if ("error" in access) return access.error;
  const db = getD1();
  const links = await listMemberRegistrationLinks(db, access.user.id);
  const now = Date.now();
  return Response.json(
    {
      links: links.map((link) => ({
        tokenHash: link.tokenHash,
        status: link.status,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
        countdown:
          link.status === "ATIVO"
            ? formatLinkCountdown(Date.parse(link.expiresAt) - now)
            : "Cancelado",
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("community.membership-links.manage");
  if ("error" in access) return access.error;
  const payload = await safeJson(request);
  const expiresAtInput = String(payload?.expiresAt || "");
  const expiresAtMs = Date.parse(expiresAtInput);
  const minMs = Date.now() + 5 * 60_000;
  const maxMs = Date.now() + MAX_VALIDITY_DAYS * 86_400_000;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < minMs || expiresAtMs > maxMs) {
    return Response.json(
      {
        error: `Escolha uma validade entre 5 minutos e ${MAX_VALIDITY_DAYS} dias a partir de agora.`,
      },
      { status: 400 },
    );
  }
  const db = getD1();
  const ownedCommunity = await db
    .prepare(
      `SELECT id FROM comunidades WHERE proprietario_usuario_id = ? AND status = 'ATIVA' LIMIT 1`,
    )
    .bind(access.user.id)
    .first<{ id: number }>();
  if (!ownedCommunity && !access.user.system_owner) {
    return Response.json(
      { error: "Você precisa ser proprietário de ao menos uma comunidade ativa." },
      { status: 403 },
    );
  }
  const token = createOpaqueLinkToken();
  const tokenHash = await hashLinkToken(token);
  const expiresAt = new Date(expiresAtMs).toISOString();
  await saveMemberRegistrationLink(db, {
    ownerId: access.user.id,
    ownerEmail: access.user.email,
    tokenHash,
    expiresAt,
  });
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "LINK_CADASTRO_MEMBRO_CRIADO",
    "SUCESSO",
    { expiresAt },
  );
  return Response.json(
    {
      token,
      url: `/cadastro-membro/${token}`,
      expiresAt,
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("community.membership-links.manage");
  if ("error" in access) return access.error;
  const payload = await safeJson(request);
  const tokenHash = String(payload?.tokenHash || "");
  if (!/^[a-f0-9]{64}$/i.test(tokenHash)) {
    return Response.json({ error: "Link inválido." }, { status: 400 });
  }
  const db = getD1();
  const cancelled = await cancelMemberRegistrationLink(db, access.user.id, tokenHash);
  if (!cancelled) {
    return Response.json({ error: "Link não encontrado." }, { status: 404 });
  }
  await recordTenantAudit(
    db,
    access.context,
    access.user.id,
    "LINK_CADASTRO_MEMBRO_CANCELADO",
    "SUCESSO",
    { tokenHash },
  );
  return Response.json({ ok: true });
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
