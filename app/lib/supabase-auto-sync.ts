import { getRuntimeEnv } from "../../db/runtime-env";
import { readIntegration } from "./supabase-integration";
import { loadSourceTenantCatalog, previewTenantCatalog, syncTenantCatalog } from "./supabase-tenant-catalog";
import { loadSourceProfiles, previewProfiles, syncProfiles } from "./supabase-profile-catalog";
import { loadSourceMemberships, previewMemberships, syncMemberships } from "./supabase-membership-catalog";

const KEY = "supabase_auto_sync";
const INTERVAL_MS = 5 * 60_000;
const RETRY_MS = 60_000;
const LOCK_MS = 2 * 60_000;
const WRITE_COOLDOWN_MS = 15_000;

type CatalogResult = { source: number; destination: number; changed: number };
export type AutoSyncStatus = {
  enabled: boolean;
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastResult: { tenants: CatalogResult; profiles: CatalogResult; memberships: CatalogResult } | null;
};
type StoredStatus = AutoSyncStatus & { lockUntil: string | null; lockToken: string | null };
type StatusRow = { valor: string };

function initialStatus(): StoredStatus {
  return { enabled: false, running: false, lastAttemptAt: null, lastSuccessAt: null,
    nextRunAt: null, lastError: null, lastResult: null, lockUntil: null, lockToken: null };
}
function parseStatus(raw: string | null): StoredStatus {
  if (!raw) return initialStatus();
  try {
    const value = JSON.parse(raw) as Partial<StoredStatus>;
    return { ...initialStatus(), ...value, enabled: value.enabled === true };
  } catch { return initialStatus(); }
}
function publicStatus(status: StoredStatus): AutoSyncStatus {
  const { lockToken: _token, lockUntil, ...rest } = status;
  void _token;
  return { ...rest, running: Boolean(lockUntil && Date.parse(lockUntil) > Date.now()) };
}
async function loadStatus(db: D1Database) {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1").bind(KEY).first<StatusRow>();
  return { raw: row?.valor ?? null, status: parseStatus(row?.valor ?? null) };
}
async function ensureStatus(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor, atualizado_por, atualizado_em) VALUES (?, ?, 'sistema', CURRENT_TIMESTAMP)")
    .bind(KEY, JSON.stringify(initialStatus())).run();
}
async function replaceStatus(db: D1Database, previous: string, next: StoredStatus) {
  const result = await db.prepare("UPDATE configuracoes SET valor = ?, atualizado_por = 'sistema', atualizado_em = CURRENT_TIMESTAMP WHERE chave = ? AND valor = ?")
    .bind(JSON.stringify(next), KEY, previous).run();
  return Number(result.meta?.changes || 0) === 1;
}

export async function getAutoSyncStatus(db: D1Database): Promise<AutoSyncStatus> {
  return publicStatus((await loadStatus(db)).status);
}

export async function setAutoSyncEnabled(db: D1Database, enabled: boolean): Promise<AutoSyncStatus> {
  await ensureStatus(db);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { raw, status } = await loadStatus(db);
    if (!raw) continue;
    const next: StoredStatus = { ...status, enabled, nextRunAt: enabled ? new Date(0).toISOString() : status.nextRunAt };
    if (await replaceStatus(db, raw, next)) return publicStatus(next);
  }
  throw new Error("Não foi possível alterar a sincronização automática. Tente novamente.");
}

async function automaticActorId(db: D1Database): Promise<number> {
  const runtime = getRuntimeEnv();
  const email = runtime.SYSTEM_OWNER_EMAIL?.trim().toLowerCase();
  const lockedBefore = Date.parse(runtime.SYSTEM_OWNER_LOCKED_BEFORE || "");
  if (!email || !Number.isFinite(lockedBefore)) throw new Error("A conta proprietária não está configurada.");
  const user = await db.prepare("SELECT id, criado_em FROM usuarios WHERE lower(email) = ? LIMIT 1")
    .bind(email).first<{ id: number; criado_em: string }>();
  if (!user || !Number.isSafeInteger(user.id) || user.id < 1 || Date.parse(user.criado_em) > lockedBefore) {
    throw new Error("A conta proprietária protegida não foi encontrada.");
  }
  return user.id;
}

async function reconcile(actorId: number): Promise<NonNullable<AutoSyncStatus["lastResult"]>> {
  const tenants = await loadSourceTenantCatalog();
  const tenantBefore = await previewTenantCatalog(tenants);
  if (tenantBefore.extraDestinationCount) throw new Error("Há comunidades extras no Supabase; revisão manual necessária.");
  if (!tenantBefore.ready) {
    await syncTenantCatalog(tenants, actorId);
    if (!(await previewTenantCatalog()).ready) throw new Error("A conferência das comunidades falhou após a atualização.");
  }

  const profiles = await loadSourceProfiles();
  const profileBefore = await previewProfiles(profiles);
  if (profileBefore.extraDestinationCount) throw new Error("Há perfis extras no Supabase; revisão manual necessária.");
  if (!profileBefore.ready) {
    await syncProfiles(profiles, actorId);
    if (!(await previewProfiles()).ready) throw new Error("A conferência dos perfis falhou após a atualização.");
  }

  const memberships = await loadSourceMemberships();
  const membershipBefore = await previewMemberships(memberships);
  if (membershipBefore.extraDestinationCount) throw new Error("Há vínculos extras no Supabase; revisão manual necessária.");
  if (!membershipBefore.ready) {
    await syncMemberships(memberships, actorId);
    if (!(await previewMemberships()).ready) throw new Error("A conferência dos vínculos falhou após a atualização.");
  }
  return {
    tenants: { source: tenants.length, destination: tenants.length, changed: tenantBefore.pendingCount },
    profiles: { source: profiles.length, destination: profiles.length, changed: profileBefore.pendingCount },
    memberships: { source: memberships.length, destination: memberships.length, changed: membershipBefore.pendingCount },
  };
}

/** Conciliação oportunista: após alterações relevantes e, com tráfego, a cada 5 minutos. */
export async function runAutoSyncIfDue(db: D1Database, options: { force?: boolean; actorId?: number } = {}): Promise<AutoSyncStatus> {
  const { raw, status } = await loadStatus(db);
  if (!status.enabled) return publicStatus(status);
  const now = Date.now();
  if (status.lockUntil && Date.parse(status.lockUntil) > now) return publicStatus(status);
  if (!options.force && status.nextRunAt && Date.parse(status.nextRunAt) > now) return publicStatus(status);
  if (options.force && !options.actorId && status.lastAttemptAt && now - Date.parse(status.lastAttemptAt) < WRITE_COOLDOWN_MS) return publicStatus(status);
  const integration = await readIntegration();
  if (!integration?.config.ativa || !integration.config.serviceRoleKey) return publicStatus(status);
  await ensureStatus(db);
  const current = raw === null ? await loadStatus(db) : { raw, status };
  if (!current.raw) return publicStatus(status);
  const locked: StoredStatus = { ...current.status, running: true, lockToken: crypto.randomUUID(),
    lockUntil: new Date(now + LOCK_MS).toISOString(), lastAttemptAt: new Date(now).toISOString(), lastError: null };
  if (!(await replaceStatus(db, current.raw, locked))) return getAutoSyncStatus(db);
  try {
    const result = await reconcile(options.actorId ?? await automaticActorId(db));
    const finished = new Date();
    const completed: StoredStatus = { ...locked, running: false, lockToken: null, lockUntil: null,
      lastSuccessAt: finished.toISOString(), nextRunAt: new Date(finished.getTime() + INTERVAL_MS).toISOString(),
      lastResult: result, lastError: null };
    await replaceStatus(db, JSON.stringify(locked), completed);
  } catch (error) {
    const failed = new Date();
    const message = error instanceof Error ? error.message : "Falha de sincronização indisponível.";
    const next: StoredStatus = { ...locked, running: false, lockToken: null, lockUntil: null,
      nextRunAt: new Date(failed.getTime() + RETRY_MS).toISOString(), lastError: message.slice(0, 240) };
    await replaceStatus(db, JSON.stringify(locked), next);
  }
  return getAutoSyncStatus(db);
}
