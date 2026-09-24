import { getD1 } from '../../../../db';
import { requireGlobalOwner, secureToken } from '../../../lib/access-security';
import { sha256 } from '../../../lib/local-auth';
import { listCommercialPlans } from '../../../lib/commerce';
import { validatePlan } from '../../../lib/commerce-types';
import { activateCommunity } from '../../../lib/activate-community';
import { purgeAccessRequests } from '../../../lib/access-retention';

export async function GET() {
  const access=await requireGlobalOwner(); if('error' in access) return access.error;
  const db=getD1();
  await purgeAccessRequests(db);
  const rows=await db.prepare(`SELECT s.id,s.protocolo,s.nome,s.telefone,s.nascimento,s.cpf_finais,s.status,s.criado_em,s.atualizado_em,s.email,s.comunidade_nome,
    s.comunidade_id,s.planos_permitidos,s.proposta,s.contrato,s.observacao,u.nome AS responsavel,p.nome AS plano,
    (SELECT MAX(expira_em) FROM links_contratacao WHERE solicitacao_id=s.id AND revogado_em IS NULL AND usado_em IS NULL) AS link_expira_em
    FROM solicitacoes_log1 s LEFT JOIN usuarios u ON u.id=s.responsavel_id LEFT JOIN planos_plataforma p ON p.id=s.plano_id ORDER BY s.id DESC LIMIT 300`).all();
  return Response.json({requests:rows.results,plans:await listCommercialPlans()});
}
export async function PATCH(request:Request) {
  const access=await requireGlobalOwner(); if('error' in access) return access.error;
  const body=await request.json().catch(()=>null);const id=Number(body?.id); const action=String(body?.action||'');
  if(!Number.isSafeInteger(id)||id<=0) return Response.json({error:'Solicitação inválida.'},{status:400});
  const db=getD1();
  const row=await db.prepare('SELECT status FROM solicitacoes_log1 WHERE id=?').bind(id).first<{status:string}>();
  if(!row) return Response.json({error:'Solicitação não encontrada.'},{status:404});
  try {
    if(action==='ATIVAR') return Response.json(await activateCommunity(id,access.user.id,String(body.fundamento||''),String(body.referencia||'')));
    if(['ATIVADA','RECUSADA'].includes(row.status)) throw new Error('Esta solicitação já foi encerrada.');
    if(action==='GERAR_LINK') {
      if(row.status==='CONTRATADA') throw new Error('A contratação já foi enviada para aprovação.');
      const plans=await listCommercialPlans(); const ids=Array.isArray(body.planos) ? [...new Set(body.planos.map(String))] : [];
      if(!ids.length || ids.some(id=>!plans.some(p=>p.id===id&&p.ativo&&p.contratavel))) throw new Error('Selecione planos ativos e disponíveis para contratação.');
      const proposal=body.proposta ? validatePlan(body.proposta) : null;
      if(ids.some(id=>plans.find(p=>p.id===id)?.personalizado && (!proposal || proposal.id!==id || proposal.valor_centavos===null))) throw new Error('Defina as condições do plano personalizado.');
      const hours=Number(body.horas||48); if(!Number.isInteger(hours)||hours<1||hours>168) throw new Error('O prazo deve ser de 1 a 168 horas.');
      const token=secureToken();const actionKey=secureToken();const expiresAt=new Date(Date.now()+hours*3600000).toISOString();
      const results=await db.batch([
        db.prepare(`UPDATE solicitacoes_log1 SET status='LINK_GERADO',planos_permitidos=?,proposta=?,responsavel_id=?,ativacao_chave=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND status IN ('NOVA','EM_ANALISE','LINK_GERADO','EXPIRADA') AND datetime(retencao_ate)>CURRENT_TIMESTAMP`)
          .bind(JSON.stringify(ids),proposal?JSON.stringify(proposal):null,access.user.id,actionKey,id),
        db.prepare(`UPDATE links_contratacao SET revogado_em=CURRENT_TIMESTAMP WHERE solicitacao_id=? AND usado_em IS NULL AND revogado_em IS NULL
          AND EXISTS(SELECT 1 FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?)`).bind(id,id,actionKey),
        db.prepare(`INSERT INTO links_contratacao(solicitacao_id,token_hash,expira_em,criado_por) SELECT id,?,?,? FROM solicitacoes_log1 WHERE id=? AND status='LINK_GERADO' AND ativacao_chave=?`).bind(await sha256(token),expiresAt,access.user.id,id,actionKey),
        db.prepare(`INSERT INTO auditoria_piloto(usuario_id,evento,resultado,metadados) SELECT ?,'CONTRATACAO_LINK_GERADO','SUCESSO',? FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?`).bind(access.user.id,JSON.stringify({solicitacaoId:id,expiresAt}),id,actionKey),
      ]);
      if(!results[0].meta.changes) throw new Error('A solicitação mudou. Recarregue.');
      return Response.json({ok:true,url:new URL(`/contratacao/${token}`,request.url).toString(),expiresAt});
    }
    if(!['ANALISAR','RECUSAR','REVOGAR'].includes(action)) throw new Error('Ação inválida.');
    const status=action==='RECUSAR'?'RECUSADA':'EM_ANALISE';const actionKey=secureToken();
    const results=await db.batch([
      db.prepare(`UPDATE solicitacoes_log1 SET status=?,observacao=?,responsavel_id=?,ativacao_chave=?,atualizado_em=CURRENT_TIMESTAMP,
        senha_hash=CASE WHEN ?='RECUSADA' THEN NULL ELSE senha_hash END,senha_salt=CASE WHEN ?='RECUSADA' THEN NULL ELSE senha_salt END
        WHERE id=? AND status NOT IN ('ATIVADA','RECUSADA') AND (?='RECUSAR' OR status!='CONTRATADA') AND datetime(retencao_ate)>CURRENT_TIMESTAMP`)
        .bind(status,String(body.observacao||'').slice(0,1000),access.user.id,actionKey,status,status,id,action),
      db.prepare(`UPDATE links_contratacao SET revogado_em=CURRENT_TIMESTAMP WHERE solicitacao_id=? AND usado_em IS NULL AND revogado_em IS NULL
        AND EXISTS(SELECT 1 FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?)`).bind(id,id,actionKey),
      db.prepare(`INSERT INTO auditoria_piloto(usuario_id,evento,resultado,metadados) SELECT ?,?, 'SUCESSO',? FROM solicitacoes_log1 WHERE id=? AND ativacao_chave=?`).bind(access.user.id,`LOG1_${action}`,JSON.stringify({solicitacaoId:id}),id,actionKey),
    ]);
    if(!results[0].meta.changes) throw new Error('A solicitação mudou ou já tem contratação. Recarregue.');
    return Response.json({ok:true});
  } catch(error) {const message=error instanceof Error?error.message:'';return Response.json({error:/SQL|constraint|UNIQUE|D1/i.test(message)?'Não foi possível ativar. Confira vínculos, CPF e limites do plano.':message||'Não foi possível concluir.'},{status:409});}
}
