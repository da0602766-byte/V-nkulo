import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";
import { loadCommunityCentral } from "../../../lib/community-central-data";

export async function GET(request: Request) {
  const address = new URL(request.url);
  const reports = address.searchParams.get("view") === "reports";
  const access = await requireTenantPermission(reports ? "reports.view" : "dashboard.view");
  if ("error" in access) return access.error;
  if (access.context.communityAccess === "FEED_ONLY") return Response.json({ error: "A Central não está disponível para este acesso." }, { status: 403 });
  const days = Number(address.searchParams.get("days") || 30);
  if (![7, 30, 90].includes(days)) return Response.json({ error: "Escolha um período de 7, 30 ou 90 dias." }, { status: 400 });
  const data = await loadCommunityCentral(getD1(), access.context, { days, personal: address.searchParams.get("scope") === "me" });
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
