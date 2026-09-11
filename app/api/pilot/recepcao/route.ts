import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  getIntroductionState,
  getPendingPromotionNotice,
  markIntroductionSeen,
  markPromotionNoticeSeen,
} from "../../../lib/recepcao";
import { getActiveTenantContext } from "../../../lib/tenant";

// Avisos pessoais da recepção (promoção e introdução) não dependem de
// permissão de módulo: qualquer pessoa com vínculo ativo recebe os seus.
async function requireMember() {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return {
      error: Response.json({ error: "Faça login para continuar." }, { status: 401 }),
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
  return { user, context: tenant.context } as const;
}

export async function GET() {
  const access = await requireMember();
  if ("error" in access) return access.error;
  const db = getD1();
  const [promocao, introducao] = await Promise.all([
    getPendingPromotionNotice(db, access.context.comunidadeId, access.user.id),
    getIntroductionState(db, access.user.id, access.context.comunidadeId),
  ]);
  return Response.json(
    { promocao, introducao },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await requireMember();
  if ("error" in access) return access.error;
  const payload = (await request.json()) as Record<string, unknown>;
  const action = String(payload.acao || "").toUpperCase();
  const db = getD1();

  if (action === "MARCAR_PROMOCAO_VISTA") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Aviso inválido." }, { status: 400 });
    }
    await markPromotionNoticeSeen(db, id, access.user.id);
    return Response.json({ ok: true });
  }

  if (action === "MARCAR_INTRODUCAO") {
    const tipo = String(payload.tipo || "").toUpperCase();
    if (tipo !== "PLATAFORMA" && tipo !== "COMUNIDADE") {
      return Response.json({ error: "Introdução inválida." }, { status: 400 });
    }
    await markIntroductionSeen(db, {
      usuarioId: access.user.id,
      comunidadeId: access.context.comunidadeId,
      tipo,
      pulada: Boolean(payload.pulada),
      etapa: Number(payload.etapa) || 0,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
