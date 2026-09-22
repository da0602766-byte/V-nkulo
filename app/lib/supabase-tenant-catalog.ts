import { getD1 } from "../../db";
import { readIntegration, reveal } from "./supabase-integration";
import { verifyTenantFoundation } from "./supabase-tenant-foundation";

type SourceRow = {
  id: number;
  slug: string;
  nome: string;
  status: string;
  ambiente_demo: number;
  criado_em: string;
};

export type TenantCatalogItem = {
  legacy_d1_id: number;
  slug: string;
  name: string;
  status: "ATIVA" | "INATIVA" | "SUSPENSA" | "ARQUIVADA";
  is_demo: boolean;
  created_at: string;
};

type SyncResult = {
  run_id: string;
  source_count: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
};

export type CatalogPreview = {
  sourceCount: number;
  destinationCount: number;
  matchedCount: number;
  pendingCount: number;
  extraDestinationCount: number;
  sourceByStatus: Record<string, number>;
  sourceDemoCount: number;
  ready: boolean;
};

export class TenantCatalogError extends Error {
  constructor(message: string, public readonly status = 424) { super(message); }
}

function normalizeTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    throw new TenantCatalogError("Data de criação inválida no catálogo de comunidades.", 422);
  }
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) throw new TenantCatalogError("Data de criação inválida no catálogo de comunidades.", 422);
  return parsed.toISOString();
}

export async function loadSourceTenantCatalog(): Promise<TenantCatalogItem[]> {
  const response = await getD1().prepare(
    "SELECT id, slug, nome, status, ambiente_demo, criado_em FROM comunidades ORDER BY id LIMIT 501",
  ).all<SourceRow>();
  if (response.results.length > 500) throw new TenantCatalogError("Há mais de 500 comunidades; migre em lotes controlados.", 422);
  const ids = new Set<number>();
  const slugs = new Set<string>();
  return response.results.map((row) => {
    const id = Number(row.id);
    const slug = String(row.slug || "");
    const name = String(row.nome || "");
    const status = String(row.status || "");
    if (!Number.isSafeInteger(id) || id < 1 || !/^[a-z0-9-]+$/.test(slug)
      || name.length < 1 || name.length > 180
      || !["ATIVA", "INATIVA", "SUSPENSA", "ARQUIVADA"].includes(status)
      || ![0, 1].includes(Number(row.ambiente_demo)) || ids.has(id) || slugs.has(slug)) {
      throw new TenantCatalogError("O catálogo de comunidades contém um registro incompatível. Revise a origem antes de sincronizar.", 422);
    }
    ids.add(id);
    slugs.add(slug);
    return {
      legacy_d1_id: id,
      slug,
      name,
      status: status as TenantCatalogItem["status"],
      is_demo: Boolean(row.ambiente_demo),
      created_at: normalizeTimestamp(String(row.criado_em || "")),
    };
  });
}

async function rpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) {
    throw new TenantCatalogError("Ative a conexão protegida com o Supabase antes de sincronizar comunidades.");
  }
  const secret = await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${saved.config.url}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "Accept-Profile": saved.config.schema,
        "Content-Profile": saved.config.schema,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = [401, 403].includes(response.status)
        ? "A chave administrativa do Supabase não tem acesso à sincronização de comunidades."
        : response.status === 404
          ? "A migração SQL da etapa 2 ainda não está disponível no Supabase."
          : `O Supabase recusou a operação do catálogo (HTTP ${response.status}).`;
      throw new TenantCatalogError(message, response.status === 409 ? 409 : 424);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof TenantCatalogError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TenantCatalogError("O Supabase não respondeu em 10 segundos.", 504);
    }
    throw new TenantCatalogError("Não foi possível consultar o catálogo no Supabase.", 503);
  } finally {
    clearTimeout(timer);
  }
}

function sameItem(source: TenantCatalogItem, destination: TenantCatalogItem) {
  return source.slug === destination.slug && source.name === destination.name
    && source.status === destination.status && source.is_demo === destination.is_demo
    && source.created_at === normalizeTimestamp(destination.created_at);
}

export async function previewTenantCatalog(sourceInput?: TenantCatalogItem[]): Promise<CatalogPreview> {
  const source = sourceInput ?? await loadSourceTenantCatalog();
  const foundation = await verifyTenantFoundation();
  if (!foundation.ready) throw new TenantCatalogError("A fundação de comunidades ainda não está pronta no Supabase.");
  const destination = await rpc<TenantCatalogItem[]>("vinkulo_tenant_catalog_snapshot", {});
  if (!Array.isArray(destination) || destination.length > 500) {
    throw new TenantCatalogError("O Supabase devolveu um catálogo incompatível.");
  }
  const sourceById = new Map(source.map(item => [item.legacy_d1_id, item]));
  const destinationById = new Map(destination.map(item => [Number(item.legacy_d1_id), item]));
  const matchedCount = source.filter(item => {
    const remote = destinationById.get(item.legacy_d1_id);
    return remote ? sameItem(item, remote) : false;
  }).length;
  const sourceByStatus: Record<string, number> = {};
  for (const item of source) sourceByStatus[item.status] = (sourceByStatus[item.status] || 0) + 1;
  const extraDestinationCount = destination.filter(item => !sourceById.has(Number(item.legacy_d1_id))).length;
  return {
    sourceCount: source.length,
    destinationCount: destination.length,
    matchedCount,
    pendingCount: source.length - matchedCount,
    extraDestinationCount,
    sourceByStatus,
    sourceDemoCount: source.filter(item => item.is_demo).length,
    ready: source.length === matchedCount && extraDestinationCount === 0,
  };
}

export async function syncTenantCatalog(source: TenantCatalogItem[], actorId: number) {
  if (!Number.isSafeInteger(actorId) || actorId < 1) throw new TenantCatalogError("Responsável pela operação inválido.", 400);
  const result = await rpc<SyncResult[]>("vinkulo_sync_tenant_catalog", { payload: source, actor_legacy_d1_id: actorId });
  const run = Array.isArray(result) ? result[0] : null;
  if (!run || run.source_count !== source.length || !run.run_id) {
    throw new TenantCatalogError("O Supabase não confirmou a execução do catálogo.");
  }
  return run;
}
