import { getD1 } from "../../../../../../db";
import { loadSourceProfileDetails, previewProfileDetails, ProfileDetailsError, syncProfileDetails } from "../../../../../lib/supabase-profile-details";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

export async function GET() {
  const access = await requireIntegrationOwner();
  if ("error" in access) return access.error;
  try { return reply({ preview: await previewProfileDetails() }); }
  catch (error) { return reply({ error: error instanceof ProfileDetailsError ? error.message : "Não foi possível comparar os dados cadastrais." },
    error instanceof ProfileDetailsError ? error.status : 503); }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { confirm?: unknown; sourceCount?: unknown };
    if (body?.confirm !== "SINCRONIZAR_DADOS_CADASTRAIS" || !Number.isSafeInteger(body.sourceCount) || Number(body.sourceCount) < 0) {
      return reply({ error: "Confirme a transferência e a contagem atual dos cadastros." }, 400);
    }
    const source = await loadSourceProfileDetails();
    if (source.length !== body.sourceCount) return reply({ error: "A contagem mudou. Atualize a comparação antes de transferir." }, 409);
    const before = await previewProfileDetails(source);
    if (before.extraDestinationCount) return reply({ error: "Há dados cadastrais extras no Supabase. Revise antes de sincronizar." }, 409);
    const run = before.ready ? null : await syncProfileDetails(source, access.user.id);
    const after = await previewProfileDetails();
    if (!after.ready) throw new ProfileDetailsError("A conferência após a transferência não coincidiu.");
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS", "SUCESSO",
      { sourceCount: source.length, inserted: run?.inserted_count || 0, updated: run?.updated_count || 0 });
    return reply({ preview: after, run });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_DADOS_CADASTRAIS", "ERRO");
    return reply({ error: error instanceof ProfileDetailsError ? error.message : "Não foi possível transferir os dados cadastrais." },
      error instanceof ProfileDetailsError ? error.status : 503);
  }
}
