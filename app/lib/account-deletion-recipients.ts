import type { getD1 } from "../../db";

/** Keep each SELECT independent: production D1 limits compound SELECT terms. */
export async function accountDeletionRecipients(db: ReturnType<typeof getD1>, userId: number, cell: string) {
  const communityQueries = [
    ["SELECT comunidade_id FROM usuario_comunidades WHERE usuario_id = ?", [userId]],
    ["SELECT comunidade_id FROM ministerio_voluntarios WHERE usuario_id = ?", [userId]],
    ["SELECT comunidade_id FROM escala_designacoes WHERE usuario_id = ?", [userId]],
    ["SELECT comunidade_id FROM celulas WHERE lider_usuario_id = ? OR vice_lider_usuario_id = ?", [userId,userId]],
    ["SELECT id AS comunidade_id FROM comunidades WHERE proprietario_usuario_id = ? OR pastor_responsavel_usuario_id = ?", [userId,userId]],
    ["SELECT comunidade_id FROM ministerios_comunidade WHERE responsavel_usuario_id = ?", [userId]],
    ["SELECT comunidade_id FROM escalas_ministerio WHERE responsavel_usuario_id = ?", [userId]],
    ["SELECT comunidade_id FROM visitante_categorias WHERE responsavel_usuario_id = ?", [userId]],
  ] as const;
  const communities = await db.batch<{comunidade_id:number}>(communityQueries.map(([sql,args]) => db.prepare(sql).bind(...args)));
  const ids = JSON.stringify([...new Set(communities.flatMap(result => (result.results || []).map(row => row.comunidade_id)).filter(Boolean))]);
  const queries: [string, (number|string)[]][] = [
    ["SELECT usuario_id, comunidade_id FROM usuario_comunidades WHERE comunidade_id IN (SELECT value FROM json_each(?)) AND status='ATIVO' AND papel IN ('PASTOR','ADMIN_COMUNIDADE','SUPERADMIN')", [ids]],
    ["SELECT m.responsavel_usuario_id AS usuario_id,m.comunidade_id FROM ministerios_comunidade m JOIN ministerio_voluntarios v ON v.ministerio_id=m.id AND v.comunidade_id=m.comunidade_id WHERE v.usuario_id=? AND v.ativo=1", [userId]],
    ["SELECT l.usuario_id,l.comunidade_id FROM ministerio_voluntarios l JOIN ministerio_voluntarios v ON v.ministerio_id=l.ministerio_id AND v.comunidade_id=l.comunidade_id WHERE v.usuario_id=? AND v.ativo=1 AND l.ativo=1 AND l.papel='LIDER'", [userId]],
    ["SELECT COALESCE(e.responsavel_usuario_id,e.atualizado_por,e.criado_por) AS usuario_id,e.comunidade_id FROM escalas_ministerio e JOIN escala_designacoes d ON d.escala_id=e.id AND d.comunidade_id=e.comunidade_id WHERE d.usuario_id=? AND d.ativo=1", [userId]],
    ...["lider_usuario_id", "vice_lider_usuario_id"].map(column => [`SELECT ${column} AS usuario_id,comunidade_id FROM celulas WHERE comunidade_id IN (SELECT value FROM json_each(?)) AND (nome=? OR lider_usuario_id=? OR vice_lider_usuario_id=?)`, [ids,cell,userId,userId]] as [string,(number|string)[]]),
    ...["proprietario_usuario_id", "pastor_responsavel_usuario_id"].map(column => [`SELECT ${column} AS usuario_id,id AS comunidade_id FROM comunidades WHERE id IN (SELECT value FROM json_each(?))`, [ids]] as [string,(number|string)[]]),
  ];
  const rows = await db.batch<{usuario_id:number;comunidade_id:number}>(queries.map(([sql,args]) => db.prepare(sql).bind(...args)));
  const recipients = [...new Map(rows.flatMap(result => result.results || []).filter(row => row.usuario_id && row.usuario_id !== userId).map(row => [`${row.usuario_id}:${row.comunidade_id}`,row])).values()];
  const active = await db.prepare(`SELECT DISTINCT uc.usuario_id,uc.comunidade_id FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id
    JOIN json_each(?) j ON uc.usuario_id=json_extract(j.value,'$.usuario_id') AND uc.comunidade_id=json_extract(j.value,'$.comunidade_id')
    WHERE u.ativo=1 AND uc.status='ATIVO'`).bind(JSON.stringify(recipients)).all<{usuario_id:number;comunidade_id:number}>();
  return active.results;
}
