import { getD1 } from "../../db";
import { readIntegration, reveal } from "./supabase-integration";
import { verifyTenantFoundation } from "./supabase-tenant-foundation";

type SourceRow = { id: number; nome: string; email: string; ativo: number; criado_em: string };
export type ProfileItem = { legacy_d1_id: number; display_name: string; email: string; active: boolean; created_at: string };
type SyncResult = { run_id: string; source_count: number; inserted_count: number; updated_count: number; unchanged_count: number };
export type ProfilePreview = {
  sourceCount: number; destinationCount: number; matchedCount: number;
  pendingCount: number; extraDestinationCount: number; activeCount: number; ready: boolean;
  extraDestinationIds: number[];
};

export class ProfileCatalogError extends Error {
  constructor(message: string, public readonly status = 424) { super(message); }
}

function normalizeTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    throw new ProfileCatalogError("Há um perfil com data de criação inválida no D1.", 422);
  }
  const parsed = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) throw new ProfileCatalogError("Há um perfil com data de criação inválida no D1.", 422);
  return parsed.toISOString();
}

export async function loadSourceProfiles(): Promise<ProfileItem[]> {
  // Lista branca explícita: senhas, sal, telefone, endereço e outros dados nunca entram no payload.
  const response = await getD1().prepare(
    "SELECT id, nome, email, ativo, criado_em FROM usuarios ORDER BY id LIMIT 1001",
  ).all<SourceRow>();
  if (response.results.length > 1000) throw new ProfileCatalogError("Há mais de 1.000 perfis; a cópia precisa ser dividida em lotes controlados.", 422);
  const ids = new Set<number>();
  const emails = new Set<string>();
  return response.results.map(row => {
    const id = Number(row.id);
    const name = String(row.nome || "");
    const email = String(row.email || "");
    if (!Number.isSafeInteger(id) || id < 1 || name.length < 1 || name.length > 180
      || email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || ![0, 1].includes(Number(row.ativo)) || ids.has(id) || emails.has(email.toLowerCase())) {
      throw new ProfileCatalogError("Há um perfil incompatível no D1. Revise o cadastro antes de sincronizar.", 422);
    }
    ids.add(id);
    emails.add(email.toLowerCase());
    return { legacy_d1_id: id, display_name: name, email, active: Boolean(row.ativo), created_at: normalizeTimestamp(String(row.criado_em || "")) };
  });
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) throw new ProfileCatalogError("Ative a conexão protegida com o Supabase antes de sincronizar perfis.");
  const secret = await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${saved.config.url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "Accept-Profile": saved.config.schema, "Content-Profile": saved.config.schema },
      body: JSON.stringify(body), cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new ProfileCatalogError(
      [401, 403].includes(response.status) ? "A chave administrativa do Supabase não tem acesso à sincronização de perfis."
        : response.status === 404 ? "A migração SQL da etapa 3 ainda não está disponível no Supabase."
          : `O Supabase recusou a operação de perfis (HTTP ${response.status}).`,
      response.status === 409 ? 409 : 424,
    );
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ProfileCatalogError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ProfileCatalogError("O Supabase não respondeu em 20 segundos.", 504);
    throw new ProfileCatalogError("Não foi possível consultar os perfis no Supabase.", 503);
  } finally { clearTimeout(timer); }
}

export async function previewProfiles(sourceInput?: ProfileItem[]): Promise<ProfilePreview> {
  const source = sourceInput ?? await loadSourceProfiles();
  if (!(await verifyTenantFoundation()).ready) throw new ProfileCatalogError("A fundação de dados ainda não está pronta no Supabase.");
  const destination = await rpc<ProfileItem[]>("vinkulo_profile_snapshot", {});
  if (!Array.isArray(destination) || destination.length > 1000) throw new ProfileCatalogError("O Supabase devolveu uma lista de perfis incompatível.");
  const sourceById = new Map(source.map(item => [item.legacy_d1_id, item]));
  const destinationById = new Map(destination.map(item => [Number(item.legacy_d1_id), item]));
  if (destinationById.size !== destination.length) throw new ProfileCatalogError("Há IDs de perfis duplicados no destino.");
  const matchedCount = source.filter(item => {
    const remote = destinationById.get(item.legacy_d1_id);
    return remote && remote.display_name === item.display_name && remote.email === item.email
      && remote.active === item.active && normalizeTimestamp(remote.created_at) === item.created_at;
  }).length;
  const extraDestinationCount = destination.filter(item => !sourceById.has(Number(item.legacy_d1_id))).length;
  return { sourceCount: source.length, destinationCount: destination.length, matchedCount,
    pendingCount: source.length - matchedCount, extraDestinationCount,
    extraDestinationIds: destination.filter(item => !sourceById.has(Number(item.legacy_d1_id))).map(item => Number(item.legacy_d1_id)),
    activeCount: source.filter(item => item.active).length,
    ready: matchedCount === source.length && extraDestinationCount === 0 };
}

export async function syncProfiles(source: ProfileItem[], actorId: number) {
  if (!Number.isSafeInteger(actorId) || actorId < 1) throw new ProfileCatalogError("Responsável pela operação inválido.", 400);
  const result = await rpc<SyncResult[]>("vinkulo_sync_profiles", { payload: source, actor_legacy_d1_id: actorId });
  const run = Array.isArray(result) ? result[0] : null;
  if (!run || !run.run_id || run.source_count !== source.length) throw new ProfileCatalogError("O Supabase não confirmou a sincronização dos perfis.");
  return run;
}
