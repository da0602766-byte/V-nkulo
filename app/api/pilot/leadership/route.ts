import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";

export async function GET() {
  const access = await requireTenantPermission("leadership.panel.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const [leaders, history] = await Promise.all([
    db
      .prepare(
        `SELECT uc.id AS membership_id, u.id AS usuario_id, u.nome, u.email,
          u.foto_perfil, uc.papel, COALESCE(oc.titulo, '') AS titulo
         FROM usuario_comunidades uc
         JOIN usuarios u ON u.id = uc.usuario_id AND u.ativo = 1
         LEFT JOIN oficiais_comunidade oc
           ON oc.usuario_comunidade_id = uc.id
         WHERE uc.comunidade_id = ? AND uc.status = 'ATIVO'
           AND uc.papel IN ('LIDER', 'PASTOR', 'ADMIN_COMUNIDADE', 'SUPERADMIN')
           AND (? <> 'LIDER' OR uc.usuario_id = ?)
         ORDER BY CASE uc.papel
           WHEN 'PASTOR' THEN 0 WHEN 'ADMIN_COMUNIDADE' THEN 1 ELSE 2 END,
           u.nome`,
      )
      .bind(
        access.context.comunidadeId,
        access.context.papel,
        access.context.userId,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT a.id, a.evento, a.resultado, a.metadados, a.criado_em,
          u.nome AS autor_nome
         FROM auditoria_piloto a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.comunidade_id = ?
           AND (? <> 'LIDER' OR a.usuario_id = ?)
           AND a.evento IN (
             'OFICIAL_COMUNIDADE_ATUALIZADO',
             'PERFIL_DA_COMUNIDADE_ATUALIZADO',
             'TEMA_DA_COMUNIDADE_ATUALIZADO',
             'PROPRIETARIO_REMOVEU_MEMBRO_DA_COMUNIDADE'
           )
         ORDER BY a.criado_em DESC, a.id DESC
         LIMIT 30`,
      )
      .bind(
        access.context.comunidadeId,
        access.context.papel,
        access.context.userId,
      )
      .all<Record<string, unknown>>(),
  ]);
  return Response.json(
    {
      leaders: leaders.results,
      history: history.results,
      canManage: access.context.permissions.includes("officials.manage"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
