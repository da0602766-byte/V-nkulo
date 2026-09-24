import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { getOperationalDashboard } from "../../../lib/operational-dashboard";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const user = await getSessionUser();
  if (!user?.ativo) return Response.json({ error: "Faça login para continuar." }, { status: 401, headers });
  if (!user.system_owner) return Response.json({ error: "Área exclusiva do proprietário." }, { status: 403, headers });
  const search = new URL(request.url).searchParams;
  const period = search.get("period") ?? "24h", channel = search.get("channel") ?? "all";
  if ((period !== "24h" && period !== "7d") || (channel !== "all" && channel !== "web" && channel !== "android")) {
    return Response.json({ error: "Selecione um período e canal válidos." }, { status: 400, headers });
  }
  try { return Response.json(await getOperationalDashboard(getD1(), period, channel), { headers }); }
  catch { return Response.json({ error: "Não foi possível atualizar o dashboard operacional." }, { status: 503, headers }); }
}
