import { getD1 } from "../../../../../../db";
import { copyStoragePage, rollbackStorageCopyPage, SupabaseStorageCopyError } from "../../../../../lib/supabase-storage-copy";
import { recordTenantAudit } from "../../../../../lib/tenant-audit";
import { reply, requireIntegrationOwner } from "../route";

export async function GET() {
  const access = await requireIntegrationOwner();
  if ("error" in access) return access.error;
  try {
    const row = await getD1().prepare("SELECT COUNT(*) AS total FROM supabase_storage_copies")
      .first<{ total: number }>();
    return reply({ copies: Number(row?.total || 0) });
  } catch { return reply({ error: "Não foi possível consultar as cópias." }, 503); }
}

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  let cursor: string | undefined;
  try {
    const body = await request.json() as { confirm?: unknown; cursor?: unknown };
    if (body?.confirm !== true || (body.cursor != null && typeof body.cursor !== "string")) {
      return reply({ error: "Confirme a cópia e informe uma página válida." }, 400);
    }
    cursor = body.cursor || undefined;
    const result = await copyStoragePage(cursor);
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_ARQUIVOS_COPIADOS", "SUCESSO",
      { scanned: result.scanned, copied: result.copied, verified: result.verified, skipped: result.skipped });
    return reply({ result });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_ARQUIVOS_COPIADOS", "ERRO");
    return reply({ error: error instanceof SupabaseStorageCopyError ? error.message : "Não foi possível copiar esta página de arquivos." },
      error instanceof SupabaseStorageCopyError ? error.status : 503);
  }
}

export async function DELETE(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try {
    const body = await request.json() as { confirm?: unknown };
    if (body?.confirm !== "REMOVER_COPIAS_SUPABASE") return reply({ error: "Confirme a remoção das cópias." }, 400);
    const result = await rollbackStorageCopyPage();
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_ARQUIVOS_REVERTIDOS", "SUCESSO", result);
    return reply({ result });
  } catch (error) {
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id,
      "INTEGRACAO_SUPABASE_ARQUIVOS_REVERTIDOS", "ERRO");
    return reply({ error: error instanceof SupabaseStorageCopyError ? error.message : "Não foi possível desfazer as cópias." },
      error instanceof SupabaseStorageCopyError ? error.status : 503);
  }
}
