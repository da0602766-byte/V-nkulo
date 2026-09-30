import { benchmarkStorageRead } from "../../../../../lib/supabase-storage-routing";
import { SupabaseStorageCopyError } from "../../../../../lib/supabase-storage-copy";
import { reply, requireIntegrationOwner } from "../route";

export async function POST(request: Request) {
  const access = await requireIntegrationOwner(request);
  if ("error" in access) return access.error;
  try { return reply({ result: await benchmarkStorageRead() }); }
  catch (error) {
    return reply({ error: error instanceof SupabaseStorageCopyError ? error.message : "Não foi possível comparar os armazenamentos." },
      error instanceof SupabaseStorageCopyError ? error.status : 503);
  }
}
