import { readIntegration } from "./supabase-integration";

const KEY = "supabase_profile_details_copy";
type CopyState = { possibleCopies: true; url: string; projectRef: string };

export async function hasTrackedProfileDetails(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(KEY).first<{ valor: string }>();
  if (!row) return false;
  try { return (JSON.parse(row.valor) as Partial<CopyState>).possibleCopies === true; }
  catch { return true; }
}

export async function markProfileDetailsCopy(db: D1Database, actorId: number): Promise<void> {
  const integration = await readIntegration();
  if (!integration?.config.ativa || !integration.config.serviceRoleKey) throw new Error("A integração Supabase está inativa.");
  const state: CopyState = { possibleCopies: true, url: integration.config.url, projectRef: integration.config.projectRef };
  const existing = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(KEY).first<{ valor: string }>();
  if (existing) {
    let saved: CopyState;
    try { saved = JSON.parse(existing.valor) as CopyState; }
    catch { throw new Error("O registro local da cópia cadastral precisa de revisão."); }
    if (!saved.possibleCopies || saved.url !== state.url || saved.projectRef !== state.projectRef) {
      throw new Error("A cópia cadastral pertence a outra configuração Supabase. Revise antes de continuar.");
    }
    return;
  }
  await db.prepare(`INSERT OR IGNORE INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).bind(KEY, JSON.stringify(state), String(actorId)).run();
  const confirmed = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(KEY).first<{ valor: string }>();
  if (confirmed?.valor !== JSON.stringify(state)) throw new Error("A cópia cadastral concorrente precisa de revisão.");
}

export async function clearProfileDetailsCopyState(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM configuracoes WHERE chave = ?").bind(KEY).run();
}
