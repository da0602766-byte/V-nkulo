import { getD1 } from '../../../../db';
import { requireGlobalOwner } from '../../../lib/access-security';
import { listCommercialPlans } from '../../../lib/commerce';
import { validatePlan } from '../../../lib/commerce-types';

export async function GET() {
  const access=await requireGlobalOwner(); if('error' in access) return access.error;
  const subscriptions=await getD1().prepare(`SELECT s.*,c.nome AS comunidade_nome,p.nome AS plano_nome FROM assinaturas_comunidade s JOIN comunidades c ON c.id=s.comunidade_id JOIN planos_plataforma p ON p.id=s.plano_id ORDER BY c.nome`).all();
  const unassigned=await getD1().prepare(`SELECT c.id,c.nome FROM comunidades c LEFT JOIN assinaturas_comunidade s ON s.comunidade_id=c.id WHERE s.comunidade_id IS NULL AND c.status='ATIVA' ORDER BY c.nome`).all();
  return Response.json({plans:await listCommercialPlans(),subscriptions:subscriptions.results,unassigned:unassigned.results});
}
export async function PUT(request:Request) {
  const access=await requireGlobalOwner(); if('error' in access) return access.error;
  try {
    const p=validatePlan(await request.json()); const db=getD1();
    const result=await db.batch([
      db.prepare(`INSERT INTO planos_plataforma(id,nome,descricao,valor_centavos,periodicidade,duracao_dias,ativo,contratavel,destaque,personalizado,modulos,recursos,limites,condicoes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,descricao=excluded.descricao,valor_centavos=excluded.valor_centavos,
        periodicidade=excluded.periodicidade,duracao_dias=excluded.duracao_dias,ativo=excluded.ativo,contratavel=excluded.contratavel,destaque=excluded.destaque,
        personalizado=excluded.personalizado,modulos=excluded.modulos,recursos=excluded.recursos,limites=excluded.limites,condicoes=excluded.condicoes,versao=versao+1,atualizado_em=CURRENT_TIMESTAMP
        WHERE versao=?`).bind(p.id,p.nome,p.descricao,p.valor_centavos,p.periodicidade,p.duracao_dias,Number(p.ativo),Number(p.contratavel),Number(p.destaque),Number(p.personalizado),JSON.stringify(p.modulos),JSON.stringify(p.recursos),JSON.stringify(p.limites),p.condicoes,p.versao),
      db.prepare(`INSERT INTO auditoria_piloto(usuario_id,evento,resultado,metadados) SELECT ?,'PLANO_CONFIGURADO','SUCESSO',? WHERE changes()=1`).bind(access.user.id,JSON.stringify({planoId:p.id})),
    ]);
    if(!result[0].meta.changes) return Response.json({error:'O plano mudou. Recarregue antes de salvar.'},{status:409});
    return Response.json({ok:true,plans:await listCommercialPlans()});
  } catch(error) { return Response.json({error:error instanceof Error ? error.message : 'Configuração inválida.'},{status:400}); }
}
