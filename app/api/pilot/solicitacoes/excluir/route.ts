import { getD1 } from '../../../../../db';
import { requireTenantPermission } from '../../../../lib/tenant';

export async function DELETE(request: Request) {
  const access=await requireTenantPermission('dashboard.view','requests');if('error' in access)return access.error;
  if(access.context.communityAccess==='FEED_ONLY')return Response.json({error:'Ação não permitida.'},{status:403});
  const body=await request.json().catch(()=>null),id=Number(body?.id);
  if(!Number.isSafeInteger(id)||id<=0)return Response.json({error:'Pedido inválido.'},{status:400});
  const db=getD1(),community=access.context.comunidadeId,user=access.user.id;
  const manager=access.context.permissions.some(permission=>['pastoral.panel.view','community.settings.manage','platform.admin.view','community.admin.view','requests.manage'].includes(permission));
  // Owners can remove their own requests. Managers must have recipient visibility
  // or access to the repository; a ministry leader is limited to their repository.
  const permitted=`s.id=? AND s.comunidade_id=? AND (s.solicitante_id=? OR
    (?=1 AND (EXISTS(SELECT 1 FROM solicitacao_destinatarios d WHERE d.solicitacao_id=s.id AND d.comunidade_id=s.comunidade_id AND d.usuario_id=?)
      OR NOT EXISTS(SELECT 1 FROM solicitacao_destinatarios d WHERE d.solicitacao_id=s.id))) OR
    EXISTS(SELECT 1 FROM solicitacao_repositorio_itens i JOIN solicitacao_repositorios r ON r.id=i.repositorio_id AND r.comunidade_id=i.comunidade_id
      LEFT JOIN ministerios_comunidade m ON m.id=r.ministerio_id AND m.comunidade_id=r.comunidade_id
      WHERE i.solicitacao_id=s.id AND i.comunidade_id=s.comunidade_id AND r.status='ATIVO' AND (?=1 OR (m.status='ATIVO' AND m.responsavel_usuario_id=?))))`;
  const bindings=[id,community,user,manager?1:0,user,manager?1:0,user];
  const row=await db.prepare(`SELECT s.id FROM solicitacoes_comunidade s WHERE ${permitted}`).bind(...bindings).first();
  if(!row)return Response.json({error:'Pedido não encontrado ou sem permissão para excluir.'},{status:404});
  // Deletion and audit are committed together. Related audiences, events and
  // repository items use ON DELETE CASCADE, without affecting other requests.
  const results=await db.batch([
    db.prepare(`INSERT INTO auditoria_piloto(comunidade_id,usuario_id,evento,resultado,metadados) SELECT ?,?,'SOLICITACAO_EXCLUIDA','SUCESSO',? WHERE EXISTS(SELECT 1 FROM solicitacoes_comunidade s WHERE ${permitted})`).bind(community,user,JSON.stringify({solicitacaoId:id}),...bindings),
    db.prepare(`DELETE FROM solicitacoes_comunidade WHERE id IN (SELECT s.id FROM solicitacoes_comunidade s WHERE ${permitted})`).bind(...bindings),
  ]);
  return results[1].meta.changes?Response.json({ok:true}):Response.json({error:'O pedido já foi excluído.'},{status:409});
}
