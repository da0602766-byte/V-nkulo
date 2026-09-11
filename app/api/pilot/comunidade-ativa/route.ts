import { getSessionUser } from "../../../lib/local-auth";
import {
  attachActiveCommunityCookie,
  getActiveTenantContext,
  listTenantMemberships,
} from "../../../lib/tenant";

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!user.ativo)
    return Response.json({ error: "Usuário inativo." }, { status: 403 });
  return Response.json(await getActiveTenantContext(user), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!user.ativo)
    return Response.json({ error: "Usuário inativo." }, { status: 403 });
  const payload = (await request.json()) as { comunidadeId?: number };
  const requestedId = Number(payload.comunidadeId);
  const memberships = await listTenantMemberships(user);
  const selected = memberships.find(
    (membership) =>
      membership.comunidadeId === requestedId && membership.status === "ATIVO",
  );
  if (!selected) {
    return Response.json(
      { error: "Comunidade indisponível para este usuário." },
      { status: 403 },
    );
  }
  return attachActiveCommunityCookie(
    Response.json({ ok: true, comunidadeId: selected.comunidadeId }),
    selected.membershipId,
  );
}
