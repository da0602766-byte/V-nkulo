import { getD1 } from "../../db";
import { readIntegration, reveal } from "./supabase-integration";

const KEY = "supabase_auth_link_policy";
const LEASE_PREFIX = "supabase_auth_link_lease:";
type Policy = { enabled: boolean; url: string; projectRef: string };
type Project = { url: string; projectRef: string; schema: string; secret: string };
type State = { profile_id: string; profile_email: string; linked_user_id: string | null;
  candidate_user_id: string | null; candidate_email: string | null;
  candidate_legacy_id: string | null; candidate_count: number };

export class AuthLinkError extends Error {
  constructor(message: string, public readonly code: "CONFLICT" | "UNAVAILABLE" | "SCHEMA" | "REJECTED") { super(message); }
}

export async function getAuthLinkEnabled(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave=? LIMIT 1").bind(KEY).first<{ valor: string }>();
  if (!row) return false;
  let policy: Policy;
  try { policy = JSON.parse(row.valor) as Policy; }
  catch { return false; }
  if (policy.enabled !== true) return false;
  const saved = await readIntegration();
  return Boolean(saved?.config.ativa && saved.config.serviceRoleKey && saved.config.url === policy.url
    && saved.config.projectRef === policy.projectRef);
}

export async function setAuthLinkEnabled(db: D1Database, enabled: boolean, actorId: number) {
  const saved = await readIntegration();
  if (enabled && (!saved?.config.ativa || !saved.config.serviceRoleKey)) {
    throw new AuthLinkError("Ative a integração protegida antes de vincular contas Auth.", "REJECTED");
  }
  const policy: Policy = { enabled, url: saved?.config.url || "", projectRef: saved?.config.projectRef || "" };
  await db.prepare(`INSERT INTO configuracoes(chave,valor,atualizado_por,atualizado_em)
    VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chave) DO UPDATE SET
    valor=excluded.valor,atualizado_por=excluded.atualizado_por,atualizado_em=excluded.atualizado_em`)
    .bind(KEY, JSON.stringify(policy), String(actorId)).run();
}

export async function activeAuthLinkLeases(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS total FROM configuracoes
    WHERE chave LIKE ? AND datetime(atualizado_em) > datetime('now','-2 minutes')`)
    .bind(`${LEASE_PREFIX}%`).first<{ total: number }>();
  return Number(row?.total || 0);
}

async function project(): Promise<Project> {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) throw new AuthLinkError("A integração Supabase está inativa.", "UNAVAILABLE");
  return { url: saved.config.url, projectRef: saved.config.projectRef, schema: saved.config.schema,
    secret: await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`) };
}

async function request(target: Project, path: string, body: Record<string, unknown>, auth = false, method = "POST") {
  const saved = await readIntegration();
  if (!saved?.config.ativa || saved.config.url !== target.url || saved.config.projectRef !== target.projectRef) {
    throw new AuthLinkError("A configuração Supabase mudou durante o vínculo.", "UNAVAILABLE");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${target.url}${auth ? "/auth/v1" : "/rest/v1"}${path}`, {
      method, headers: { apikey: target.secret, Authorization: `Bearer ${target.secret}`,
        "Content-Type": "application/json", ...(!auth ? { "Accept-Profile": target.schema, "Content-Profile": target.schema } : {}) },
      body: JSON.stringify(body), cache: "no-store", redirect: "manual", signal: controller.signal,
    });
    if (!response.ok) throw new AuthLinkError(response.status === 404
      ? "Aplique a migração SQL 0010 antes de vincular contas Auth."
      : response.status === 422 || response.status === 409
        ? "Uma conta Auth existente precisa de revisão antes do vínculo."
        : "O Supabase recusou a vinculação da conta.",
      response.status === 404 ? "SCHEMA" : response.status === 422 || response.status === 409 ? "CONFLICT" : "REJECTED");
    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof AuthLinkError) throw error;
    throw new AuthLinkError("O Supabase não respondeu à vinculação Auth.", "UNAVAILABLE");
  } finally { clearTimeout(timer); }
}

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function authLinkState(userId: number, targetInput?: Project): Promise<State> {
  const target = targetInput ?? await project();
  const result = await request(target, "/rpc/vinkulo_auth_link_state", { legacy_user_id: userId });
  const rows = Array.isArray(result) ? result : null;
  const row = rows?.[0] as Partial<State> | undefined;
  if (!row || rows?.length !== 1 || !uuid(row.profile_id) || typeof row.profile_email !== "string"
    || !Number.isSafeInteger(Number(row.candidate_count)) || Number(row.candidate_count) < 0
    || row.linked_user_id != null && !uuid(row.linked_user_id)
    || row.candidate_user_id != null && !uuid(row.candidate_user_id)) {
    throw new AuthLinkError("O Supabase devolveu um estado Auth incompatível.", "REJECTED");
  }
  return { profile_id: row.profile_id, profile_email: row.profile_email,
    linked_user_id: row.linked_user_id || null, candidate_user_id: row.candidate_user_id || null,
    candidate_email: row.candidate_email || null, candidate_legacy_id: row.candidate_legacy_id || null,
    candidate_count: Number(row.candidate_count) };
}

function verifiedCandidate(state: State, userId: number, email: string) {
  if (state.candidate_count !== 1 || !state.candidate_user_id
    || state.candidate_legacy_id !== String(userId)
    || state.candidate_email?.toLowerCase() !== email.toLowerCase()
    || state.profile_email.toLowerCase() !== email.toLowerCase()
    || state.linked_user_id && state.linked_user_id !== state.candidate_user_id) {
    throw new AuthLinkError("A conta Auth existente não corresponde ao cadastro. Revise o conflito.", "CONFLICT");
  }
  return state.candidate_user_id;
}

async function link(target: Project, userId: number, authId: string) {
  const result = await request(target, "/rpc/vinkulo_link_auth_profile", {
    legacy_user_id: userId, new_auth_user_id: authId,
  });
  if (!Array.isArray(result) || result.length !== 1 || result[0]?.linked !== true) {
    throw new AuthLinkError("O Supabase não confirmou o vínculo Auth.", "REJECTED");
  }
}

/** Chamado somente após o D1 validar CPF e senha; nunca altera a sessão atual. */
export async function linkAuthAfterVerifiedLogin(userId: number, email: string, password: string): Promise<"SKIPPED" | "LINKED" | "UPDATED"> {
  const db = getD1();
  if (!(await getAuthLinkEnabled(db))) return "SKIPPED";
  const lease = `${LEASE_PREFIX}${crypto.randomUUID()}`;
  await db.prepare("INSERT INTO configuracoes(chave,valor,atualizado_por,atualizado_em) VALUES(?, '1', 'sistema', CURRENT_TIMESTAMP)")
    .bind(lease).run();
  try {
    if (!(await getAuthLinkEnabled(db))) return "SKIPPED";
    const target = await project();
    let state = await authLinkState(userId, target);
    if (state.profile_email.toLowerCase() !== email.toLowerCase()) {
      throw new AuthLinkError("O e-mail do perfil Supabase diverge do D1.", "CONFLICT");
    }
    let authId: string;
    let created = false;
    if (state.candidate_count === 0 && !state.linked_user_id) {
      try {
        const response = await request(target, "/admin/users", { email, password, email_confirm: true,
          app_metadata: { vinkulo_legacy_d1_id: String(userId) } }, true);
        const user = (response as { user?: { id?: unknown }; id?: unknown });
        authId = String(user.user?.id || user.id || "");
        if (!uuid(authId)) throw new AuthLinkError("O Supabase não confirmou a nova conta Auth.", "REJECTED");
        created = true;
      } catch (error) {
        if (!(error instanceof AuthLinkError) || error.code !== "CONFLICT") throw error;
        // Uma tentativa concorrente pode ter criado a conta antes desta.
        state = await authLinkState(userId, target);
        authId = verifiedCandidate(state, userId, email);
      }
    } else {
      authId = verifiedCandidate(state, userId, email);
    }
    if (!created) await request(target, `/admin/users/${authId}`, { password, email_confirm: true }, true, "PUT");
    await link(target, userId, authId);
    return created ? "LINKED" : "UPDATED";
  } finally {
    await db.prepare("DELETE FROM configuracoes WHERE chave=?").bind(lease).run().catch(() => {});
  }
}
