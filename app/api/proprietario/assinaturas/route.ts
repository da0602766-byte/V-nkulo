import { getD1 } from '../../../../db';
import { requireGlobalOwner } from '../../../lib/access-security';
import { validatePlan } from '../../../lib/commerce-types';
export async function PATCH(request:Request){
 const access=await requireGlobalOwner();if('error' in access)return access.error;
 try{const body=await request.json();const plan=validatePlan(body.plan);const id=Number(body.comunidadeId);const status=String(body.status);const basis=String(body.fundamento);const reference=String(body.referencia||'').trim();
  if(!Number.isSafeInteger(id)||id<1||!['ATIVA','SUSPENSA','ENCERRADA'].includes(status)||!['GRATUITO','CONFIRMACAO_EXTERNA','ISENCAO'].includes(basis)||reference.length<8||reference.length>500||(basis==='GRATUITO'&&plan.valor_centavos!==0)||plan.valor_centavos===null)throw new Error('Revise status, preço, fundamento e referência.');
  const db=getD1();const result=await db.batch([
   db.prepare(`INSERT INTO assinaturas_comunidade(comunidade_id,plano_id,contrato,status,fundamento,referencia,aprovado_por,termina_em)
     SELECT c.id,?,?,?,?,?,?,? FROM comunidades c WHERE c.id=? AND c.status='ATIVA'
       AND EXISTS(SELECT 1 FROM planos_plataforma p WHERE p.id=? AND (p.ativo=1 OR EXISTS(SELECT 1 FROM assinaturas_comunidade WHERE comunidade_id=c.id)))
     ON CONFLICT(comunidade_id) DO UPDATE SET plano_id=excluded.plano_id,contrato=excluded.contrato,status=excluded.status,fundamento=excluded.fundamento,
       referencia=excluded.referencia,aprovado_por=excluded.aprovado_por,atualizado_em=CURRENT_TIMESTAMP,
       termina_em=CASE WHEN json_extract(assinaturas_comunidade.contrato,'$.duracao_dias') IS json_extract(excluded.contrato,'$.duracao_dias')
         THEN assinaturas_comunidade.termina_em ELSE excluded.termina_em END`)
    .bind(plan.id,JSON.stringify(plan),status,basis,reference,access.user.id,plan.duracao_dias?new Date(Date.now()+plan.duracao_dias*86400000).toISOString():null,id,plan.id),
   db.prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) SELECT ?,?,'ASSINATURA_ALTERADA','SUCESSO',? WHERE changes()=1`).bind(id,access.user.id,JSON.stringify({planoId:plan.id,status,fundamento:basis,motivo:reference})),
  ]);if(!result[0].meta.changes)return Response.json({error:'Selecione uma comunidade ativa e um plano configurado.'},{status:404});return Response.json({ok:true});
 }catch(error){return Response.json({error:error instanceof Error&&!/SQL|D1|constraint/i.test(error.message)?error.message:'Configuração inválida.'},{status:400});}
}
