import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { getPushQueueStatus } from "../../../lib/push-delivery-queue";

export async function GET() {
  const user = await getSessionUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user?.ativo) return Response.json({ error: "Faça login para continuar." }, { status: 401, headers });
  if (!user.system_owner) return Response.json({ error: "Área exclusiva do proprietário." }, { status: 403, headers });
  try {
    return Response.json(await getPushQueueStatus(getD1()), { headers });
  } catch {
    return Response.json({ error: "Não foi possível consultar a fila de notificações." }, { status: 503, headers });
  }
}
