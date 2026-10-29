import { readIntegration, reveal } from "./supabase-integration";

/** Reconcile only explicit, audited D1 deletions. Unknown extras still stop sync. */
export async function reconcileDeletedProfiles(db: D1Database, extraIds: number[]) {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) return;
  const secret = await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`);
  for (const id of extraIds) {
    if (!Number.isSafeInteger(id) || id < 1) continue;
    const deletion = await db.prepare(`SELECT a.criado_em FROM auditoria_piloto a
      WHERE a.evento = 'CONTA_EXCLUIDA_DEFINITIVAMENTE' AND a.resultado = 'SUCESSO'
        AND json_valid(a.metadados) AND json_extract(a.metadados, '$.usuarioId') = ?
        AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = ?)
      ORDER BY a.id DESC LIMIT 1`).bind(id, id).first<{ criado_em: string }>();
    if (!deletion) continue;
    const deletedAt = new Date(deletion.criado_em.replace(" ", "T") + "Z");
    if (!Number.isFinite(deletedAt.getTime())) continue;
    // Linked Auth accounts require their own revocation flow; never unlink them here.
    // Profile FKs cascade only to its membership and profile-detail copies.
    const query = new URLSearchParams({ legacy_d1_id: `eq.${id}`, auth_user_id: "is.null",
      created_at: `lte.${deletedAt.toISOString()}`, select: "legacy_d1_id" });
    const response = await fetch(`${saved.config.url}/rest/v1/vinkulo_profiles?${query}`, {
      method: "DELETE", headers: { apikey: secret, Authorization: `Bearer ${secret}`,
        "Accept-Profile": saved.config.schema, "Content-Profile": saved.config.schema, Prefer: "return=representation" },
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`O Supabase recusou a conciliação de contas excluídas (HTTP ${response.status}).`);
    }
    const removed = await response.json() as { legacy_d1_id: number }[];
    if (!Array.isArray(removed) || removed.some(item => Number(item.legacy_d1_id) !== id)) {
      throw new Error("O Supabase não confirmou a conciliação da conta excluída.");
    }
  }
}
