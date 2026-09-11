import type { getD1 } from "../../db";
import type { TenantContext } from "./tenant";

type D1Database = ReturnType<typeof getD1>;

/**
 * Quem pode editar os dados de uma célula específica (Configurações, foto de
 * capa): a gestão pastoral (permissão `cells.manage`) para qualquer célula
 * da comunidade, o criador, ou o líder/vice-líder daquela célula. Mesma regra já usada
 * em app/api/pilot/celulas/[id]/route.ts (variável `operator`), reaproveitada
 * aqui para o upload de imagens.
 */
export async function canManageCell(
  db: D1Database,
  context: TenantContext,
  userId: number,
  cellId: number,
  userEmail: string,
): Promise<boolean> {
  const cell = await db
    .prepare(
      `SELECT id FROM celulas
       WHERE id = ? AND comunidade_id = ? AND escopo_confirmado = 1
         AND (? = 1 OR lider_usuario_id = ? OR vice_lider_usuario_id = ? OR lower(criado_por) = lower(?))`,
    )
    .bind(
      cellId,
      context.comunidadeId,
      context.permissions.includes("cells.manage") ? 1 : 0,
      userId,
      userId,
      userEmail,
    )
    .first<{ id: number }>();
  return Boolean(cell);
}

function parseMembers(value?: string | null) {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

async function updateMembers(db: D1Database, cellId: number, updater: (members: string[]) => string[]) {
  const cell = await db.prepare("SELECT membros FROM celulas WHERE id = ?").bind(cellId).first<{ membros: string }>();
  if (!cell) return;
  const next = updater(parseMembers(cell.membros));
  await db.prepare("UPDATE celulas SET membros = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(JSON.stringify([...new Set(next.filter(Boolean))]), cellId).run();
}

export async function syncVisitorCell(db: D1Database, previous: { cellId?: number | null; name?: string | null }, next: { cellId?: number | null; name?: string | null }) {
  if (previous.cellId && previous.name) {
    await updateMembers(db, previous.cellId, (members) => members.filter((name) => name.toLocaleLowerCase("pt-BR") !== previous.name!.toLocaleLowerCase("pt-BR")));
  }
  if (next.cellId && next.name) {
    await updateMembers(db, next.cellId, (members) => [...members, next.name!]);
  }
}
