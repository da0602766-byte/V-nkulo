import { readIntegration } from "./supabase-integration";

const KEY = "supabase_profile_details_auto_sync";
type SavedPreference = { enabled: true; url: string; projectRef: string };

export async function getProfileDetailsAutoSyncEnabled(db: D1Database): Promise<boolean> {
  const integration = await readIntegration();
  if (!integration?.config.ativa || !integration.config.serviceRoleKey) return false;
  const row = await db.prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(KEY).first<{ valor: string }>();
  if (!row) return false;
  try {
    const saved = JSON.parse(row.valor) as Partial<SavedPreference>;
    return saved.enabled === true && saved.url === integration.config.url
      && saved.projectRef === integration.config.projectRef;
  } catch { return false; }
}

export async function setProfileDetailsAutoSyncEnabled(db: D1Database, enabled: boolean, actorId: number): Promise<void> {
  const integration = await readIntegration();
  if (enabled && (!integration?.config.ativa || !integration.config.serviceRoleKey)) {
    throw new Error("Ative a integração Supabase antes de ligar a cópia contínua dos dados cadastrais.");
  }
  const value = enabled && integration ? JSON.stringify({ enabled: true, url: integration.config.url,
    projectRef: integration.config.projectRef } satisfies SavedPreference) : JSON.stringify({ enabled: false });
  await db.prepare(`INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
    atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em`)
    .bind(KEY, value, String(actorId)).run();
}
