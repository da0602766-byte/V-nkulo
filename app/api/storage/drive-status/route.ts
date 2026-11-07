import {getSessionUser} from '../../../lib/local-auth';
import {getActiveTenantContext} from '../../../lib/tenant';
import {feedDriveChecks} from '../../../lib/feed-drive-storage';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request) {
  const user=await getSessionUser();
  if(!user)return reply({error:'Sessão necessária.'},401);
  if(!user.ativo)return reply({error:'Usuário inativo.'},403);
  const {context}=await getActiveTenantContext(user,{attachDrive:false});
  if(!context||!context.permissions.includes('dashboard.view'))return reply({error:'Acesso indisponível.'},403);
  if(Number(new URL(request.url).searchParams.get('communityId'))!==context.comunidadeId)
    return reply({error:'A comunidade ativa mudou. Atualize o Feed.'},409);
  const checks=await feedDriveChecks(context);
  return reply({userId:user.id,communityId:context.comunidadeId,checks});
}
