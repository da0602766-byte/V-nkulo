import { getSessionUser } from "../../../lib/local-auth";
import { getIntegrationCatalog } from "../../../lib/integration-catalog";

export async function GET() {
  const user = await getSessionUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user?.ativo) return Response.json({ error: "Faça login para continuar." }, { status: 401, headers });
  if (!user.system_owner) return Response.json({ error: "Área exclusiva do proprietário." }, { status: 403, headers });
  return Response.json(await getIntegrationCatalog(), { headers });
}
