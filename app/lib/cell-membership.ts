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
