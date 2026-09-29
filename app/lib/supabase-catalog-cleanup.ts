import { readIntegration, reveal } from "./supabase-integration";

export type CatalogCopyCounts = { tenants: number; profiles: number; memberships: number;
  profile_details: number; linked_auth: number }; // A partir de 0010 inclui contas Auth criadas e ainda não vinculadas.
type RemovedCounts = Omit<CatalogCopyCounts, "linked_auth">;
export type CatalogCleanupProject = { url: string; projectRef: string };

export class CatalogCleanupError extends Error {
  constructor(message: string, public readonly status = 424) { super(message); }
}

function counts(value: unknown): CatalogCopyCounts {
  const items = Array.isArray(value) ? value : null;
  const row = items?.[0] as Partial<CatalogCopyCounts> | undefined;
  if (!row || items?.length !== 1 || !["tenants", "profiles", "memberships", "profile_details", "linked_auth"]
    .every(key => {
      const raw = row[key as keyof CatalogCopyCounts];
      return (typeof raw === "number" || typeof raw === "string" && /^\d+$/.test(raw))
        && Number.isSafeInteger(Number(raw)) && Number(raw) >= 0;
    })) {
    throw new CatalogCleanupError("O Supabase devolveu contagens de catálogos incompatíveis.");
  }
  return { tenants: Number(row.tenants), profiles: Number(row.profiles), memberships: Number(row.memberships),
    profile_details: Number(row.profile_details), linked_auth: Number(row.linked_auth) };
}

async function rpc<T>(name: string, body: Record<string, unknown>, project?: CatalogCleanupProject): Promise<T> {
  const saved = await readIntegration();
  if (!saved?.config.serviceRoleKey) throw new CatalogCleanupError("Configure a chave protegida do projeto Supabase para conferir as cópias.", 409);
  if (project && (saved.config.url !== project.url || saved.config.projectRef !== project.projectRef)) {
    throw new CatalogCleanupError("O projeto Supabase mudou durante a conferência. Atualize o painel.", 409);
  }
  const secret = await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${saved.config.url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: secret, Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json", "Accept-Profile": saved.config.schema, "Content-Profile": saved.config.schema },
      body: JSON.stringify(body), cache: "no-store", redirect: "manual", signal: controller.signal,
    });
    if (!response.ok) throw new CatalogCleanupError(response.status === 404
      ? "Aplique a migração SQL 0009 no Supabase para conferir e remover as cópias dos catálogos."
      : `O Supabase recusou a conferência das cópias (HTTP ${response.status}).`, response.status === 409 ? 409 : 424);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof CatalogCleanupError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new CatalogCleanupError("O Supabase não respondeu em 20 segundos.", 504);
    throw new CatalogCleanupError("Não foi possível conferir as cópias dos catálogos no Supabase.", 503);
  } finally { clearTimeout(timer); }
}

export async function getCatalogCopyCounts(project?: CatalogCleanupProject): Promise<CatalogCopyCounts> {
  return counts(await rpc<unknown>("vinkulo_catalog_copy_counts", {}, project));
}

export function totalCatalogCopies(value: CatalogCopyCounts) {
  return value.tenants + value.profiles + value.memberships + value.profile_details;
}

export async function clearCatalogCopies(expected: RemovedCounts, actorId: number, project: CatalogCleanupProject): Promise<RemovedCounts> {
  if (!Number.isSafeInteger(actorId) || actorId < 1) throw new CatalogCleanupError("Responsável inválido.", 400);
  const response = await rpc<unknown>("vinkulo_clear_catalog_copies", {
    expected_tenants: expected.tenants, expected_profiles: expected.profiles,
    expected_memberships: expected.memberships, expected_profile_details: expected.profile_details,
    actor_legacy_d1_id: actorId,
  }, project);
  const removed = counts(Array.isArray(response) ? response.map(row => ({ ...row, linked_auth: 0 })) : response);
  if (["tenants", "profiles", "memberships", "profile_details"].some(key =>
    removed[key as keyof RemovedCounts] !== expected[key as keyof RemovedCounts])) {
    throw new CatalogCleanupError("O Supabase não confirmou as contagens removidas.");
  }
  const { linked_auth: _linked, ...result } = removed;
  void _linked;
  return result;
}
