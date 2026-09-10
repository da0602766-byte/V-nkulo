import type { getD1 } from "../../db";
import type { TenantContext } from "./tenant";

type D1Database = ReturnType<typeof getD1>;

// Mesma régua que a rota PATCH da célula aplica: mexe no perfil quem lidera
// aquela célula (líder ou vice) ou quem responde pela gestão pastoral da
// comunidade. Fica isolada aqui porque o envio de imagem acontece em outra
// rota e precisa da mesma resposta.
export async function canOperateCell(
  db: D1Database,
  context: TenantContext,
  userId: number,
  cellId: number,
) {
  if (!context.permissions.includes("cells.view")) return false;
  const cell = await db
    .prepare(
      `SELECT lider_usuario_id, vice_lider_usuario_id FROM celulas
       WHERE id = ? AND comunidade_id = ? AND escopo_confirmado = 1`,
    )
    .bind(cellId, context.comunidadeId)
    .first<{ lider_usuario_id: number | null; vice_lider_usuario_id: number | null }>();
  if (!cell) return false;
  return (
    context.permissions.includes("cells.manage") ||
    cell.lider_usuario_id === userId ||
    cell.vice_lider_usuario_id === userId
  );
}
