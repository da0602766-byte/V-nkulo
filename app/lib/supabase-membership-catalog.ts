import { getD1 } from "../../db";
import { readIntegration, reveal } from "./supabase-integration";
import { previewProfiles } from "./supabase-profile-catalog";
import { previewTenantCatalog } from "./supabase-tenant-catalog";

type SourceRow = { id: number; usuario_id: number; comunidade_id: number; papel: string; status: string; criado_em: string };
export type MembershipItem = {
  legacy_d1_id: number; legacy_user_id: number; legacy_tenant_id: number;
  role: string; status: "ATIVO" | "PENDENTE" | "SUSPENSO" | "INATIVO" | "REMOVIDO"; created_at: string;
};
type SyncResult = { run_id: string; source_count: number; inserted_count: number; updated_count: number; unchanged_count: number };
export type MembershipPreview = {
  sourceCount: number; destinationCount: number; matchedCount: number; pendingCount: number;
  extraDestinationCount: number; activeCount: number; removedCount: number; ready: boolean;
};

export class MembershipCatalogError extends Error {
  constructor(message: string, public readonly status = 424) { super(message); }
}

function normalizeTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    throw new MembershipCatalogError("Há um vínculo com data de criação inválida no D1.", 422);
  }
  const parsed = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) throw new MembershipCatalogError("Há um vínculo com data de criação inválida no D1.", 422);
  return parsed.toISOString();
}

export async function loadSourceMemberships(): Promise<MembershipItem[]> {
  const response = await getD1().prepare(
    "SELECT id, usuario_id, comunidade_id, papel, status, criado_em FROM usuario_comunidades ORDER BY id LIMIT 1001",
  ).all<SourceRow>();
  if (response.results.length > 1000) throw new MembershipCatalogError("Há mais de 1.000 vínculos; a cópia precisa ser dividida em lotes controlados.", 422);
  const ids = new Set<number>();
  const pairs = new Set<string>();
  return response.results.map(row => {
    const id = Number(row.id);
    const userId = Number(row.usuario_id);
    const tenantId = Number(row.comunidade_id);
    const role = String(row.papel || "");
    const status = String(row.status || "");
    const pair = `${userId}:${tenantId}`;
    if (![id, userId, tenantId].every(value => Number.isSafeInteger(value) && value > 0)
      || role.length < 1 || role.length > 64
      || !["ATIVO", "PENDENTE", "SUSPENSO", "INATIVO", "REMOVIDO"].includes(status)
      || ids.has(id) || pairs.has(pair)) {
      throw new MembershipCatalogError("Há um vínculo incompatível no D1. Revise a origem antes de sincronizar.", 422);
    }
    ids.add(id); pairs.add(pair);
    return { legacy_d1_id: id, legacy_user_id: userId, legacy_tenant_id: tenantId,
      role, status: status as MembershipItem["status"], created_at: normalizeTimestamp(String(row.criado_em || "")) };
  });
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) throw new MembershipCatalogError("Ative a conexão protegida com o Supabase antes de sincronizar vínculos.");
  const secret = await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${saved.config.url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "Accept-Profile": saved.config.schema, "Content-Profile": saved.config.schema },
      body: JSON.stringify(body), cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new MembershipCatalogError(
      [401, 403].includes(response.status) ? "A chave administrativa do Supabase não tem acesso à sincronização de vínculos."
        : response.status === 404 ? "A migração SQL da etapa 4 ainda não está disponível no Supabase."
          : `O Supabase recusou a operação de vínculos (HTTP ${response.status}).`,
      response.status === 409 ? 409 : 424,
    );
    return await response.json() as T;
  } catch (error) {
    if (error instanceof MembershipCatalogError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new MembershipCatalogError("O Supabase não respondeu em 20 segundos.", 504);
    throw new MembershipCatalogError("Não foi possível consultar os vínculos no Supabase.", 503);
  } finally { clearTimeout(timer); }
}

export async function previewMemberships(sourceInput?: MembershipItem[]): Promise<MembershipPreview> {
  const source = sourceInput ?? await loadSourceMemberships();
  const [profiles, tenants] = await Promise.all([previewProfiles(), previewTenantCatalog()]);
  if (!profiles.ready || !tenants.ready) throw new MembershipCatalogError("Sincronize primeiro todos os perfis e comunidades antes dos vínculos.", 409);
  const destination = await rpc<MembershipItem[]>("vinkulo_membership_snapshot", {});
  if (!Array.isArray(destination) || destination.length > 1000) throw new MembershipCatalogError("O Supabase devolveu uma lista de vínculos incompatível.");
  const sourceById = new Map(source.map(item => [item.legacy_d1_id, item]));
  const destinationById = new Map(destination.map(item => [Number(item.legacy_d1_id), item]));
  if (destinationById.size !== destination.length) throw new MembershipCatalogError("Há IDs de vínculos duplicados no destino.");
  const matchedCount = source.filter(item => {
    const remote = destinationById.get(item.legacy_d1_id);
    return remote && Number(remote.legacy_user_id) === item.legacy_user_id
      && Number(remote.legacy_tenant_id) === item.legacy_tenant_id
      && remote.role === item.role && remote.status === item.status
      && normalizeTimestamp(remote.created_at) === item.created_at;
  }).length;
  const extraDestinationCount = destination.filter(item => !sourceById.has(Number(item.legacy_d1_id))).length;
  return { sourceCount: source.length, destinationCount: destination.length, matchedCount,
    pendingCount: source.length - matchedCount, extraDestinationCount,
    activeCount: source.filter(item => item.status === "ATIVO").length,
    removedCount: source.filter(item => item.status === "REMOVIDO").length,
    ready: matchedCount === source.length && extraDestinationCount === 0 };
}

export async function syncMemberships(source: MembershipItem[], actorId: number) {
  if (!Number.isSafeInteger(actorId) || actorId < 1) throw new MembershipCatalogError("Responsável pela operação inválido.", 400);
  const result = await rpc<SyncResult[]>("vinkulo_sync_memberships", { payload: source, actor_legacy_d1_id: actorId });
  const run = Array.isArray(result) ? result[0] : null;
  if (!run || !run.run_id || run.source_count !== source.length) throw new MembershipCatalogError("O Supabase não confirmou a sincronização dos vínculos.");
  return run;
}
