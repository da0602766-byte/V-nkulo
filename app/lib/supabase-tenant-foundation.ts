import { IntegrationInputError, readIntegration, reveal } from "./supabase-integration";

export type TenantFoundationCheck = {
  ready: boolean;
  checkedAt: string;
  latencyMs: number;
  status: number;
  message: string;
  tables: Record<"tenants" | "profiles" | "memberships" | "migrationRuns", boolean>;
};

const entries = [
  ["tenants", "vinkulo_tenants"],
  ["profiles", "vinkulo_profiles"],
  ["memberships", "vinkulo_memberships"],
  ["migrationRuns", "vinkulo_migration_runs"],
] as const;

async function checkFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyTenantFoundation(): Promise<TenantFoundationCheck> {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  const empty = { tenants: false, profiles: false, memberships: false, migrationRuns: false };
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) {
    return { ready: false, checkedAt, latencyMs: Date.now() - started, status: 0, message: "Ative a integração do Supabase antes de verificar a fundação de dados.", tables: empty };
  }
  try {
    const secret = await reveal(saved.config.serviceRoleKey, saved.config.url + ":serviceRoleKey");
    const response = await checkFetch(`${saved.config.url}/rest/v1/rpc/vinkulo_tenant_foundation_health`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Accept-Profile": saved.config.schema, "Content-Type": "application/json" },
      body: "{}",
    });
    const rows = response.ok ? await response.json() as Array<{ table_key?: string; present?: boolean; rls_enabled?: boolean }> : [];
    const tables = Object.fromEntries(entries.map(([key]) => {
      const row = rows.find(candidate => candidate.table_key === key);
      return [key, Boolean(row?.present && row.rls_enabled)];
    })) as TenantFoundationCheck["tables"];
    const ready = Object.values(tables).every(Boolean);
    const status = response.status || 0;
    return {
      ready,
      checkedAt,
      latencyMs: Date.now() - started,
      status,
      message: ready
        ? "Fundação de comunidades pronta: isolamento por tenant protegido por RLS. Nenhum dado do Vínkulo foi copiado ainda."
        : "A fundação de comunidades ainda não está disponível no Supabase. Aplique a migração administrativa antes de transferir dados.",
      tables,
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return { ready: false, checkedAt, latencyMs: Date.now() - started, status: 0, message: timedOut ? "O Supabase não respondeu dentro de 8 segundos." : "Não foi possível verificar a fundação de dados no Supabase.", tables: empty };
  }
}

export function ensureTenantFoundationReady(check: TenantFoundationCheck) {
  if (!check.ready) throw new IntegrationInputError("A fundação de comunidades do Supabase ainda não está pronta.");
}
