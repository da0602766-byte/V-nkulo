import { loadSourceTenantCatalog, type TenantCatalogItem } from "./supabase-tenant-catalog";
import { loadSourceProfiles, type ProfileItem } from "./supabase-profile-catalog";
import { loadSourceMemberships, type MembershipItem } from "./supabase-membership-catalog";
import { readIntegration, reveal } from "./supabase-integration";

type Scope = "communities" | "profiles" | "memberships";
type Kind = "MISSING" | "DIFFERENT" | "EXTRA" | "UNTRACKED";
type Catalog = TenantCatalogItem | ProfileItem | MembershipItem;
type Counts = { source: number; destination: number; missing: number; different: number; extra: number; untracked: number };
export type DivergenceIssue = { scope: Scope; kind: Kind; legacyId: number | null; fields: string[] };
export type DivergenceReport = {
  checkedAt: string;
  ready: boolean;
  counts: Record<Scope, Counts>;
  issues: DivergenceIssue[];
  omittedIssueCount: number;
};

const MAX_ISSUES = 100;
const limits: Record<Scope, number> = { communities: 500, profiles: 1000, memberships: 1000 };
const functions: Record<Scope, string> = {
  communities: "vinkulo_tenant_catalog_snapshot",
  profiles: "vinkulo_profile_snapshot",
  memberships: "vinkulo_membership_snapshot",
};

function identity(value: unknown): number | null {
  if (value === null) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("O Supabase devolveu um ID incompatível no catálogo.");
  return id;
}

function fields(scope: Scope, source: Catalog, destination: Catalog): string[] {
  const differences: string[] = [];
  const compare = (label: string, a: unknown, b: unknown) => { if (a !== b) differences.push(label); };
  if (scope === "communities") {
    const a = source as TenantCatalogItem; const b = destination as TenantCatalogItem;
    compare("slug", a.slug, b.slug); compare("nome", a.name, b.name);
    compare("situação", a.status, b.status); compare("demonstração", a.is_demo, b.is_demo);
  } else if (scope === "profiles") {
    const a = source as ProfileItem; const b = destination as ProfileItem;
    compare("nome", a.display_name, b.display_name); compare("e-mail", a.email, b.email);
    compare("atividade", a.active, b.active);
  } else {
    const a = source as MembershipItem; const b = destination as MembershipItem;
    compare("pessoa", a.legacy_user_id, Number(b.legacy_user_id));
    compare("comunidade", a.legacy_tenant_id, Number(b.legacy_tenant_id));
    compare("papel", a.role, b.role); compare("situação", a.status, b.status);
  }
  const remoteDate = Date.parse(destination.created_at);
  if (!Number.isFinite(remoteDate) || Date.parse(source.created_at) !== remoteDate) differences.push("criação");
  return differences;
}

function compareCatalog(scope: Scope, source: Catalog[], destination: Catalog[], issues: DivergenceIssue[]): Counts {
  if (!Array.isArray(destination) || destination.length > limits[scope] + 100) {
    throw new Error("O catálogo devolvido pelo Supabase é grande ou incompatível. Revise o destino antes de continuar.");
  }
  const counts: Counts = { source: source.length, destination: destination.length,
    missing: 0, different: 0, extra: 0, untracked: 0 };
  const byId = new Map<number, Catalog>();
  for (const item of destination) {
    const id = identity(item?.legacy_d1_id);
    if (id === null) { counts.untracked += 1; issues.push({ scope, kind: "UNTRACKED", legacyId: null, fields: [] }); continue; }
    if (byId.has(id)) throw new Error("O Supabase devolveu IDs duplicados no catálogo.");
    byId.set(id, item);
  }
  const sourceIds = new Set<number>();
  for (const item of source) {
    const id = item.legacy_d1_id;
    sourceIds.add(id);
    const remote = byId.get(id);
    if (!remote) { counts.missing += 1; issues.push({ scope, kind: "MISSING", legacyId: id, fields: [] }); continue; }
    const changed = fields(scope, item, remote);
    if (changed.length) { counts.different += 1; issues.push({ scope, kind: "DIFFERENT", legacyId: id, fields: changed }); }
  }
  for (const id of byId.keys()) {
    if (!sourceIds.has(id)) { counts.extra += 1; issues.push({ scope, kind: "EXTRA", legacyId: id, fields: [] }); }
  }
  return counts;
}

async function snapshot<T extends Catalog>(scope: Scope, url: string, key: string, schema: string): Promise<T[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/${functions[scope]}`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`,
        "Content-Type": "application/json", "Accept-Profile": schema, "Content-Profile": schema },
      body: "{}", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Não foi possível consultar o catálogo no Supabase (HTTP ${response.status}).`);
    return await response.json() as T[];
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Não foi possível consultar")) throw error;
    throw new Error("Não foi possível consultar os catálogos no Supabase.");
  } finally { clearTimeout(timer); }
}

/** Diagnóstico só de metadados: nenhuma alteração no D1 ou no Supabase. */
export async function auditSupabaseDivergences(): Promise<DivergenceReport> {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) throw new Error("Ative a conexão protegida com o Supabase antes do diagnóstico.");
  const config = saved.config;
  const serviceRoleKey = config.serviceRoleKey;
  if (!serviceRoleKey) throw new Error("Ative a conexão protegida com o Supabase antes do diagnóstico.");
  const key = await reveal(serviceRoleKey, `${config.url}:serviceRoleKey`);
  const [communities, profiles, memberships, remoteCommunities, remoteProfiles, remoteMemberships] = await Promise.all([
    loadSourceTenantCatalog(), loadSourceProfiles(), loadSourceMemberships(),
    snapshot<TenantCatalogItem>("communities", config.url, key, config.schema),
    snapshot<ProfileItem>("profiles", config.url, key, config.schema),
    snapshot<MembershipItem>("memberships", config.url, key, config.schema),
  ]);
  const issues: DivergenceIssue[] = [];
  const counts = {
    communities: compareCatalog("communities", communities, remoteCommunities, issues),
    profiles: compareCatalog("profiles", profiles, remoteProfiles, issues),
    memberships: compareCatalog("memberships", memberships, remoteMemberships, issues),
  };
  return { checkedAt: new Date().toISOString(), ready: issues.length === 0, counts,
    issues: issues.slice(0, MAX_ISSUES), omittedIssueCount: Math.max(0, issues.length - MAX_ISSUES) };
}
