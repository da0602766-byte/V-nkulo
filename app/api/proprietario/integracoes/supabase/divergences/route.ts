import { auditSupabaseDivergences } from "../../../../../lib/supabase-divergence";
import { reply, requireIntegrationOwner } from "../route";

export async function GET(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try { return reply({ report: await auditSupabaseDivergences() }); }
  catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Não foi possível conferir as divergências." }, 503);
  }
}
