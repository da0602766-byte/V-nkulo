import type { getD1 } from "../../db";
export async function loadFeedPrayers(db:ReturnType<typeof getD1>,communityId:number,userId:number) {
 const rows=await db.prepare(`SELECT s.id,s.titulo,s.descricao,s.criado_em,s.atualizado_em,
 COALESCE(ri.status,s.status) AS status,
 COALESCE((SELECT e.mensagem FROM solicitacao_eventos e WHERE e.solicitacao_id=s.id AND e.comunidade_id=s.comunidade_id AND e.visivel_membro=1 ORDER BY e.id DESC LIMIT 1),'') AS atualizacao
 FROM solicitacoes_comunidade s LEFT JOIN solicitacao_repositorio_itens ri ON ri.solicitacao_id=s.id AND ri.comunidade_id=s.comunidade_id
 WHERE s.comunidade_id=? AND s.solicitante_id=? AND s.tipo='ORACAO' ORDER BY s.id DESC LIMIT 6`).bind(communityId,userId).all<Record<string,unknown>>();
 return {communityId,userId,items:rows.results.slice(0,5),hasMore:rows.results.length>5};
}
