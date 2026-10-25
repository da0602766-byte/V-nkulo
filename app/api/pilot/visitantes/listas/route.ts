import {getSessionUser} from '../../../../lib/local-auth';
import {getActiveTenantContext,listTenantMemberships} from '../../../../lib/tenant';
import {platformDB} from '../../../../lib/visitor-drive-store';
import type {VisitorListEntry} from '../../../../lib/visitor-list-directory';

export async function GET(){
  const user=await getSessionUser();
  if(!user)return Response.json({error:'Faça login para continuar.'},{status:401});
  if(!user.ativo)return Response.json({error:'Usuário inativo.'},{status:403});
  const memberships=await listTenantMemberships(user),lists:VisitorListEntry[]=[];
  // Metadata only: do not attach Drive runtimes or read anyone's contacts here.
  for(const membership of memberships){
    const {context}=await getActiveTenantContext(user,{communityId:membership.comunidadeId,attachDrive:false});
    if(!context)continue;
    const common={communityId:context.comunidadeId,communityName:context.comunidadeNome};
    if(context.visitorPersonalAccess)lists.push({...common,id:'pessoal:'+context.comunidadeId,kind:'pessoal',title:'Minha lista pessoal',ownerName:user.nome,sharedByName:null,access:'EDIT',own:true,href:'/painel/visitantes?lista=pessoal&section=pessoas&comunidade='+context.comunidadeId});
    if(!context.permissions.includes('visitors.view'))continue;
    const info=await platformDB().prepare(`SELECT COALESCE(d.usuario_id,c.proprietario_usuario_id) owner_id,
      o.nome owner_name,g.nome shared_by_name
      FROM comunidades c LEFT JOIN visitante_drive d ON d.comunidade_id=c.id
      LEFT JOIN usuarios o ON o.id=COALESCE(d.usuario_id,c.proprietario_usuario_id)
      LEFT JOIN visitante_acessos a ON a.comunidade_id=c.id AND a.usuario_id=?
      LEFT JOIN usuarios g ON g.id=a.concedido_por WHERE c.id=?`)
      .bind(user.id,context.comunidadeId).first<{owner_id:number|null;owner_name:string|null;shared_by_name:string|null}>();
    const own=info?.owner_id===user.id;
    lists.push({...common,id:'compartilhada:'+context.comunidadeId,kind:'compartilhada',
      title:own?'Minha lista':info?.owner_name?'Lista de '+info.owner_name:info?.shared_by_name?'Lista compartilhada por '+info.shared_by_name:'Lista de '+context.comunidadeNome,
      ownerName:info?.owner_name||null,sharedByName:info?.shared_by_name||null,
      access:context.permissions.includes('visitors.edit')?'EDIT':'READ',own,
      href:'/painel/visitantes?lista=compartilhada&section=pessoas&comunidade='+context.comunidadeId});
  }
  lists.sort((a,b)=>Number(b.own)-Number(a.own)||a.title.localeCompare(b.title,'pt-BR')||a.communityName.localeCompare(b.communityName,'pt-BR'));
  return Response.json({lists},{headers:{'Cache-Control':'private, no-store'}});
}
