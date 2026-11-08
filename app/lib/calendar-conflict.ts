import type { getD1 } from '../../db';

/** Check the owner's authorized scheduling domain, independent of UI filters.
 * Only a boolean leaves this function; private details are never disclosed. */
export async function hasCalendarConflict(db:ReturnType<typeof getD1>,communityId:number,ownerId:number,start:string,end:string|null,source:'TAREFA'|'PESSOAL',id=0){
  return !!await db.prepare(`SELECT 1 AS ok FROM (
    SELECT inicia_em,COALESCE(termina_em,datetime(inicia_em,'+1 hour')) AS fim FROM agenda_tarefas WHERE comunidade_id=? AND responsavel_id=? AND id<>? AND status<>'CONCLUIDO'
    UNION ALL SELECT inicia_em,COALESCE(termina_em,datetime(inicia_em,'+1 hour')) FROM agenda_compromissos WHERE comunidade_id=? AND usuario_id=? AND id<>? AND concluido=0
    UNION ALL SELECT e.inicia_em,COALESCE(e.termina_em,datetime(e.inicia_em,'+1 hour')) FROM escala_designacoes d JOIN escalas_ministerio e ON e.id=d.escala_id AND e.comunidade_id=d.comunidade_id WHERE d.comunidade_id=? AND d.usuario_id=? AND d.ativo=1 AND d.status<>'INDISPONIVEL'
  ) WHERE datetime(inicia_em)<datetime(?) AND datetime(fim)>datetime(?) LIMIT 1`).bind(communityId,ownerId,source==='TAREFA'?id:0,communityId,ownerId,source==='PESSOAL'?id:0,communityId,ownerId,end||new Date(Date.parse(start)+3600000).toISOString(),start).first();
}
