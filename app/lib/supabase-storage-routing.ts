import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";
import type { Integration } from "./supabase-integration";
import { readCopiedImage, readStorageImageBytes, SupabaseStorageCopyError, verifiedStorageTarget } from "./supabase-storage-copy";

const KEY = "supabase_storage_read_source";
export type StorageReadSource = "R2" | "SUPABASE";

async function sampleCopy(url: string, bucket: string) {
  return getD1().prepare(`SELECT object_key FROM supabase_storage_copies c
    WHERE project_ref=? AND bucket=? AND NOT EXISTS
    (SELECT 1 FROM platform_reset_files f WHERE f.object_key=c.object_key)
    ORDER BY object_key LIMIT 1`).bind(new URL(url).hostname.split(".")[0], bucket).first<{ object_key: string }>();
}

export async function getStorageReadSource(): Promise<StorageReadSource> {
  return (await getStorageReadPolicy("")).source;
}

export async function getStorageReadPolicy(key: string): Promise<{ source: StorageReadSource; deleted: boolean }> {
  // Uma ida ao D1 reúne preferência, destino e bloqueio de exclusão.
  const row = await getD1().prepare(`SELECT
    (SELECT valor FROM configuracoes WHERE chave=?) AS preference,
    (SELECT valor FROM configuracoes WHERE chave='supabase_integration') AS integration,
    EXISTS(SELECT 1 FROM platform_reset_files WHERE object_key=?) AS deleted`)
    .bind(KEY, key).first<{ preference: string | null; integration: string | null; deleted: number }>();
  const deleted = Boolean(row?.deleted);
  if (deleted || !row?.preference || !row.integration) return { source: "R2", deleted };
  try {
    const preference = JSON.parse(row.preference);
    const config = JSON.parse(row.integration) as Integration;
    const enabled = preference.source === "SUPABASE" && config.ativa && config.serviceRoleKey && config.bucket
      && preference.url === config.url && preference.bucket === config.bucket && preference.projectRef === config.projectRef;
    return { source: enabled ? "SUPABASE" : "R2", deleted };
  } catch { return { source: "R2", deleted }; }
}

export async function setStorageReadSource(source: StorageReadSource, actorId: number) {
  let value = JSON.stringify({ source: "R2" });
  if (source === "SUPABASE") {
    const target = await verifiedStorageTarget();
    const projectRef = new URL(target.url).hostname.split(".")[0];
    const row = await sampleCopy(target.url, target.bucket);
    const image = row ? await readCopiedImage(row.object_key) : null;
    if (!image) {
      throw new SupabaseStorageCopyError("Confira ao menos uma cópia de imagem antes de alterar a leitura.", 409);
    }
    await image.body?.cancel();
    value = JSON.stringify({ source, url: target.url, projectRef, bucket: target.bucket });
  }
  await getD1().prepare(`INSERT INTO configuracoes(chave,valor,atualizado_por,atualizado_em)
    VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chave) DO UPDATE SET
    valor=excluded.valor,atualizado_por=excluded.atualizado_por,atualizado_em=excluded.atualizado_em`)
    .bind(KEY, value, String(actorId)).run();
}

export async function benchmarkStorageRead() {
  const target = await verifiedStorageTarget();
  const row = await sampleCopy(target.url, target.bucket);
  const bucket = getRuntimeEnv().BUCKET;
  if (!row || !bucket) throw new SupabaseStorageCopyError("A comparação exige uma imagem conferida nos dois armazenamentos.", 409);
  const samples: Array<{ r2Ms: number; supabaseMs: number; matching: boolean }> = [];
  const round = (n: number) => Math.round(n * 100) / 100;
  const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).join(",");
  let sizeBytes = 0;
  async function measureR2() {
    const start = performance.now();
    const original = await bucket!.get(row!.object_key);
    if (!original) throw new SupabaseStorageCopyError("O original no R2 não foi encontrado.", 409);
    const bytes = await readStorageImageBytes(original.body);
    return { bytes, ms: round(performance.now() - start) };
  }
  async function measureSupabase() {
    const start = performance.now();
    const image = await readCopiedImage(row!.object_key, 5000);
    if (!image) throw new SupabaseStorageCopyError("A cópia da imagem não foi encontrada.", 409);
    const bytes = await image.arrayBuffer();
    return { bytes, ms: round(performance.now() - start) };
  }
  for (let i = 0; i < 3; i++) {
    // Alterna a ordem para reduzir o efeito da primeira conexão.
    const first = await (i % 2 === 0 ? measureR2() : measureSupabase());
    const second = await (i % 2 === 0 ? measureSupabase() : measureR2());
    const [r2, supabase] = i % 2 === 0 ? [first, second] : [second, first];
    sizeBytes = r2.bytes.byteLength;
    const matching = await hash(r2.bytes) === await hash(supabase.bytes);
    samples.push({ r2Ms: r2.ms, supabaseMs: supabase.ms, matching });
    if (!matching) break;
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const r2MedianMs = median(samples.map(s => s.r2Ms));
  const supabaseMedianMs = median(samples.map(s => s.supabaseMs));
  const matching = samples.length === 3 && samples.every(s => s.matching);
  return { measuredAt: new Date().toISOString(), sizeBytes, samples, matching, r2MedianMs, supabaseMedianMs,
    recommendation: matching && supabaseMedianMs < r2MedianMs ? "SUPABASE" : "R2" };
}
